import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type Db } from './db';
import { NotFoundError, ValidationError } from './errors';
import {
  createObjective,
  getObjective,
  listObjectives,
  updateObjective,
} from './objectives.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

describe('objectives repository', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('creates an objective with sensible defaults', () => {
    const created = createObjective(db, { title: 'Transformers', domain: 'Core ML' });
    expect(created.id).toBeGreaterThan(0);
    expect(created.status).toBe('not_started');
    expect(created.cert_path).toBe('NCA-GENL');
    expect(created.confidence).toBeNull();
  });

  it('lists objectives ordered by domain then title', () => {
    createObjective(db, { title: 'Zeta', domain: 'B' });
    createObjective(db, { title: 'Alpha', domain: 'A' });
    const all = listObjectives(db);
    expect(all.map((o) => o.title)).toEqual(['Alpha', 'Zeta']);
  });

  it('updates only whitelisted fields and bumps updated_at', () => {
    const created = createObjective(db, { title: 'RLHF' });
    const updated = updateObjective(db, created.id, {
      status: 'learning',
      confidence: 3,
      id: 999, // must be ignored — not writable
    })!;
    expect(updated.id).toBe(created.id);
    expect(updated.status).toBe('learning');
    expect(updated.confidence).toBe(3);
  });

  it('requires a title', () => {
    expect(() => createObjective(db, { domain: 'Core ML' })).toThrow(/title/);
  });

  it('rejects out-of-range confidence via the CHECK constraint', () => {
    expect(() => createObjective(db, { title: 'Bad', confidence: 9 })).toThrow();
  });

  it('throws NotFoundError when updating a missing objective', () => {
    expect(() => updateObjective(db, 4242, { status: 'confident' })).toThrow(
      NotFoundError,
    );
    expect(getObjective(db, 4242)).toBeUndefined();
  });

  it('rejects a blank or non-string title on update', () => {
    const created = createObjective(db, { title: 'Keep me' });
    expect(() => updateObjective(db, created.id, { title: '   ' })).toThrow(
      ValidationError,
    );
    expect(() => updateObjective(db, created.id, { title: 42 })).toThrow(
      ValidationError,
    );
    expect(getObjective(db, created.id)!.title).toBe('Keep me');
  });

  it('rejects malformed review dates, accepts ISO dates and null', () => {
    expect(() =>
      createObjective(db, { title: 'Bad date', next_review_date: 'July 9' }),
    ).toThrow(ValidationError);

    const created = createObjective(db, { title: 'Dated', next_review_date: '2026-07-09' });
    expect(created.next_review_date).toBe('2026-07-09');

    expect(() =>
      updateObjective(db, created.id, { last_reviewed_date: '2026-7-9' }),
    ).toThrow(ValidationError);
    expect(updateObjective(db, created.id, { next_review_date: null }).next_review_date).toBeNull();
  });
});
