import type {
  RecallQuestion,
  RecallQuestionWithObjective,
} from '@llmstudy/shared';
import type { Db } from './db';

// Columns a client may write. SRS cache columns (last_attempted_date,
// next_review_date, self_score) are intentionally excluded — they are managed
// server-side by the spaced-review engine in M3, not set directly by clients.
const WRITABLE = [
  'objective_id',
  'question_text',
  'expected_answer',
  'difficulty',
] as const;

type WritableKey = (typeof WRITABLE)[number];

function pickWritable(input: Record<string, unknown>): Partial<Record<WritableKey, unknown>> {
  const row: Partial<Record<WritableKey, unknown>> = {};
  for (const key of WRITABLE) {
    if (input[key] !== undefined) row[key] = input[key];
  }
  return row;
}

const LIST_SELECT = `
  SELECT q.*, o.title AS objective_title
  FROM recall_questions q
  LEFT JOIN objectives o ON o.id = q.objective_id
`;

export function listQuestions(
  db: Db,
  objectiveId?: number,
): RecallQuestionWithObjective[] {
  if (objectiveId !== undefined) {
    return db
      .prepare(`${LIST_SELECT} WHERE q.objective_id = ? ORDER BY q.id`)
      .all(objectiveId) as RecallQuestionWithObjective[];
  }
  return db
    .prepare(`${LIST_SELECT} ORDER BY o.domain, o.title, q.id`)
    .all() as RecallQuestionWithObjective[];
}

export function getQuestion(db: Db, id: number): RecallQuestion | undefined {
  return db.prepare('SELECT * FROM recall_questions WHERE id = ?').get(id) as
    | RecallQuestion
    | undefined;
}

export function createQuestion(db: Db, input: Record<string, unknown>): RecallQuestion {
  const row = pickWritable(input);
  if (typeof row.question_text !== 'string' || row.question_text.trim() === '') {
    throw new Error('question_text is required');
  }
  const cols = Object.keys(row);
  const placeholders = cols.map((c) => '@' + c).join(', ');
  const info = db
    .prepare(`INSERT INTO recall_questions (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(row);
  return getQuestion(db, Number(info.lastInsertRowid))!;
}

export function updateQuestion(
  db: Db,
  id: number,
  input: Record<string, unknown>,
): RecallQuestion | undefined {
  const existing = getQuestion(db, id);
  if (!existing) return undefined;

  const row = pickWritable(input);
  const cols = Object.keys(row);
  if (cols.length === 0) return existing;

  const setClause = cols.map((c) => `${c} = @${c}`).join(', ');
  db.prepare(
    `UPDATE recall_questions SET ${setClause}, updated_at = datetime('now') WHERE id = @id`,
  ).run({ ...row, id });

  return getQuestion(db, id);
}

/** Returns true if a row was deleted. */
export function deleteQuestion(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM recall_questions WHERE id = ?').run(id).changes > 0;
}
