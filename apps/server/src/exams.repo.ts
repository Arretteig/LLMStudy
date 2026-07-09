// Mock exams (F23): timed, weight-proportional MCQ sessions with a frozen
// item snapshot (exam_items), post-finish grading, and a readiness estimate.
// CORE INVARIANT: finishing an exam records source='exam' attempt rows only —
// the SRS cache columns on recall_questions are never touched.
import type {
  ExamDomainScore,
  ExamItemView,
  ExamReadinessEstimate,
  ExamResult,
  ExamReviewItem,
  ExamSession,
  ExamSessionDetail,
} from '@llmstudy/shared';
import type { Db } from './db';
import { weightByDomain } from './domains.repo';
import { assertChoiceIdArray, exactSetMatch } from './drill.repo';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { getChoices } from './questions.repo';
import { recordPracticeAttempt } from './reviews.repo';
import { localTimestamp } from './sr';

/** Smallest pool (and smallest exam) that still resembles a real exam form. */
export const EXAM_MIN_QUESTIONS = 10;
/** Default exam size (the real NCA-GENL runs 50-ish items). */
export const EXAM_DEFAULT_QUESTIONS = 50;
/** Pacing: real exam is ~60 items in ~60-90 minutes; 1.2 min/item splits it. */
export const EXAM_MINUTES_PER_QUESTION = 1.2;
/** +/- band (percent) on the readiness estimate — irreducible day-of noise. */
export const READINESS_BAND = 6;

// ---------------------------------------------------------------------------
// Weight-proportional assembly
// ---------------------------------------------------------------------------

interface PoolEntry {
  domain: string;
  available: number;
  weight: number | null;
}

/**
 * Split `target` seats across domains proportionally to their official exam
 * weights, capped by what each domain actually has (largest-remainder method).
 * When a domain runs out of items its deficit stays in `remaining` and the
 * next pass redistributes it across the domains that still have capacity,
 * again proportionally to weight. Domains with no known weight get seats only
 * when every open domain is unweighted (then: equal shares) — they still
 * absorb deficit redistribution that way.
 */
export function allocateByWeight(
  target: number,
  entries: PoolEntry[],
): Map<string, number> {
  const alloc = new Map(entries.map((e) => [e.domain, 0]));
  let remaining = target;

  while (remaining > 0) {
    const open = entries.filter((e) => e.available - alloc.get(e.domain)! > 0);
    if (open.length === 0) break; // unreachable while target <= total pool

    let weights = open.map((e) => e.weight ?? 0);
    if (weights.every((w) => w === 0)) weights = open.map(() => 1);
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    // Largest remainder: floor the exact quotas (capped by capacity), then
    // hand out the leftover seats by biggest fractional part.
    const raw = open.map((_, i) => (remaining * weights[i]) / totalWeight);
    const grants = open.map((e, i) =>
      Math.min(Math.floor(raw[i]), e.available - alloc.get(e.domain)!),
    );
    let leftover = remaining - grants.reduce((s, g) => s + g, 0);
    const byFraction = open
      .map((_, i) => i)
      .sort((a, b) => raw[b] - Math.floor(raw[b]) - (raw[a] - Math.floor(raw[a])) || a - b);
    for (const i of byFraction) {
      if (leftover === 0) break;
      const capacityLeft = open[i].available - alloc.get(open[i].domain)! - grants[i];
      if (capacityLeft > 0) {
        grants[i] += 1;
        leftover -= 1;
      }
    }

    let granted = 0;
    open.forEach((e, i) => {
      alloc.set(e.domain, alloc.get(e.domain)! + grants[i]);
      granted += grants[i];
    });
    remaining -= granted; // granted >= 1 whenever any open capacity exists
  }
  return alloc;
}

/** In-place-free Fisher-Yates. Math.random is fine — exam forms should vary. */
function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Row plumbing
// ---------------------------------------------------------------------------

interface ItemRow {
  id: number;
  session_id: number;
  question_id: number;
  position: number;
  flagged: number;
  selected_choice_ids: string | null;
  is_correct: number | null;
  time_spent_ms: number | null;
}

