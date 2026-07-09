import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root, derived from this file's location (apps/server/src -> ../../..). */
export const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const DEFAULT_DB_PATH = join(REPO_ROOT, 'db', 'data', 'study.db');

/**
 * Resolved lazily (never captured at import time) so tests and the CLI can set
 * DB_PATH after importing this module and still get the override.
 */
export function resolveDbPath(): string {
  return process.env.DB_PATH ?? DEFAULT_DB_PATH;
}

const SCHEMA_PATH = join(REPO_ROOT, 'db', 'schema.sql');

export type Db = Database.Database;

/** Apply schema.sql (idempotent — every statement is CREATE ... IF NOT EXISTS). */
export function applySchema(db: Db): void {
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
// db/schema.sql is the FROZEN baseline — never edit it again. Every future
// schema change is appended to MIGRATIONS below, and each migration runs
// exactly once per database: PRAGMA user_version counts how many have been
// applied, so an existing database only runs the new tail while a fresh one
// runs all of them once (right after the baseline schema).
//
// Entries are SQL strings today; a `(db) => void` function is also accepted
// for the rare change that needs data-shuffling logic.

type Migration = string | ((db: Db) => void);

export const MIGRATIONS: Migration[] = [
  // 1: dedupe unlinked recall questions. SQLite UNIQUE treats NULLs as
  // distinct, so the baseline UNIQUE(objective_id, question_text) never fires
  // when objective_id IS NULL — this partial index makes the seeder's
  // INSERT OR IGNORE actually skip duplicate unlinked questions.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_unlinked_text
     ON recall_questions(question_text) WHERE objective_id IS NULL;`,

  // 2-4: growing-ladder scheduler (F11). Each question caches its current
  // interval (grows on success, resets on a lapse) and a lapse counter; each
  // attempt records the interval it produced so undo can replay history.
  `ALTER TABLE recall_questions ADD COLUMN interval_days INTEGER;`,
  `ALTER TABLE recall_questions ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE answer_attempts ADD COLUMN interval_days INTEGER;`,

  // 5: single-user key-value settings (F12) — exam_date, new_cards_per_day.
  `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));`,

  // 6: official cert domains + exam weights (F16). Populated by seed.ts from
  // the seed JSON's _domain_weights (INSERT OR IGNORE keeps re-seeds no-ops).
  `CREATE TABLE IF NOT EXISTS domains (cert_path TEXT NOT NULL, name TEXT NOT NULL, weight INTEGER NOT NULL, PRIMARY KEY (cert_path, name));`,

  // 7: pre-reveal confidence on attempts (F18): 1 guessing, 2 probably, 3 sure.
  `ALTER TABLE answer_attempts ADD COLUMN confidence INTEGER CHECK (confidence BETWEEN 1 AND 3);`,

  // 8-9: MCQ items (F21). 'recall' cards keep living in the spaced Review
  // queue; 'mcq' items are served by Drill/Mock exams and NEVER enter the SRS.
  `ALTER TABLE recall_questions ADD COLUMN question_format TEXT NOT NULL DEFAULT 'recall' CHECK (question_format IN ('recall','mcq'));`,
  `CREATE TABLE IF NOT EXISTS question_choices (id INTEGER PRIMARY KEY, question_id INTEGER NOT NULL REFERENCES recall_questions(id) ON DELETE CASCADE, position INTEGER NOT NULL, choice_text TEXT NOT NULL, is_correct INTEGER NOT NULL DEFAULT 0, rationale TEXT, UNIQUE (question_id, position));`,

  // 10-12: attempt provenance (F22/F23). Only source='review' attempts drive
  // the SRS; drill/exam attempts are history-only (next_review_date NULL).
  `ALTER TABLE answer_attempts ADD COLUMN source TEXT NOT NULL DEFAULT 'review' CHECK (source IN ('review','drill','exam'));`,
  `ALTER TABLE answer_attempts ADD COLUMN session_id INTEGER;`,
  `ALTER TABLE answer_attempts ADD COLUMN selected_choice_ids TEXT;`, // JSON int array

  // 13-14: mock exams (F23) — a session plus its per-question item snapshot.
  `CREATE TABLE IF NOT EXISTS exam_sessions (id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT, question_count INTEGER NOT NULL, duration_minutes INTEGER NOT NULL, predicted_score INTEGER CHECK (predicted_score BETWEEN 0 AND 100), score_percent REAL, created_at TEXT NOT NULL DEFAULT (datetime('now')));`,
  `CREATE TABLE IF NOT EXISTS exam_items (id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE, question_id INTEGER NOT NULL REFERENCES recall_questions(id), position INTEGER NOT NULL, flagged INTEGER NOT NULL DEFAULT 0, selected_choice_ids TEXT, is_correct INTEGER, time_spent_ms INTEGER, UNIQUE (session_id, position));`,
];

/** Run every migration the database has not seen yet, each in its own transaction. */
export function runMigrations(db: Db): void {
  const applied = db.pragma('user_version', { simple: true }) as number;
  for (let i = applied; i < MIGRATIONS.length; i++) {
    const migration = MIGRATIONS[i];
    db.transaction(() => {
      if (typeof migration === 'string') db.exec(migration);
      else migration(db);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

/** Open a database (defaults to the on-disk file), enable pragmas, apply schema + migrations. */
export function openDb(path: string = resolveDbPath()): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL'); // lets a future Python sidecar co-read the file
  db.pragma('foreign_keys = ON');
  applySchema(db);
  runMigrations(db);
  return db;
}

let singleton: Db | undefined;

/** Process-wide shared connection used by the API. */
export function getDb(): Db {
  if (!singleton) singleton = openDb();
  return singleton;
}
