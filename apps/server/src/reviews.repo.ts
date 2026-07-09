import type {
  AnswerAttempt,
  DueItem,
  RecallQuestion,
  RecallQuestionWithObjective,
  ReviewForecastDay,
} from '@llmstudy/shared';
import type { Db } from './db';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { getSettings } from './settings.repo';
import { addDaysIso, localTimestamp, schedule, todayIso } from './sr';

// Default new-question budget per day; the live value is the
// `new_cards_per_day` setting (settings.repo), which defaults to this.
export { NEW_CARDS_PER_DAY } from './settings.repo';

/**
 * Attempt row as stored: the shared AnswerAttempt plus the server-managed
 * interval_days column (migration 4) that undo replays from.
 */
export interface AttemptRow extends AnswerAttempt {
  interval_days: number | null;
}

/** Optional scope for the due queue. objective_id wins when both are given. */
export interface DueFilter {
  objectiveId?: number;
  domain?: string;
}

/** Extra WHERE clause (with leading AND) for a due-queue scope. */
function scopeClause(filter: DueFilter): string {
  if (filter.objectiveId !== undefined) return 'AND q.objective_id = @objective_id';
  if (filter.domain !== undefined) return 'AND o.domain = @domain';
  return '';
}

function scopeParams(filter: DueFilter): Record<string, number | string> {
  if (filter.objectiveId !== undefined) return { objective_id: filter.objectiveId };
  if (filter.domain !== undefined) return { domain: filter.domain };
  return {};
}

// The spaced Review queue serves ONLY question_format='recall' cards — MCQs
// surface via Drill/Mock exams instead and must never enter the SRS.

// Review cards: previously attempted, scheduled for today or earlier.
// Overdue-first, then insertion order, so the oldest debt is paid down first.
const reviewSelect = (scope: string) => `
  SELECT q.*, o.title AS objective_title
  FROM recall_questions q
  LEFT JOIN objectives o ON o.id = q.objective_id
  WHERE q.question_format = 'recall'
    AND q.next_review_date IS NOT NULL AND q.next_review_date <= @today ${scope}
  ORDER BY q.next_review_date, q.id
`;

// New cards: never attempted. Grouped by the objective's domain (alphabetical,
// NULL/uncategorized last, ids ascending within a domain) so the round-robin
// interleave below is deterministic.
const newSelect = (scope: string) => `
  SELECT q.*, o.title AS objective_title, o.domain AS objective_domain
  FROM recall_questions q
  LEFT JOIN objectives o ON o.id = q.objective_id
  WHERE q.question_format = 'recall' AND q.next_review_date IS NULL ${scope}
  ORDER BY (o.domain IS NULL), o.domain, q.id
`;

// How many questions got their FIRST-ever attempt today. Counting first
// attempts (not remaining NULLs) means a mid-session reload doesn't hand out
// a fresh batch of 15 on top of the ones already introduced. Only RECALL
// questions spend the budget — MCQ drill/exam attempts aren't "new cards".
const INTRODUCED_TODAY = `
  SELECT COUNT(*) AS n FROM (
    SELECT MIN(date(a.attempted_date)) AS first_day
    FROM answer_attempts a
    JOIN recall_questions q ON q.id = a.question_id
    WHERE q.question_format = 'recall'
    GROUP BY a.question_id
  ) WHERE first_day = @today
`;

interface NewRow extends RecallQuestionWithObjective {
  objective_domain: string | null;
}

/**
 * Round-robin across domains: one card per domain per cycle, domains in the
 * order they arrive (alphabetical, uncategorized last). Breaks up long
 * same-domain runs without any randomness, so the order is reproducible.
 */
function interleaveByDomain(rows: NewRow[]): NewRow[] {
  const buckets: NewRow[][] = [];
  const byDomain = new Map<string | null, NewRow[]>();
  for (const row of rows) {
    let bucket = byDomain.get(row.objective_domain);
    if (!bucket) {
      bucket = [];
      byDomain.set(row.objective_domain, bucket);
      buckets.push(bucket);
    }
    bucket.push(row);
  }
  const out: NewRow[] = [];
  for (let cycle = 0; out.length < rows.length; cycle++) {
    for (const bucket of buckets) {
      if (cycle < bucket.length) out.push(bucket[cycle]);
    }
  }
  return out;
}

/**
 * Today's queue: every scheduled review (due or overdue), then a capped,
 * domain-interleaved block of new questions. The cap budgets `new_cards_per_day`
 * (settings, default NEW_CARDS_PER_DAY) first-time questions per calendar day.
 * An optional filter scopes the queue to one objective or domain, but the cap
 * accounting stays GLOBAL: first attempts anywhere today spend the same budget.
 */
