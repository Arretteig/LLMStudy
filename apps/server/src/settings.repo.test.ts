import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, runMigrations, type Db } from './db';
import { ValidationError } from './errors';
import { getSettings, NEW_CARDS_PER_DAY, updateSettings } from './settings.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  runMigrations(db);
  return db;
}

describe('settings repository', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('returns defaults when nothing is stored', () => {
    expect(getSettings(db)).toEqual({
      exam_date: null,
      new_cards_per_day: NEW_CARDS_PER_DAY,
    });
  });

  it('round-trips a full update', () => {
    const updated = updateSettings(db, { exam_date: '2026-10-01', new_cards_per_day: 20 });
    expect(updated).toEqual({ exam_date: '2026-10-01', new_cards_per_day: 20 });
    expect(getSettings(db)).toEqual(updated);
  });

  it('a partial update leaves other keys alone', () => {
    updateSettings(db, { exam_date: '2026-10-01', new_cards_per_day: 20 });
    const updated = updateSettings(db, { new_cards_per_day: 5 });
    expect(updated).toEqual({ exam_date: '2026-10-01', new_cards_per_day: 5 });
  });

  it('exam_date null clears the setting (row deleted)', () => {
    updateSettings(db, { exam_date: '2026-10-01' });
    expect(updateSettings(db, { exam_date: null }).exam_date).toBeNull();
    const rows = db.prepare("SELECT * FROM app_settings WHERE key = 'exam_date'").all();
    expect(rows).toHaveLength(0);
  });

  it('rejects a malformed exam_date', () => {
    expect(() => updateSettings(db, { exam_date: 'next tuesday' })).toThrow(
      ValidationError,
    );
    expect(() =>
      updateSettings(db, { exam_date: '2026-1-1' as string }),
    ).toThrow(ValidationError);
  });

  it('accepts the new_cards_per_day bounds and rejects everything outside', () => {
    expect(updateSettings(db, { new_cards_per_day: 0 }).new_cards_per_day).toBe(0);
    expect(updateSettings(db, { new_cards_per_day: 100 }).new_cards_per_day).toBe(100);
    for (const bad of [-1, 101, 2.5, NaN, '10' as unknown as number]) {
      expect(() => updateSettings(db, { new_cards_per_day: bad })).toThrow(
        ValidationError,
      );
    }
  });
});
