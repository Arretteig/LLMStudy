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

  it('migrations 6-7 add the domains table and the attempt confidence CHECK', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO domains (cert_path, name, weight) VALUES ('NCA-GENL', 'Core', 30)",
    ).run();
    expect(countRows(db, 'domains')).toBe(1);

    db.prepare("INSERT INTO recall_questions (question_text) VALUES ('q')").run();
    const insertAttempt = db.prepare(
      'INSERT INTO answer_attempts (question_id, rating, confidence) VALUES (1, 3, ?)',
    );
    insertAttempt.run(3);
    expect(() => insertAttempt.run(5)).toThrow(/CHECK/i); // 1-3 scale, not 1-5
  });

  it('migrations 8-10 add question_format, question_choices, and attempt source', () => {
    const db = openDb(':memory:');

    // question_format defaults to 'recall' and is CHECK-constrained.
    db.prepare("INSERT INTO recall_questions (question_text) VALUES ('plain')").run();
    const q = db
      .prepare('SELECT question_format FROM recall_questions WHERE id = 1')
      .get() as { question_format: string };
    expect(q.question_format).toBe('recall');
    expect(() =>
      db
        .prepare("INSERT INTO recall_questions (question_text, question_format) VALUES ('x', 'essay')")
        .run(),
    ).toThrow(/CHECK/i);

    // question_choices: UNIQUE(question_id, position) + delete cascade.
    const insertChoice = db.prepare(
      'INSERT INTO question_choices (question_id, position, choice_text, is_correct) VALUES (?, ?, ?, 1)',
    );
    insertChoice.run(1, 1, 'a');
    expect(() => insertChoice.run(1, 1, 'dup position')).toThrow(/UNIQUE/i);

    db.prepare("INSERT INTO recall_questions (question_text) VALUES ('victim')").run(); // id 2
    insertChoice.run(2, 1, 'doomed');
    db.prepare('DELETE FROM recall_questions WHERE id = 2').run();
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM question_choices WHERE question_id = 2').get() as {
        n: number;
      }).n,
    ).toBe(0);
    expect(countRows(db, 'question_choices')).toBe(1); // question 1's row survives

    // answer_attempts.source defaults to 'review' and is CHECK-constrained.
    db.prepare('INSERT INTO answer_attempts (question_id, rating) VALUES (1, 3)').run();
    const a = db
      .prepare('SELECT source, session_id, selected_choice_ids FROM answer_attempts')
      .get() as { source: string; session_id: null; selected_choice_ids: null };
    expect(a).toEqual({ source: 'review', session_id: null, selected_choice_ids: null });
    expect(() =>
      db
        .prepare("INSERT INTO answer_attempts (question_id, rating, source) VALUES (1, 3, 'quiz')")
        .run(),
    ).toThrow(/CHECK/i);
  });

  it('migrations 13-14 add exam_sessions and exam_items with their constraints', () => {
    const db = openDb(':memory:');
    const insertSession = db.prepare(
      'INSERT INTO exam_sessions (started_at, question_count, duration_minutes, predicted_score) VALUES (?, ?, ?, ?)',
    );
    insertSession.run('2026-07-08 09:00:00', 10, 12, 70);
    expect(() => insertSession.run('2026-07-08 09:00:00', 10, 12, 101)).toThrow(/CHECK/i);

    db.prepare("INSERT INTO recall_questions (question_text) VALUES ('q')").run();
    const insertItem = db.prepare(
      'INSERT INTO exam_items (session_id, question_id, position) VALUES (1, 1, ?)',
    );
    insertItem.run(1);
    expect(() => insertItem.run(1)).toThrow(/UNIQUE/i); // one item per position

    // Items cascade with their session.
    db.prepare('DELETE FROM exam_sessions WHERE id = 1').run();
    expect(countRows(db, 'exam_items')).toBe(0);
  });

  it('upgrades a legacy database: old attempts become source=review recall attempts', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applySchema(db);
    db.prepare("INSERT INTO recall_questions (question_text) VALUES ('legacy q')").run();
    db.prepare('INSERT INTO answer_attempts (question_id, rating) VALUES (1, 4)').run();

    runMigrations(db);

    expect(userVersion(db)).toBe(MIGRATIONS.length);
    const q = db
      .prepare('SELECT question_format FROM recall_questions WHERE id = 1')
      .get() as { question_format: string };
    expect(q.question_format).toBe('recall');
    const a = db.prepare('SELECT source FROM answer_attempts WHERE id = 1').get() as {
      source: string;
    };
    expect(a.source).toBe('review');
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