export function listDue(
  db: Db,
  today: string = todayIso(),
  filter: DueFilter = {},
): DueItem[] {
  const scope = scopeClause(filter);
  const params = { today, ...scopeParams(filter) };

  const reviews = (
    db.prepare(reviewSelect(scope)).all(params) as RecallQuestionWithObjective[]
  ).map((row) => ({ ...row, is_new: false }));

  const { n: introducedToday } = db.prepare(INTRODUCED_TODAY).get({ today }) as {
    n: number;
  };
  const budget = Math.max(0, getSettings(db).new_cards_per_day - introducedToday);
  if (budget === 0) return reviews;

  const newRows = db.prepare(newSelect(scope)).all(scopeParams(filter)) as NewRow[];
  const fresh = interleaveByDomain(newRows)
    .slice(0, budget)
    .map(({ objective_domain: _domain, ...rest }) => ({ ...rest, is_new: true }));

  return [...reviews, ...fresh];
}

/** Attempt row as SQLite stores it: selected_choice_ids is a JSON TEXT blob. */
type RawAttemptRow = Omit<AttemptRow, 'selected_choice_ids'> & {
  selected_choice_ids: string | null;
};

/** Parse the stored JSON so responses match the shared AnswerAttempt type. */
function toAttempt(row: RawAttemptRow): AttemptRow {
  return {
    ...row,
    selected_choice_ids: row.selected_choice_ids
      ? (JSON.parse(row.selected_choice_ids) as number[])
      : null,
  };
}

export function getAttempt(db: Db, id: number): AttemptRow | undefined {
  const row = db.prepare('SELECT * FROM answer_attempts WHERE id = ?').get(id) as
    | RawAttemptRow
    | undefined;
  return row ? toAttempt(row) : undefined;
}

export function listHistory(db: Db, questionId: number): AttemptRow[] {
  return (
    db
      .prepare('SELECT * FROM answer_attempts WHERE question_id = ? ORDER BY id DESC')
      .all(questionId) as RawAttemptRow[]
  ).map(toAttempt);
}

/**
 * Record an attempt at a question: insert the immutable attempt row and mirror
 * the latest state onto the parent question's cache, all in one transaction.
 * The single self-rating drives the schedule and is stored as both the SRS
 * `rating` and the `self_score` (they coincide in the MVP; kept as separate
 * columns so the scheduler can diverge from self-assessment later).
 *
 * The growing-ladder scheduler (sr.ts schedule()) reads the question's cached
 * interval_days/lapses plus the exam_date setting; the interval it produces is
 * stored on BOTH the attempt row (so undo can replay history) and the question.
 *
 * `confidence` (F18) is the optional PRE-reveal self-assessment (1 guessing,
 * 2 probably, 3 sure) — stored on the attempt for calibration analytics only;
 * it never feeds the scheduler.
 */