function parseSelected(raw: string | null): number[] | null {
  return raw ? (JSON.parse(raw) as number[]) : null;
}

export function getSession(db: Db, id: number): ExamSession | undefined {
  return db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(id) as
    | ExamSession
    | undefined;
}

function mustGetSession(db: Db, id: number): ExamSession {
  const session = getSession(db, id);
  if (!session) throw new NotFoundError('exam session not found');
  return session;
}

/** All sessions, newest-first. */
export function listExams(db: Db): ExamSession[] {
  return db.prepare('SELECT * FROM exam_sessions ORDER BY id DESC').all() as ExamSession[];
}

/** One item as shown while the session runs — choices carry NO answers. */
function toItemView(
  db: Db,
  item: Pick<ItemRow, 'position' | 'question_id' | 'flagged' | 'selected_choice_ids'> & {
    question_text: string;
  },
): ExamItemView {
  const choices = getChoices(db, item.question_id);
  return {
    position: item.position,
    question_id: item.question_id,
    question_text: item.question_text,
    multi_select: choices.filter((c) => c.is_correct).length > 1,
    flagged: item.flagged === 1,
    selected_choice_ids: parseSelected(item.selected_choice_ids),
    choices: choices.map(({ id, position, choice_text }) => ({ id, position, choice_text })),
  };
}

const ITEMS_WITH_QUESTION = `
  SELECT i.*, q.question_text, q.objective_id,
         o.title AS objective_title, o.domain AS domain
  FROM exam_items i
  JOIN recall_questions q ON q.id = i.question_id
  LEFT JOIN objectives o ON o.id = q.objective_id
  WHERE i.session_id = ?
  ORDER BY i.position
`;

type JoinedItemRow = ItemRow & {
  question_text: string;
  objective_id: number | null;
  objective_title: string | null;
  domain: string | null;
};

function listItems(db: Db, sessionId: number): JoinedItemRow[] {
  return db.prepare(ITEMS_WITH_QUESTION).all(sessionId) as JoinedItemRow[];
}

function toDetail(db: Db, session: ExamSession): ExamSessionDetail {
  return {
    ...session,
    items: listItems(db, session.id).map((item) => toItemView(db, item)),
  };
}

/** The post-exam review payload: graded items + per-domain rollup. */
function toResult(db: Db, session: ExamSession): ExamResult {
  const weights = weightByDomain(db);
  const items = listItems(db, session.id);

  const review: ExamReviewItem[] = items.map((item) => {
    const choices = getChoices(db, item.question_id);
    return {
      position: item.position,
      question_id: item.question_id,
      question_text: item.question_text,
      objective_id: item.objective_id,
      objective_title: item.objective_title,
      domain: item.domain,
      multi_select: choices.filter((c) => c.is_correct).length > 1,
      flagged: item.flagged === 1,
      selected_choice_ids: parseSelected(item.selected_choice_ids),
      is_correct: item.is_correct === 1,
      choices,
    };
  });

  // Domain rollup via question -> objective -> domain; unlinked questions use
  // the dashboard's 'Uncategorized' convention. Heaviest exam weight first.
  const byDomain = new Map<string, ExamDomainScore>();
  for (const item of review) {
    const key = item.domain ?? 'Uncategorized';
    const entry = byDomain.get(key) ?? {
      domain: key,
      weight: weights.get(key) ?? null,
      correct: 0,
      total: 0,
    };
    entry.total += 1;
    if (item.is_correct) entry.correct += 1;
    byDomain.set(key, entry);
  }
  const domainScores = [...byDomain.values()].sort(
    (a, b) => (b.weight ?? -1) - (a.weight ?? -1) || a.domain.localeCompare(b.domain),
  );

  return { ...session, domainScores, review };
}

