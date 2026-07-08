import type { AnswerAttempt, DueItem } from '@llmstudy/shared';
import type { Db } from './db';
import { localTimestamp, nextReviewDate, todayIso } from './sr';

// Raw row shape from the due-queue query (is_new comes back as 0/1).
interface DueRow extends Omit<DueItem, 'is_new'> {
  is_new: number;
}

const DUE_SELECT = `
  SELECT q.*, o.title AS objective_title, (q.next_review_date IS NULL) AS is_new
  FROM recall_questions q
  LEFT JOIN objectives o ON o.id = q.objective_id
  WHERE q.next_review_date IS NULL OR q.next_review_date <= @today
  ORDER BY (q.next_review_date IS NULL), q.next_review_date, q.id
`;

/** Questions due today or overdue (never-attempted questions count as due). */
export function listDue(db: Db, today: string = todayIso()): DueItem[] {
  const rows = db.prepare(DUE_SELECT).all({ today }) as DueRow[];
  return rows.map(({ is_new, ...rest }) => ({ ...rest, is_new: is_new === 1 }));
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
  if (!exists) throw new Error('question not found');

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
