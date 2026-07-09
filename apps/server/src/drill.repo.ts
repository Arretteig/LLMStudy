// Drill (F22): untimed MCQ practice with instant elaborated feedback.
// CORE INVARIANT: drill attempts NEVER touch the SRS — grading records a
// source='drill' history row (via recordPracticeAttempt) and leaves the
// question's schedule cache untouched.
import type { DrillAnswerResult, DrillQuestion } from '@llmstudy/shared';
import type { Db } from './db';
import { NotFoundError, ValidationError } from './errors';
import { getChoices, getQuestion } from './questions.repo';
import { recordPracticeAttempt } from './reviews.repo';

/** Optional scope for a drill set. objectiveId wins when both are given. */
export interface DrillFilter {
  objectiveId?: number;
  domain?: string;
}

export const DRILL_DEFAULT_LIMIT = 10;
export const DRILL_MAX_LIMIT = 50;

function scopeClause(filter: DrillFilter): string {
  if (filter.objectiveId !== undefined) return 'AND q.objective_id = @objective_id';
  if (filter.domain !== undefined) return 'AND o.domain = @domain';
  return '';
}

function scopeParams(filter: DrillFilter): Record<string, number | string> {
  if (filter.objectiveId !== undefined) return { objective_id: filter.objectiveId };
  if (filter.domain !== undefined) return { domain: filter.domain };
  return {};
}

// Deterministic selection order: never-attempted MCQs first, then
// least-recently-attempted (max attempted_date ascending), ties by id.
// Any attempt source (drill/exam) counts as "attempted" for rotation purposes.
const DRILL_SELECT = (scope: string) => `
  SELECT q.id, q.objective_id, o.title AS objective_title, o.domain AS domain,
         q.question_text, q.difficulty
  FROM recall_questions q
  LEFT JOIN objectives o ON o.id = q.objective_id
  LEFT JOIN (
    SELECT question_id, MAX(attempted_date) AS last_attempted
    FROM answer_attempts GROUP BY question_id
  ) a ON a.question_id = q.id
  WHERE q.question_format = 'mcq' ${scope}
  ORDER BY (a.last_attempted IS NOT NULL), a.last_attempted, q.id
  LIMIT @limit
`;

type DrillRow = Omit<DrillQuestion, 'multi_select' | 'choices'>;

/** MCQs to drill, with answer-free choices (no is_correct/rationale). */
export function listDrillQuestions(
  db: Db,
  filter: DrillFilter = {},
  limit: number = DRILL_DEFAULT_LIMIT,
): DrillQuestion[] {
  const clamped = Math.min(DRILL_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
  const rows = db
    .prepare(DRILL_SELECT(scopeClause(filter)))
    .all({ limit: clamped, ...scopeParams(filter) }) as DrillRow[];

  return rows.map((row) => {
    const choices = getChoices(db, row.id);
    return {
      ...row,
      multi_select: choices.filter((c) => c.is_correct).length > 1,
      choices: choices.map(({ id, position, choice_text }) => ({
        id,
        position,
        choice_text,
      })),
    };
  });
}

/** Client-supplied choice selection: must be an array of integers (deduped). */
export function assertChoiceIdArray(value: unknown): number[] {
  if (!Array.isArray(value) || value.some((v) => !Number.isInteger(v))) {
    throw new ValidationError('selected_choice_ids must be an array of integers');
  }
  return [...new Set(value as number[])];
}

/** Exact set equality — partial credit is deliberately not a thing. */
export function exactSetMatch(selected: number[], correct: number[]): boolean {
  const want = new Set(correct);
  const got = new Set(selected);
  return got.size === want.size && [...got].every((id) => want.has(id));
}

/**
 * Grade one drill answer: exact set equality against the correct choice ids,
 * record a source='drill' attempt (rating 4 correct / 1 wrong, confidence and
 * user_answer NULL, next_review_date NULL, NO SRS cache touch), and return the
 * full elaborated feedback (every choice with is_correct + rationale).
 */
export function answerDrill(
  db: Db,
  input: { question_id: number; selected_choice_ids: unknown },
  now: Date = new Date(),
): DrillAnswerResult {
  const question = getQuestion(db, input.question_id);
  if (!question) throw new NotFoundError('question not found');
  if (question.question_format !== 'mcq') {
    throw new ValidationError('drill answers are only valid for MCQ questions');
  }

  const selected = assertChoiceIdArray(input.selected_choice_ids);
  const choices = getChoices(db, question.id);
  const known = new Set(choices.map((c) => c.id));
  for (const id of selected) {
    if (!known.has(id)) {
      throw new ValidationError(`choice ${id} does not belong to question ${question.id}`);
    }
  }

  const correctIds = choices.filter((c) => c.is_correct).map((c) => c.id);
  const correct = exactSetMatch(selected, correctIds);

  recordPracticeAttempt(
    db,
    {
      question_id: question.id,
      source: 'drill',
      rating: correct ? 4 : 1,
      selected_choice_ids: selected,
    },
    now,
  );

  return { correct, correct_choice_ids: correctIds, choices };
}
