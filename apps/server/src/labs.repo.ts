import type { LabWithDetails } from '@llmstudy/shared';
import type { Db } from './db';

const WRITABLE = [
  'title',
  'objective_id',
  'hypothesis',
  'what_changed',
  'commands_config',
  'observed_result',
  'why_it_happened',
  'what_next',
] as const;

type WritableKey = (typeof WRITABLE)[number];

function pickWritable(input: Record<string, unknown>): Partial<Record<WritableKey, unknown>> {
  const row: Partial<Record<WritableKey, unknown>> = {};
  for (const key of WRITABLE) {
    if (input[key] !== undefined) row[key] = input[key];
  }
  return row;
}

// --- tags ------------------------------------------------------------------

function tagsByLab(db: Db, labId?: number): Map<number, string[]> {
  const rows = (
    labId != null
      ? db
          .prepare(
            `SELECT lt.lab_id AS lab_id, t.name AS name
             FROM lab_tags lt JOIN tags t ON t.id = lt.tag_id
             WHERE lt.lab_id = ? ORDER BY t.name`,
          )
          .all(labId)
      : db
          .prepare(
            `SELECT lt.lab_id AS lab_id, t.name AS name
             FROM lab_tags lt JOIN tags t ON t.id = lt.tag_id
             ORDER BY t.name`,
          )
          .all()
  ) as { lab_id: number; name: string }[];

  const map = new Map<number, string[]>();
  for (const r of rows) {
    const list = map.get(r.lab_id) ?? [];
    list.push(r.name);
    map.set(r.lab_id, list);
  }
  return map;
}

/** Replace a lab's tags with the given names (dedupe, trim, drop blanks). */
function setLabTags(db: Db, labId: number, tags: string[]): void {
  // Dedupe case-insensitively, keeping the FIRST casing seen.
  const seen = new Map<string, string>();
  for (const raw of tags) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  const clean = Array.from(seen.values());

  db.prepare('DELETE FROM lab_tags WHERE lab_id = ?').run(labId);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?'); // NOCASE column
  const link = db.prepare('INSERT OR IGNORE INTO lab_tags (lab_id, tag_id) VALUES (?, ?)');

  for (const name of clean) {
    insertTag.run(name);
    const { id } = findTag.get(name) as { id: number };
    link.run(labId, id);
  }
}

// --- reads -----------------------------------------------------------------

const LAB_SELECT = `
  SELECT l.*, o.title AS objective_title
  FROM labs l
  LEFT JOIN objectives o ON o.id = l.objective_id
`;

export function listLabs(db: Db): LabWithDetails[] {
  const rows = db
    .prepare(`${LAB_SELECT} ORDER BY l.updated_at DESC, l.id DESC`)
    .all() as Omit<LabWithDetails, 'tags'>[];
  const tagMap = tagsByLab(db);
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

export function getLab(db: Db, id: number): LabWithDetails | undefined {
  const row = db.prepare(`${LAB_SELECT} WHERE l.id = ?`).get(id) as
    | Omit<LabWithDetails, 'tags'>
    | undefined;
  if (!row) return undefined;
  return { ...row, tags: tagsByLab(db, id).get(id) ?? [] };
}

// --- writes ----------------------------------------------------------------

export function createLab(db: Db, input: Record<string, unknown>): LabWithDetails {
  const row = pickWritable(input);
  if (typeof row.title !== 'string' || row.title.trim() === '') {
    throw new Error('title is required');
  }
  const cols = Object.keys(row);
  const placeholders = cols.map((c) => '@' + c).join(', ');

  const run = db.transaction(() => {
    const info = db
      .prepare(`INSERT INTO labs (${cols.join(', ')}) VALUES (${placeholders})`)
      .run(row);
    const labId = Number(info.lastInsertRowid);
    if (Array.isArray(input.tags)) setLabTags(db, labId, input.tags as string[]);
    return labId;
  });

  return getLab(db, run())!;
}

export function updateLab(
  db: Db,
  id: number,
  input: Record<string, unknown>,
): LabWithDetails | undefined {
  const exists = db.prepare('SELECT 1 FROM labs WHERE id = ?').get(id);
  if (!exists) return undefined;

  const row = pickWritable(input);

  db.transaction(() => {
    const cols = Object.keys(row);
    if (cols.length > 0) {
      const setClause = cols.map((c) => `${c} = @${c}`).join(', ');
      db.prepare(
        `UPDATE labs SET ${setClause}, updated_at = datetime('now') WHERE id = @id`,
      ).run({ ...row, id });
    }
    if (Array.isArray(input.tags)) {
      setLabTags(db, id, input.tags as string[]);
      if (cols.length === 0) {
        db.prepare(`UPDATE labs SET updated_at = datetime('now') WHERE id = ?`).run(id);
      }
    }
  })();

  return getLab(db, id);
}

/** Returns true if a row was deleted (lab_tags cascade automatically). */
export function deleteLab(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM labs WHERE id = ?').run(id).changes > 0;
}
