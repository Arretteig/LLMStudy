import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type Db } from './db';
import { ConflictError, NotFoundError } from './errors';
import { createObjective } from './objectives.repo';
import { createQuestion, getQuestion } from './questions.repo';
import {
  forecast,
  listDue,
  listHistory,
  NEW_CARDS_PER_DAY,
  recordAttempt,
  undoAttempt,
} from './reviews.repo';
import { seed } from './seed';

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
      NotFoundError,
    );
  });
});

describe('listDue — new-card cap and domain interleaving', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('caps new cards at NEW_CARDS_PER_DAY on the full seeded question bank', () => {
    seed(db);
    const total = db
      .prepare('SELECT COUNT(*) AS n FROM recall_questions')
      .get() as { n: number };
    expect(total.n).toBeGreaterThan(NEW_CARDS_PER_DAY); // 100 in the seed

    const due = listDue(db, '2026-07-10');
    const reviews = due.filter((d) => !d.is_new);
    expect(reviews).toHaveLength(0); // nothing attempted yet
    expect(due).toHaveLength(NEW_CARDS_PER_DAY);
  });

  it('counts questions first attempted today against the cap', () => {
    seed(db);
    const firstBatch = listDue(db, '2026-07-08');
    // First-attempt 5 new questions "today" — a page reload must not hand out
    // another full batch of 15 on top of them.
    for (const item of firstBatch.slice(0, 5)) {
      recordAttempt(db, { question_id: item.id, rating: 5 }, JULY_8);
    }
    const reloaded = listDue(db, '2026-07-08');
    expect(reloaded.filter((d) => d.is_new)).toHaveLength(NEW_CARDS_PER_DAY - 5);
  });

  it('lists scheduled reviews (overdue first) before new cards', () => {
    const overdue = createQuestion(db, { question_text: 'overdue' });
    const dueToday = createQuestion(db, { question_text: 'due today' });
    const brandNew = createQuestion(db, { question_text: 'brand new' });
    recordAttempt(db, { question_id: overdue.id, rating: 1 }, JULY_8); // due 07-09
    recordAttempt(db, { question_id: dueToday.id, rating: 2 }, JULY_8); // due 07-10

    const due = listDue(db, '2026-07-10');
    expect(due.map((d) => d.id)).toEqual([overdue.id, dueToday.id, brandNew.id]);
    expect(due.map((d) => d.is_new)).toEqual([false, false, true]);
  });

  it('interleaves the new-card block round-robin across domains', () => {
    const domains = ['Data', 'Ops', 'Theory'];
    for (const domain of domains) {
      const obj = createObjective(db, { title: `${domain} objective`, domain });
      for (let i = 0; i < 5; i++) {
        createQuestion(db, { objective_id: obj.id, question_text: `${domain} q${i}` });
      }
    }

    const due = listDue(db, '2026-07-10');
    expect(due).toHaveLength(15);
    // Deterministic strict cycle: Data, Ops, Theory, Data, Ops, Theory, ...
    due.forEach((item, i) => {
      expect(item.question_text.startsWith(domains[i % domains.length])).toBe(true);
    });
    // The property that matters: no long same-domain runs.
    for (let i = 2; i < due.length; i++) {
      const run = [due[i - 2], due[i - 1], due[i]].map((d) => d.objective_title);
      expect(new Set(run).size).toBeGreaterThan(1);
    }
  });

  it('puts uncategorized new cards after categorized domains', () => {
    createQuestion(db, { question_text: 'no domain' });
    const obj = createObjective(db, { title: 'Beta objective', domain: 'Beta' });
    createQuestion(db, { objective_id: obj.id, question_text: 'beta q' });

    const due = listDue(db, '2026-07-10');
    expect(due.map((d) => d.question_text)).toEqual(['beta q', 'no domain']);
  });
});

describe('undoAttempt', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('restores the cache from the previous attempt', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8); // next 07-15
    const second = recordAttempt(
      db,
      { question_id: q.id, rating: 1 },
      new Date(2026, 6, 9, 10, 0, 0), // next 07-10
    );

    const question = undoAttempt(db, second.id);
    expect(question.last_attempted_date).toBe('2026-07-08');
    expect(question.next_review_date).toBe('2026-07-15');
    expect(question.self_score).toBe(4);
    expect(listHistory(db, q.id)).toHaveLength(1);
  });

  it('resets the question to "new" when the only attempt is undone', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const attempt = recordAttempt(db, { question_id: q.id, rating: 5 }, JULY_8);

    const question = undoAttempt(db, attempt.id);
    expect(question.last_attempted_date).toBeNull();
    expect(question.next_review_date).toBeNull();
    expect(question.self_score).toBeNull();

    const item = listDue(db, '2026-07-08').find((d) => d.id === q.id)!;
    expect(item.is_new).toBe(true);
  });

  it('rejects undoing a non-latest attempt and deletes nothing', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const first = recordAttempt(db, { question_id: q.id, rating: 3 }, JULY_8);
    recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8);

    expect(() => undoAttempt(db, first.id)).toThrow(ConflictError);
    expect(listHistory(db, q.id)).toHaveLength(2);
  });

  it('throws NotFoundError for an unknown attempt id', () => {
    expect(() => undoAttempt(db, 999)).toThrow(NotFoundError);
  });
});

describe('forecast', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('buckets upcoming reviews by date with zero-filled empty days', () => {
    const q1 = createQuestion(db, { question_text: 'q1' });
    const q2 = createQuestion(db, { question_text: 'q2' });
    const q3 = createQuestion(db, { question_text: 'q3' });
    const q4 = createQuestion(db, { question_text: 'q4' });
    recordAttempt(db, { question_id: q1.id, rating: 1 }, JULY_8); // 07-09
    recordAttempt(db, { question_id: q2.id, rating: 1 }, JULY_8); // 07-09
    recordAttempt(db, { question_id: q3.id, rating: 3 }, JULY_8); // 07-12
    recordAttempt(db, { question_id: q4.id, rating: 5 }, JULY_8); // 07-22, outside window

    const days = forecast(db, 7, '2026-07-08');
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: '2026-07-09', count: 2 });
    expect(days[1]).toEqual({ date: '2026-07-10', count: 0 });
    expect(days[3]).toEqual({ date: '2026-07-12', count: 1 });
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(3);
  });

  it('excludes questions due today and never-attempted questions', () => {
    const dueNow = createQuestion(db, { question_text: 'due today' });
    createQuestion(db, { question_text: 'never attempted' });
    recordAttempt(db, { question_id: dueNow.id, rating: 1 }, JULY_8); // 07-09

    const days = forecast(db, 7, '2026-07-09'); // its due date IS today
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });
});
