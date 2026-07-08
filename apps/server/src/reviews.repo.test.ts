import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type Db } from './db';
import { createObjective } from './objectives.repo';
import { createQuestion, getQuestion } from './questions.repo';
import { listDue, listHistory, recordAttempt } from './reviews.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

const JULY_8 = new Date(2026, 6, 8, 9, 30, 0);

describe('reviews repository', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('records an attempt and mirrors state onto the question cache', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const attempt = recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8);

    expect(attempt.rating).toBe(4);
    expect(attempt.self_score).toBe(4); // mirrored
    expect(attempt.next_review_date).toBe('2026-07-15'); // +7 days

    const cached = getQuestion(db, q.id)!;
    expect(cached.next_review_date).toBe('2026-07-15');
    expect(cached.last_attempted_date).toBe('2026-07-08');
    expect(cached.self_score).toBe(4);
  });

  it('stores the user answer', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const attempt = recordAttempt(
      db,
      { question_id: q.id, rating: 3, user_answer: 'my answer' },
      JULY_8,
    );
    expect(attempt.user_answer).toBe('my answer');
  });

  it('due queue includes new + overdue and excludes future', () => {
    const neverAttempted = createQuestion(db, { question_text: 'new one' });
    const willBeFuture = createQuestion(db, { question_text: 'answered well' });
    recordAttempt(db, { question_id: willBeFuture.id, rating: 5 }, JULY_8); // due 2026-07-22

    // As of 2026-07-10: the new question is due, the rated-5 one is not yet.
    const due = listDue(db, '2026-07-10');
    const ids = due.map((d) => d.id);
    expect(ids).toContain(neverAttempted.id);
    expect(ids).not.toContain(willBeFuture.id);

    const newItem = due.find((d) => d.id === neverAttempted.id)!;
    expect(newItem.is_new).toBe(true);
  });

  it('a rated question becomes due again once its interval elapses', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 1 }, JULY_8); // due 2026-07-09
    expect(listDue(db, '2026-07-08').map((d) => d.id)).not.toContain(q.id);
    expect(listDue(db, '2026-07-09').map((d) => d.id)).toContain(q.id);
  });

  it('keeps a full attempt history, newest first', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 1 }, JULY_8);
    recordAttempt(db, { question_id: q.id, rating: 5 }, JULY_8);
    const history = listHistory(db, q.id);
    expect(history).toHaveLength(2);
    expect(history[0].rating).toBe(5); // most recent first
  });

  it('cascades: deleting a question removes its attempts', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 2 }, JULY_8);
    db.prepare('DELETE FROM recall_questions WHERE id = ?').run(q.id);
    expect(listHistory(db, q.id)).toHaveLength(0);
  });

  it('rejects an invalid rating', () => {
    const q = createQuestion(db, { question_text: 'q' });
    expect(() => recordAttempt(db, { question_id: q.id, rating: 9 }, JULY_8)).toThrow(
      /invalid rating/,
    );
  });

  it('throws when the question does not exist', () => {
    expect(() => recordAttempt(db, { question_id: 999, rating: 3 }, JULY_8)).toThrow(
      /not found/,
    );
  });
});
