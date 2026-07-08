import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root, derived from this file's location (apps/server/src -> ../../..). */
export const REPO_ROOT = resolve(__dirname, '..', '..', '..');

export const DB_PATH =
  process.env.DB_PATH ?? join(REPO_ROOT, 'db', 'data', 'study.db');

const SCHEMA_PATH = join(REPO_ROOT, 'db', 'schema.sql');

export type Db = Database.Database;

/** Apply schema.sql (idempotent — every statement is CREATE ... IF NOT EXISTS). */
export function applySchema(db: Db): void {
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
}

/** Open a database (defaults to the on-disk file), enable pragmas, apply schema. */
export function openDb(path: string = DB_PATH): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL'); // lets a future Python sidecar co-read the file
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

let singleton: Db | undefined;

/** Process-wide shared connection used by the API. */
export function getDb(): Db {
  if (!singleton) singleton = openDb();
  return singleton;
}
