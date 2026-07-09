import type { LabRunWithDetails } from '@llmstudy/shared';
import type { Db } from './db';

const WRITABLE = [
  'template_id',
  'objective_id',
  'status',
  'hypothesis',
  'what_changed',
  'commands_config',
  'observed_result',
  'why_it_happened',
  'mistakes',
  'what_next',
  'confidence_after',
  'started_at',
  'completed_at',
  'notes',
] as const;

type WritableKey = (typeof WRITABLE)[number];

function pickWritable(input: Record<string, unknown>): Partial<Record<WritableKey, unknown>> {
  const row: Partial<Record<WritableKey, unknown>> = {};
  for (const key of WRITABLE) {
    if (input[key] !== undefined) row[key] = input[key];
  }
  return row;
}

const SELECT = `
  SELECT r.*, t.title AS template_title, o.title AS objective_title
  FROM lab_runs r
  LEFT JOIN lab_templates t ON t.id = r.template_id
  LEFT JOIN objectives o ON o.id = r.objective_id
`;

export interface RunFilter {
  templateId?: number;
  objectiveId?: number;
  status?: string;
}

export function listRuns(db: Db, filter: RunFilter = {}): LabRunWithDetails[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.templateId !== undefined) {
    where.push('r.template_id = @templateId');
    params.templateId = filter.templateId;
  }
  if (filter.objectiveId !== undefined) {
    where.push('r.objective_id = @objectiveId');
    params.objectiveId = filter.objectiveId;
  }
  if (filter.status !== undefined) {
    where.push('r.status = @status');
    params.status = filter.status;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db
    .prepare(`${SELECT} ${clause} ORDER BY r.updated_at DESC, r.id DESC`)
    .all(params) as LabRunWithDetails[];
}

export function getRun(db: Db, id: number): LabRunWithDetails | undefined {
  return db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as
    | LabRunWithDetails
    | undefined;
}

export function createRun(db: Db, input: Record<string, unknown>): LabRunWithDetails {
  const row = pickWritable(input);
  const cols = Object.keys(row);
  let info;
  if (cols.length === 0) {
    info = db.prepare('INSERT INTO lab_runs DEFAULT VALUES').run();
  } else {
    const placeholders = cols.map((c) => '@' + c).join(', ');
    info = db
      .prepare(`INSERT INTO lab_runs (${cols.join(', ')}) VALUES (${placeholders})`)
      .run(row);
  }
  return getRun(db, Number(info.lastInsertRowid))!;
}

export function updateRun(
  db: Db,
  id: number,
  input: Record<string, unknown>,
): LabRunWithDetails | undefined {
  if (!db.prepare('SELECT 1 FROM lab_runs WHERE id = ?').get(id)) return undefined;
  const row = pickWritable(input);
  const cols = Object.keys(row);
  if (cols.length > 0) {
    const setClause = cols.map((c) => `${c} = @${c}`).join(', ');
    db.prepare(
      `UPDATE lab_runs SET ${setClause}, updated_at = datetime('now') WHERE id = @id`,
    ).run({ ...row, id });
  }
  return getRun(db, id);
}

export function deleteRun(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM lab_runs WHERE id = ?').run(id).changes > 0;
}