export function recordAttempt(
  db: Db,
  input: {
    question_id: number;
    rating: number;
    user_answer?: string | null;
    confidence?: number | null;
  },
  now: Date = new Date(),
): AttemptRow {
  const confidence = input.confidence ?? null;
  if (
    confidence !== null &&
    (!Number.isInteger(confidence) || confidence < 1 || confidence > 3)
  ) {
    throw new ValidationError('confidence must be an integer between 1 and 3, or null');
  }

  const question = db
    .prepare('SELECT interval_days, lapses FROM recall_questions WHERE id = ?')
    .get(input.question_id) as
    | { interval_days: number | null; lapses: number }
    | undefined;
  if (!question) throw new NotFoundError('question not found');

  const today = todayIso(now);
  const attemptedAt = localTimestamp(now);
  const next = schedule(
    { intervalDays: question.interval_days, lapses: question.lapses },
    input.rating, // throws on bad rating
    today,
    getSettings(db).exam_date,
  );

  const run = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO answer_attempts
           (question_id, user_answer, self_score, rating, confidence, source, attempted_date, next_review_date, interval_days)
         VALUES
           (@question_id, @user_answer, @rating, @rating, @confidence, 'review', @attempted_date, @next_review_date, @interval_days)`,
      )
      .run({
        question_id: input.question_id,
        user_answer: input.user_answer ?? null,
        rating: input.rating,
        confidence,
        attempted_date: attemptedAt,
        next_review_date: next.nextReviewDate,
        interval_days: next.intervalDays,
      });

    db.prepare(
      `UPDATE recall_questions
         SET last_attempted_date = @today,
             next_review_date    = @nextReview,
             self_score          = @rating,
             interval_days       = @interval_days,
             lapses              = @lapses,
             updated_at          = datetime('now')
       WHERE id = @question_id`,
    ).run({
      today,
      nextReview: next.nextReviewDate,
      rating: input.rating,
      interval_days: next.intervalDays,
      lapses: next.lapses,
      question_id: input.question_id,
    });

    return Number(info.lastInsertRowid);
  });

  return getAttempt(db, run())!;
}

/**
 * Record a drill/exam attempt (F22/F23). CORE INVARIANT: only source='review'
 * attempts touch the SRS — this inserts the history row ONLY, never updates
 * the question's cache columns (next_review_date / interval_days / lapses /
 * self_score / last_attempted_date), and stores next_review_date NULL on the
 * attempt. Rating is the graded MCQ outcome (4 correct, 1 wrong), so drill and
 * exam results still feed retention analytics without rescheduling anything.
 */
export function recordPracticeAttempt(
  db: Db,
  input: {
    question_id: number;
    source: 'drill' | 'exam';
    rating: number;
    selected_choice_ids: number[] | null;
    session_id?: number | null;
  },
  now: Date = new Date(),
): AttemptRow {
  const info = db
    .prepare(
      `INSERT INTO answer_attempts
         (question_id, rating, source, session_id, selected_choice_ids, attempted_date, next_review_date)
       VALUES
         (@question_id, @rating, @source, @session_id, @selected_choice_ids, @attempted_date, NULL)`,
    )
    .run({
      question_id: input.question_id,
      rating: input.rating,
      source: input.source,
      session_id: input.session_id ?? null,
      selected_choice_ids: input.selected_choice_ids
        ? JSON.stringify(input.selected_choice_ids)
        : null,
      attempted_date: localTimestamp(now),
    });
  return getAttempt(db, Number(info.lastInsertRowid))!;
}

/**
 * Undo an attempt (mis-click recovery). Only the LATEST attempt for a question
 * may be undone — attempt ids are monotonic, so "latest" is just MAX(id) — and
 * the parent question's cache is recomputed from whatever attempt remains
 * (or reset to NULLs, making the question "new" again). Returns the updated
 * question row.
 */
export function undoAttempt(db: Db, id: number): RecallQuestion {
  const attempt = getAttempt(db, id);
  if (!attempt) throw new NotFoundError('attempt not found');

  // Drill/exam attempts never touched the SRS cache, so there is nothing to
  // roll back — and deleting exam history would corrupt session scores.
  if (attempt.source !== 'review') {
    throw new ConflictError(`only review attempts can be undone (this one is '${attempt.source}')`);
  }

  const { latest } = db
    .prepare('SELECT MAX(id) AS latest FROM answer_attempts WHERE question_id = ?')
    .get(attempt.question_id) as { latest: number };
  if (id !== latest) {
    throw new ConflictError('only the latest attempt for a question can be undone');
  }

  db.transaction(() => {
    db.prepare('DELETE FROM answer_attempts WHERE id = ?').run(id);
    const previous = db
      .prepare(
        'SELECT * FROM answer_attempts WHERE question_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(attempt.question_id) as AttemptRow | undefined;

    // Lapses are replayed from the remaining history (count of 1-2 ratings),
    // not decremented, so the counter stays correct whatever was undone.
    const { lapses } = db
      .prepare(
        'SELECT COUNT(*) AS lapses FROM answer_attempts WHERE question_id = ? AND rating <= 2',
      )
      .get(attempt.question_id) as { lapses: number };

    db.prepare(
      `UPDATE recall_questions
         SET last_attempted_date = @last,
             next_review_date    = @next,
             self_score          = @score,
             interval_days       = @interval_days,
             lapses              = @lapses,
             updated_at          = datetime('now')
       WHERE id = @question_id`,
    ).run({
      last: previous ? previous.attempted_date.slice(0, 10) : null,
      next: previous ? previous.next_review_date : null,
      score: previous ? previous.self_score : null,
      interval_days: previous ? previous.interval_days : null,
      lapses,
      question_id: attempt.question_id,
    });
  })();

  return db
    .prepare('SELECT * FROM recall_questions WHERE id = ?')
    .get(attempt.question_id) as RecallQuestion;
}

/**
 * Upcoming review load: one entry per day from today+1 through today+days,
 * counting questions scheduled for exactly that date (0 for empty days).
 */
export function forecast(
  db: Db,
  days: number,
  today: string = todayIso(),
): ReviewForecastDay[] {
  const rows = db
    .prepare(
      // MCQs never get a next_review_date, but filter on format anyway so the
      // forecast stays recall-only by construction, not by accident.
      `SELECT next_review_date AS date, COUNT(*) AS count
       FROM recall_questions
       WHERE question_format = 'recall'
         AND next_review_date > @today AND next_review_date <= @end
       GROUP BY next_review_date`,
    )
    .all({ today, end: addDaysIso(today, days) }) as ReviewForecastDay[];

  const countByDate = new Map(rows.map((r) => [r.date, r.count]));
  const out: ReviewForecastDay[] = [];
  for (let i = 1; i <= days; i++) {
    const date = addDaysIso(today, i);
    out.push({ date, count: countByDate.get(date) ?? 0 });
  }
  return out;
}
