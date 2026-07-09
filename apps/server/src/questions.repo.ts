import type {
  NewQuestionChoice,
  QuestionChoice,
  QuestionListItem,
  RecallQuestion,
} from '@llmstudy/shared';
import type { Db } from './db';
import { NotFoundError, ValidationError } from './errors';
import { assertNonBlankText } from './validate';

// Columns a client may write. SRS cache columns (last_attempted_date,
// next_review_date, self_score) are intentionally excluded — they are managed
// server-side by the spaced-review engine in M3, not set directly by clients.
// question_format is create-only (immutable after insert) and choices are
// handled separately, so neither appears here.
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

// List rows carry attempt aggregates (F20). The joined subquery groups once
// over answer_attempts; SQLite's bare-column-with-MAX rule guarantees the
// ungrouped `rating` comes from the MAX(id) row, i.e. the most recent attempt.
const LIST_SELECT = `
  SELECT q.*, o.title AS objective_title,
         COALESCE(a.attempt_count, 0) AS attempt_count,
         a.last_rating
  FROM recall_questions q
  LEFT JOIN objectives o ON o.id = q.objective_id
  LEFT JOIN (
    SELECT question_id, COUNT(*) AS attempt_count, MAX(id), rating AS last_rating
    FROM answer_attempts GROUP BY question_id
  ) a ON a.question_id = q.id
`;

export function listQuestions(db: Db, objectiveId?: number): QuestionListItem[] {
  if (objectiveId !== undefined) {
    return db
      .prepare(`${LIST_SELECT} WHERE q.objective_id = ? ORDER BY q.id`)
      .all(objectiveId) as QuestionListItem[];
  }
  return db
    .prepare(`${LIST_SELECT} ORDER BY o.domain, o.title, q.id`)
    .all() as QuestionListItem[];
}

export function getQuestion(db: Db, id: number): RecallQuestion | undefined {
  return db.prepare('SELECT * FROM recall_questions WHERE id = ?').get(id) as
    | RecallQuestion
    | undefined;
}

// ---------------------------------------------------------------------------
// MCQ choices (F21)
// ---------------------------------------------------------------------------

/** Choice row as stored (is_correct is a 0/1 INTEGER in SQLite). */
interface ChoiceRow extends Omit<QuestionChoice, 'is_correct'> {
  is_correct: number;
}

function toChoice(row: ChoiceRow): QuestionChoice {
  return { ...row, is_correct: row.is_correct === 1 };
}

/** All choices for a question, in position order, with is_correct as boolean. */
export function getChoices(db: Db, questionId: number): QuestionChoice[] {
  return (
    db
      .prepare('SELECT * FROM question_choices WHERE question_id = ? ORDER BY position')
      .all(questionId) as ChoiceRow[]
  ).map(toChoice);
}

/**
 * Authoring rules for an MCQ's choice set: at least 3 options, at least one
 * correct, and every option must carry text AND a rationale (the UWorld-style
 * feedback screen depends on rationales existing for wrong answers too).
 */
function assertValidChoiceSet(choices: unknown): asserts choices is NewQuestionChoice[] {
  if (!Array.isArray(choices) || choices.length < 3) {
    throw new ValidationError('an MCQ needs at least 3 choices');
  }
  for (const choice of choices) {
    assertNonBlankText((choice as NewQuestionChoice)?.choice_text, 'choice_text');
    assertNonBlankText((choice as NewQuestionChoice)?.rationale, 'rationale');
  }
  if (!choices.some((c) => (c as NewQuestionChoice).is_correct)) {
    throw new ValidationError('an MCQ needs at least one correct choice');
  }
}

/** Insert a full choice set at positions 1..n. Caller wraps in a transaction. */
function insertChoices(db: Db, questionId: number, choices: NewQuestionChoice[]): void {
  const insert = db.prepare(
    `INSERT INTO question_choices (question_id, position, choice_text, is_correct, rationale)
     VALUES (@question_id, @position, @choice_text, @is_correct, @rationale)`,
  );
  choices.forEach((choice, i) => {
    insert.run({
      question_id: questionId,
      position: i + 1,
      choice_text: choice.choice_text,
      is_correct: choice.is_correct ? 1 : 0,
      rationale: choice.rationale,
    });
  });
}

export function createQuestion(db: Db, input: Record<string, unknown>): RecallQuestion {
  const row = pickWritable(input);
  assertNonBlankText(row.question_text, 'question_text');

  const format = input.question_format ?? 'recall';
  if (format !== 'recall' && format !== 'mcq') {
    throw new ValidationError("question_format must be 'recall' or 'mcq'");
  }
  if (format === 'mcq') {
    assertValidChoiceSet(input.choices);
  } else if (input.choices !== undefined) {
    throw new ValidationError('choices are only valid on MCQ questions');
  }

  const cols = Object.keys(row);
  const placeholders = cols.map((c) => '@' + c).join(', ');
  // Question + its choices land atomically — no half-created MCQs.
  const insertAll = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO recall_questions (${cols.join(', ')}, question_format)
         VALUES (${placeholders}, @question_format)`,
      )
      .run({ ...row, question_format: format });
    const id = Number(info.lastInsertRowid);
    if (format === 'mcq') insertChoices(db, id, input.choices as NewQuestionChoice[]);
    return id;
  });

  return getQuestion(db, insertAll())!;
}

export function updateQuestion(
  db: Db,
  id: number,
  input: Record<string, unknown>,
): RecallQuestion {
  const existing = getQuestion(db, id);
  if (!existing) throw new NotFoundError('question not found');

  // question_format is immutable — an MCQ can't silently become a recall card
  // (its choices and attempt history would stop making sense) or vice versa.
  if (
    input.question_format !== undefined &&
    input.question_format !== existing.question_format
  ) {
    throw new ValidationError('question_format cannot be changed');
  }

  const choices = input.choices;
  if (choices !== undefined) {
    if (existing.question_format !== 'mcq') {
      throw new ValidationError('choices are only valid on MCQ questions');
    }
    assertValidChoiceSet(choices);
  }

  const row = pickWritable(input);
  if (row.question_text !== undefined) assertNonBlankText(row.question_text, 'question_text');
  const cols = Object.keys(row);
  if (cols.length === 0 && choices === undefined) return existing;

  db.transaction(() => {
    if (cols.length > 0) {
      const setClause = cols.map((c) => `${c} = @${c}`).join(', ');
      db.prepare(
        `UPDATE recall_questions SET ${setClause}, updated_at = datetime('now') WHERE id = @id`,
      ).run({ ...row, id });
    }
    if (choices !== undefined) {
      // `choices` replaces the FULL set: delete + reinsert at positions 1..n.
      db.prepare('DELETE FROM question_choices WHERE question_id = ?').run(id);
      insertChoices(db, id, choices as NewQuestionChoice[]);
      db.prepare(
        `UPDATE recall_questions SET updated_at = datetime('now') WHERE id = ?`,
      ).run(id);
    }
  })();

  return getQuestion(db, id)!;
}

/** Returns true if a row was deleted. Choices cascade via ON DELETE CASCADE. */
export function deleteQuestion(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM recall_questions WHERE id = ?').run(id).changes > 0;
}
