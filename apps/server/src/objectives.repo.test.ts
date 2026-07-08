import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type Db } from './db';
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

  it('returns undefined when updating a missing objective', () => {
    expect(updateObjective(db, 4242, { status: 'confident' })).toBeUndefined();
    expect(getObjective(db, 4242)).toBeUndefined();
  });
});
