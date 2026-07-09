import type {
  AnswerAttempt,
  DueItem,
  RecallQuestion,
  RecallQuestionWithObjective,
  ReviewForecastDay,
} from '@llmstudy/shared';
import type { Db } from './db';
import { ConflictError, NotFoundError } from './errors';
import { addDaysIso, localTimestamp, nextReviewDate, todayIso } from './sr';

/** New (never-attempted) questions introduced per day, at most. */
export const NEW_CARDS_PER_DAY = 15;

// Review cards: previously attempted, scheduled for today or earlier.
// Overdue-first, then insertion order, so the oldest debt is paid down first.
const REVIEW_SELECT = `
  SELECT q.*, o.title AS objective_title
  FROM recall_questions q
  LEFT JOIN objectives o ON o.id = q.objective_id
  WHERE q.next_review_date IS NOT NULL AND q.next_review_date <= @today
  ORDER BY q.next_review_date, q.id
`;

// New cards: never attempted. Grouped by the objective's domain (alphabetical,
// NULL/uncategorized last, ids ascending within a domain) so the round-robin
// interleave below is deterministic.
const NEW_SELECT = `
  SELECT q.*, o.title AS objective_title, o.domain AS objective_domain
  FROM recall_questions q
  LEFT JOIN objectives o ON o.id = q.objective_id
  WHERE q.next_review_date IS NULL
  ORDER BY (o.domain IS NULL), o.domain, q.id
`;

// How many questions got their FIRST-ever attempt today. Counting first
// attempts (not remaining NULLs) means a mid-session reload doesn't hand out
// a fresh batch of 15 on top of the ones already introduced.
const INTRODUCED_TODAY = `
  SELECT COUNT(*) AS n FROM (
    SELECT MIN(date(attempted_date)) AS first_day
    FROM answer_attempts
    GROUP BY question_id
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
 * domain-interleaved block of new questions. The cap budgets NEW_CARDS_PER_DAY
 * first-time questions per calendar day.
 */
export function listDue(db: Db, today: string = todayIso()): DueItem[] {
  const reviews = (
    db.prepare(REVIEW_SELECT).all({ today }) as RecallQuestionWithObjective[]
  ).map((row) => ({ ...row, is_new: false }));

  const { n: introducedToday } = db.prepare(INTRODUCED_TODAY).get({ today }) as {
    n: number;
  };
  const budget = Math.max(0, NEW_CARDS_PER_DAY - introducedToday);
  if (budget === 0) return reviews;

  const newRows = db.prepare(NEW_SELECT).all() as NewRow[];
  const fresh = interleaveByDomain(newRows)
    .slice(0, budget)
    .map(({ objective_domain: _domain, ...rest }) => ({ ...rest, is_new: true }));

  return [...reviews, ...fresh];
}

export function getAttempt(db: Db, id: number): AnswerAttempt | undefined {
  return db.prepare('SELECT * FROM answer_attempts WHERE id = ?').get(id) as
    | AnswerAttempt
    | undefined;
}

export function listHistory(db: Db, questionId: number): AnswerAttempt[] {
  return db
    .prepare('SELECT * FROM answer_attempts WHERE question_id = ? ORDER BY id DESC')
    .all(questionId) as AnswerAttempt[];
}

/**
 * Record an attempt at a question: insert the immutable attempt row and mirror
 * the latest state onto the parent question's cache, all in one transaction.
 * The single self-rating drives the schedule and is stored as both the SRS
 * `rating` and the `self_score` (they coincide in the MVP; kept as separate
 * columns so the scheduler can diverge from self-assessment later).
 */
export function recordAttempt(
  db: Db,
  input: { question_id: number; rating: number; user_answer?: string | null },
  now: Date = new Date(),
): AnswerAttempt {
  const exists = db
    .prepare('SELECT 1 FROM recall_questions WHERE id = ?')
    .get(input.question_id);
  if (!exists) throw new NotFoundError('question not found');

  const today = todayIso(now);
  const attemptedAt = localTimestamp(now);
  const nextReview = nextReviewDate(today, input.rating); // throws on bad rating

  const run = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO answer_attempts
           (question_id, user_answer, self_score, rating, attempted_date, next_review_date)
         VALUES
           (@question_id, @user_answer, @rating, @rating, @attempted_date, @next_review_date)`,
      )
      .run({
        question_id: input.question_id,
        user_answer: input.user_answer ?? null,
        rating: input.rating,
        attempted_date: attemptedAt,
        next_review_date: nextReview,
      });

    db.prepare(
      `UPDATE recall_questions
         SET last_attempted_date = @today,
             next_review_date    = @nextReview,
             self_score          = @rating,
             updated_at          = datetime('now')
       WHERE id = @question_id`,
    ).run({
      today,
      nextReview,
      rating: input.rating,
      question_id: input.question_id,
    });

    return Number(info.lastInsertRowid);
  });

  return getAttempt(db, run())!;
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
      .get(attempt.question_id) as AnswerAttempt | undefined;

    db.prepare(
      `UPDATE recall_questions
         SET last_attempted_date = @last,
             next_review_date    = @next,
             self_score          = @score,
             updated_at          = datetime('now')
       WHERE id = @question_id`,
    ).run({
      last: previous ? previous.attempted_date.slice(0, 10) : null,
      next: previous ? previous.next_review_date : null,
      score: previous ? previous.self_score : null,
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
      `SELECT next_review_date AS date, COUNT(*) AS count
       FROM recall_questions
       WHERE next_review_date > @today AND next_review_date <= @end
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
