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
