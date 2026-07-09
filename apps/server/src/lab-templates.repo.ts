import type { LabTemplateWithDetails } from '@llmstudy/shared';
import type { Db } from './db';
import { NotFoundError } from './errors';
import { assertNonBlankText } from './validate';

const WRITABLE = [
  'title',
  'objective_id',
  'domain',
  'goal',
  'background',
  'instructions',
  'success_criteria',
  'reflection_questions',
  'suggested_commands',
  'difficulty',
  'estimated_minutes',
] as const;

type WritableKey = (typeof WRITABLE)[number];

function pickWritable(input: Record<string, unknown>): Partial<Record<WritableKey, unknown>> {
  const row: Partial<Record<WritableKey, unknown>> = {};
  for (const key of WRITABLE) {
    if (input[key] !== undefined) row[key] = input[key];
  }
  return row;
}

// --- tags (shared dictionary via the template_tags junction) ---------------

function tagsByTemplate(db: Db, templateId?: number): Map<number, string[]> {
  const rows = (
    templateId != null
      ? db
          .prepare(
            `SELECT tt.template_id AS template_id, t.name AS name
             FROM template_tags tt JOIN tags t ON t.id = tt.tag_id
             WHERE tt.template_id = ? ORDER BY t.name`,
          )
          .all(templateId)
      : db
          .prepare(
            `SELECT tt.template_id AS template_id, t.name AS name
             FROM template_tags tt JOIN tags t ON t.id = tt.tag_id
             ORDER BY t.name`,
          )
          .all()
  ) as { template_id: number; name: string }[];

  const map = new Map<number, string[]>();
  for (const r of rows) {
    const list = map.get(r.template_id) ?? [];
    list.push(r.name);
    map.set(r.template_id, list);
  }
  return map;
}

function setTemplateTags(db: Db, templateId: number, tags: string[]): void {
  // Dedupe case-insensitively, keeping the FIRST casing seen.
  const seen = new Map<string, string>();
  for (const raw of tags) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  const clean = Array.from(seen.values());

  db.prepare('DELETE FROM template_tags WHERE template_id = ?').run(templateId);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const link = db.prepare(
    'INSERT OR IGNORE INTO template_tags (template_id, tag_id) VALUES (?, ?)',
  );
  for (const name of clean) {
    insertTag.run(name);
    const { id } = findTag.get(name) as { id: number };
    link.run(templateId, id);
  }
}

// --- reads -----------------------------------------------------------------

const SELECT = `
  SELECT t.*, o.title AS objective_title,
         (SELECT COUNT(*) FROM lab_runs r WHERE r.template_id = t.id) AS run_count
  FROM lab_templates t
  LEFT JOIN objectives o ON o.id = t.objective_id
`;

export function listTemplates(db: Db, objectiveId?: number): LabTemplateWithDetails[] {
  const rows = (
    objectiveId !== undefined
      ? db.prepare(`${SELECT} WHERE t.objective_id = ? ORDER BY t.domain, t.title`).all(objectiveId)
      : db.prepare(`${SELECT} ORDER BY t.domain, t.title`).all()
  ) as Omit<LabTemplateWithDetails, 'tags'>[];
  const tagMap = tagsByTemplate(db);
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

export function getTemplate(db: Db, id: number): LabTemplateWithDetails | undefined {
  const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(id) as
    | Omit<LabTemplateWithDetails, 'tags'>
    | undefined;
  if (!row) return undefined;
  return { ...row, tags: tagsByTemplate(db, id).get(id) ?? [] };
}

// --- writes ----------------------------------------------------------------

export function createTemplate(
  db: Db,
  input: Record<string, unknown>,
): LabTemplateWithDetails {
  const row = pickWritable(input);
  assertNonBlankText(row.title, 'title');
  const cols = Object.keys(row);
  const placeholders = cols.map((c) => '@' + c).join(', ');

  const run = db.transaction(() => {
    const info = db
      .prepare(`INSERT INTO lab_templates (${cols.join(', ')}) VALUES (${placeholders})`)
      .run(row);
    const id = Number(info.lastInsertRowid);
    if (Array.isArray(input.tags)) setTemplateTags(db, id, input.tags as string[]);
    return id;
  });
  return getTemplate(db, run())!;
}

export function updateTemplate(
  db: Db,
  id: number,
  input: Record<string, unknown>,
): LabTemplateWithDetails {
  if (!db.prepare('SELECT 1 FROM lab_templates WHERE id = ?').get(id)) {
    throw new NotFoundError('lab template not found');
  }

  const row = pickWritable(input);
  if (row.title !== undefined) assertNonBlankText(row.title, 'title');
  db.transaction(() => {
    const cols = Object.keys(row);
    if (cols.length > 0) {
      const setClause = cols.map((c) => `${c} = @${c}`).join(', ');
      db.prepare(
        `UPDATE lab_templates SET ${setClause}, updated_at = datetime('now') WHERE id = @id`,
      ).run({ ...row, id });
    }
    if (Array.isArray(input.tags)) {
      setTemplateTags(db, id, input.tags as string[]);
      if (cols.length === 0) {
        db.prepare(`UPDATE lab_templates SET updated_at = datetime('now') WHERE id = ?`).run(id);
      }
    }
  })();
  return getTemplate(db, id)!;
}

export function deleteTemplate(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM lab_templates WHERE id = ?').run(id).changes > 0;
}
