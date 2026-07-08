import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type Db } from './db';
import { createObjective } from './objectives.repo';
import {
  createQuestion,
  deleteQuestion,
  getQuestion,
  listQuestions,
  updateQuestion,
} from './questions.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

describe('questions repository', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('creates a question linked to an objective', () => {
    const obj = createObjective(db, { title: 'Transformers', domain: 'Core ML' });
    const q = createQuestion(db, {
      objective_id: obj.id,
      question_text: 'What is self-attention?',
      difficulty: 3,
    });
    expect(q.id).toBeGreaterThan(0);
    expect(q.objective_id).toBe(obj.id);
    expect(q.next_review_date).toBeNull(); // SRS cache untouched in M2
  });

  it('lists questions with their objective title joined', () => {
    const obj = createObjective(db, { title: 'Tokenization', domain: 'Data' });
    createQuestion(db, { objective_id: obj.id, question_text: 'What is BPE?' });
    const list = listQuestions(db);
    expect(list).toHaveLength(1);
    expect(list[0].objective_title).toBe('Tokenization');
  });

  it('filters questions by objective', () => {
    const a = createObjective(db, { title: 'A' });
    const b = createObjective(db, { title: 'B' });
    createQuestion(db, { objective_id: a.id, question_text: 'qa' });
    createQuestion(db, { objective_id: b.id, question_text: 'qb' });
    expect(listQuestions(db, a.id)).toHaveLength(1);
    expect(listQuestions(db, a.id)[0].question_text).toBe('qa');
  });

  it('requires question_text', () => {
    expect(() => createQuestion(db, { difficulty: 2 })).toThrow(/question_text/);
  });

  it('rejects out-of-range difficulty via CHECK', () => {
    expect(() =>
      createQuestion(db, { question_text: 'bad', difficulty: 9 }),
    ).toThrow();
  });

  it('updates only whitelisted fields', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const updated = updateQuestion(db, q.id, {
      expected_answer: 'the answer',
      difficulty: 4,
    })!;
    expect(updated.expected_answer).toBe('the answer');
    expect(updated.difficulty).toBe(4);
  });

  it('sets objective_id to NULL when the objective is deleted (ON DELETE SET NULL)', () => {
    const obj = createObjective(db, { title: 'Temp' });
    const q = createQuestion(db, { objective_id: obj.id, question_text: 'orphan me' });
    db.prepare('DELETE FROM objectives WHERE id = ?').run(obj.id);
    expect(getQuestion(db, q.id)?.objective_id).toBeNull();
  });

  it('deletes a question', () => {
    const q = createQuestion(db, { question_text: 'delete me' });
    expect(deleteQuestion(db, q.id)).toBe(true);
    expect(getQuestion(db, q.id)).toBeUndefined();
    expect(deleteQuestion(db, q.id)).toBe(false);
  });
});
