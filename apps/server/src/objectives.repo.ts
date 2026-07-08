import type { Objective } from '@llmstudy/shared';
import type { Db } from './db';

// Whitelist of columns a client is allowed to write. Anything else in the
// request body is ignored, so keys can never be injected into SQL.
const WRITABLE = [
  'title',
  'description',
  'cert_path',
  'domain',
  'confidence',
  'status',
  'last_reviewed_date',
  'next_review_date',
  'notes',
  'evidence_of_understanding',
] as const;

type WritableKey = (typeof WRITABLE)[number];

function pickWritable(input: Record<string, unknown>): Partial<Record<WritableKey, unknown>> {
  const row: Partial<Record<WritableKey, unknown>> = {};
  for (const key of WRITABLE) {
    if (input[key] !== undefined) row[key] = input[key];
  }
  return row;
}

export function listObjectives(db: Db, certPath?: string): Objective[] {
  if (certPath) {
    return db
      .prepare('SELECT * FROM objectives WHERE cert_path = ? ORDER BY domain, title')
      .all(certPath) as Objective[];
  }
  return db
    .prepare('SELECT * FROM objectives ORDER BY cert_path, domain, title')
    .all() as Objective[];
}

export function getObjective(db: Db, id: number): Objective | undefined {
  return db.prepare('SELECT * FROM objectives WHERE id = ?').get(id) as
    | Objective
    | undefined;
}

export function createObjective(db: Db, input: Record<string, unknown>): Objective {
  const row = pickWritable(input);
  if (typeof row.title !== 'string' || row.title.trim() === '') {
    throw new Error('title is required');
  }
  const cols = Object.keys(row);
  const placeholders = cols.map((c) => '@' + c).join(', ');
  const info = db
    .prepare(`INSERT INTO objectives (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(row);
  return getObjective(db, Number(info.lastInsertRowid))!;
}

export function updateObjective(
  db: Db,
  id: number,
  input: Record<string, unknown>,
): Objective | undefined {
  const existing = getObjective(db, id);
  if (!existing) return undefined;

  const row = pickWritable(input);
  const cols = Object.keys(row);
  if (cols.length === 0) return existing;

  const setClause = cols.map((c) => `${c} = @${c}`).join(', ');
  db.prepare(
    `UPDATE objectives SET ${setClause}, updated_at = datetime('now') WHERE id = @id`,
  ).run({ ...row, id });

  return getObjective(db, id);
}
