import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applySchema, MIGRATIONS, openDb, runMigrations, type Db } from './db';

function userVersion(db: Db): number {
  return db.pragma('user_version', { simple: true }) as number;
}

function countRows(db: Db, table: string): number {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return n;
}

describe('migration runner', () => {
  it('brings a fresh database to the latest version', () => {
    const db = openDb(':memory:');
    expect(userVersion(db)).toBe(MIGRATIONS.length);
  });

  it('applying schema + migrations again is a no-op', () => {
    const db = openDb(':memory:');
    applySchema(db);
    runMigrations(db);
    expect(userVersion(db)).toBe(MIGRATIONS.length);
  });

  it('upgrades a legacy baseline database and keeps its data', () => {
    // Simulate a database created before the runner existed: baseline schema
    // applied manually, user_version still 0, with a couple of live rows.
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applySchema(db);
    expect(userVersion(db)).toBe(0);
    db.prepare("INSERT INTO objectives (title) VALUES ('kept objective')").run();
    db.prepare("INSERT INTO recall_questions (question_text) VALUES ('kept question')").run();

    runMigrations(db);

    expect(userVersion(db)).toBe(MIGRATIONS.length);
    expect(countRows(db, 'objectives')).toBe(1);
    expect(countRows(db, 'recall_questions')).toBe(1);
  });

  it('migration 1 makes INSERT OR IGNORE dedupe unlinked questions', () => {
    // SQLite UNIQUE treats NULLs as distinct, so without the partial index the
    // baseline UNIQUE(objective_id, question_text) would let both rows in.
    const db = openDb(':memory:');
    const insert = db.prepare(
      'INSERT OR IGNORE INTO recall_questions (objective_id, question_text) VALUES (NULL, ?)',
    );
    insert.run('duplicate unlinked question');
    insert.run('duplicate unlinked question');
    expect(countRows(db, 'recall_questions')).toBe(1);
  });
});