/** In-progress sessions render as a detail; completed ones as a full result. */
export function getExam(db: Db, id: number): ExamSessionDetail | ExamResult {
  const session = mustGetSession(db, id);
  return session.completed_at === null ? toDetail(db, session) : toResult(db, session);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export function createExam(
  db: Db,
  input: { question_count?: unknown; predicted_score?: unknown },
  now: Date = new Date(),
): ExamSessionDetail {
  const pool = db
    .prepare(
      `SELECT q.id, COALESCE(o.domain, 'Uncategorized') AS domain
       FROM recall_questions q
       LEFT JOIN objectives o ON o.id = q.objective_id
       WHERE q.question_format = 'mcq'`,
    )
    .all() as { id: number; domain: string }[];

  if (pool.length < EXAM_MIN_QUESTIONS) {
    throw new ValidationError(
      `need at least ${EXAM_MIN_QUESTIONS} MCQ items to start a mock exam (have ${pool.length})`,
    );
  }

  let questionCount = Math.min(EXAM_DEFAULT_QUESTIONS, pool.length);
  if (input.question_count !== undefined && input.question_count !== null) {
    if (!Number.isInteger(input.question_count)) {
      throw new ValidationError('question_count must be an integer');
    }
    questionCount = Math.min(
      pool.length,
      Math.max(EXAM_MIN_QUESTIONS, input.question_count as number),
    );
  }

  let predictedScore: number | null = null;
  if (input.predicted_score !== undefined && input.predicted_score !== null) {
    const p = input.predicted_score;
    if (!Number.isInteger(p) || (p as number) < 0 || (p as number) > 100) {
      throw new ValidationError('predicted_score must be an integer between 0 and 100');
    }
    predictedScore = p as number;
  }

  // Bucket the pool by domain, allocate seats by exam weight, then pick
  // randomly within each domain and shuffle the final order.
  const buckets = new Map<string, number[]>();
  for (const row of pool) {
    const bucket = buckets.get(row.domain) ?? [];
    bucket.push(row.id);
    buckets.set(row.domain, bucket);
  }
  const weights = weightByDomain(db);
  const allocation = allocateByWeight(
    questionCount,
    [...buckets.entries()].map(([domain, ids]) => ({
      domain,
      available: ids.length,
      weight: weights.get(domain) ?? null,
    })),
  );
  const picked: number[] = [];
  for (const [domain, ids] of buckets) {
    picked.push(...shuffle(ids).slice(0, allocation.get(domain) ?? 0));
  }
  const ordered = shuffle(picked);

  const durationMinutes = Math.round(questionCount * EXAM_MINUTES_PER_QUESTION);

  const create = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO exam_sessions (started_at, question_count, duration_minutes, predicted_score)
         VALUES (@started_at, @question_count, @duration_minutes, @predicted_score)`,
      )
      .run({
        started_at: localTimestamp(now),
        question_count: questionCount,
        duration_minutes: durationMinutes,
        predicted_score: predictedScore,
      });
    const sessionId = Number(info.lastInsertRowid);

    const insertItem = db.prepare(
      'INSERT INTO exam_items (session_id, question_id, position) VALUES (?, ?, ?)',
    );
    ordered.forEach((questionId, i) => insertItem.run(sessionId, questionId, i + 1));
    return sessionId;
  });

  return toDetail(db, getSession(db, create())!);
}

// ---------------------------------------------------------------------------
// Item updates while the clock runs
// ---------------------------------------------------------------------------

export function updateExamItem(
  db: Db,
  sessionId: number,
  position: number,
  patch: { selected_choice_ids?: unknown; flagged?: unknown; time_spent_ms?: unknown },
): ExamItemView {
  const session = mustGetSession(db, sessionId);
  if (session.completed_at !== null) {
    throw new ConflictError('exam session is already completed');
  }

  const item = db
    .prepare('SELECT * FROM exam_items WHERE session_id = ? AND position = ?')
    .get(sessionId, position) as ItemRow | undefined;
  if (!item) throw new NotFoundError('exam item not found');

  const sets: string[] = [];
  const params: Record<string, unknown> = { id: item.id };

  if (patch.selected_choice_ids !== undefined) {
    if (patch.selected_choice_ids === null) {
      params.selected_choice_ids = null; // explicit null clears the answer
    } else {
      const selected = assertChoiceIdArray(patch.selected_choice_ids);
      const known = new Set(getChoices(db, item.question_id).map((c) => c.id));
      for (const id of selected) {
        if (!known.has(id)) {
          throw new ValidationError(
            `choice ${id} does not belong to question ${item.question_id}`,
          );
        }
      }
      params.selected_choice_ids = JSON.stringify(selected);
    }
    sets.push('selected_choice_ids = @selected_choice_ids');
  }
  if (patch.flagged !== undefined) {
    if (typeof patch.flagged !== 'boolean') {
      throw new ValidationError('flagged must be a boolean');
    }
    sets.push('flagged = @flagged');
    params.flagged = patch.flagged ? 1 : 0;
  }
  if (patch.time_spent_ms !== undefined) {
    if (!Number.isInteger(patch.time_spent_ms) || (patch.time_spent_ms as number) < 0) {
      throw new ValidationError('time_spent_ms must be a non-negative integer');
    }
    sets.push('time_spent_ms = @time_spent_ms');
    params.time_spent_ms = patch.time_spent_ms;
  }

  if (sets.length > 0) {
    db.prepare(`UPDATE exam_items SET ${sets.join(', ')} WHERE id = @id`).run(params);
  }

  const updated = db
    .prepare(
      `SELECT i.*, q.question_text FROM exam_items i
       JOIN recall_questions q ON q.id = i.question_id WHERE i.id = ?`,
    )
    .get(item.id) as ItemRow & { question_text: string };
  return toItemView(db, updated);
}

// ---------------------------------------------------------------------------
// Finish + grade
// ---------------------------------------------------------------------------

export function finishExam(db: Db, id: number, now: Date = new Date()): ExamResult {
  const session = mustGetSession(db, id);
  if (session.completed_at !== null) {
    throw new ConflictError('exam session is already completed');
  }

  const items = listItems(db, id);
  const finish = db.transaction(() => {
    let correctCount = 0;
    const setCorrect = db.prepare('UPDATE exam_items SET is_correct = ? WHERE id = ?');

    for (const item of items) {
      const correctIds = getChoices(db, item.question_id)
        .filter((c) => c.is_correct)
        .map((c) => c.id);
      const selected = parseSelected(item.selected_choice_ids);
      // Exact set match; unanswered counts as wrong.
      const isCorrect = selected !== null && exactSetMatch(selected, correctIds);
      if (isCorrect) correctCount += 1;
      setCorrect.run(isCorrect ? 1 : 0, item.id);

      // History row only — rating mirrors the drill convention (4/1), and the
      // question's SRS cache is deliberately NOT touched (core invariant).
      recordPracticeAttempt(
        db,
        {
          question_id: item.question_id,
          source: 'exam',
          session_id: id,
          rating: isCorrect ? 4 : 1,
          selected_choice_ids: selected,
        },
        now,
      );
    }

    db.prepare(
      'UPDATE exam_sessions SET completed_at = @completed_at, score_percent = @score WHERE id = @id',
    ).run({
      completed_at: localTimestamp(now),
      score: (100 * correctCount) / items.length,
      id,
    });
  });
  finish();

  return toResult(db, getSession(db, id)!);
}

// ---------------------------------------------------------------------------
// Readiness (median of the last two mocks)
// ---------------------------------------------------------------------------

export function examReadiness(db: Db): ExamReadinessEstimate {
  const completed = db
    .prepare(
      `SELECT id, completed_at, score_percent, predicted_score
       FROM exam_sessions
       WHERE completed_at IS NOT NULL
       ORDER BY completed_at DESC, id DESC`,
    )
    .all() as ExamReadinessEstimate['history'];

  // Median of the two most recent completed scores = their mean; a single
  // mock is its own estimate. Older mocks only show in the history.
  let estimate: number | null = null;
  if (completed.length === 1) estimate = completed[0].score_percent;
  else if (completed.length >= 2) {
    estimate = (completed[0].score_percent + completed[1].score_percent) / 2;
  }

  return {
    mockCount: completed.length,
    estimate,
    band: READINESS_BAND,
    history: completed.slice(0, 10),
  };
}
