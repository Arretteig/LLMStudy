import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, runMigrations, type Db } from './db';
import { answerDrill, listDrillQuestions } from './drill.repo';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { createObjective } from './objectives.repo';
import { createQuestion, getChoices, getQuestion } from './questions.repo';
import { listHistory, undoAttempt } from './reviews.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  runMigrations(db);
  return db;
}

/** Create an MCQ with `correctCount` correct choices out of 4. */
function mcq(db: Db, text: string, objectiveId: number | null = null, correctCount = 1) {
  return createQuestion(db, {
    objective_id: objectiveId,
    question_text: text,
    question_format: 'mcq',
    choices: ['A', 'B', 'C', 'D'].map((label, i) => ({
      choice_text: `Option ${label}`,
      is_correct: i < correctCount,
      rationale: `why ${label}`,
    })),
  });
}

const JULY_6 = new Date(2026, 6, 6, 9, 0, 0);
const JULY_7 = new Date(2026, 6, 7, 9, 0, 0);

describe('drill selection (F22)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('serves only MCQs, never recall cards', () => {
    createQuestion(db, { question_text: 'recall card' });
    const m = mcq(db, 'mcq card');
    const drill = listDrillQuestions(db);
    expect(drill.map((d) => d.id)).toEqual([m.id]);
  });

  it('orders never-attempted first, then least-recently-attempted, ties by id', () => {
    const q1 = mcq(db, 'q1');
    const q2 = mcq(db, 'q2');
    const q3 = mcq(db, 'q3');
    const q4 = mcq(db, 'q4');

    // q2 answered before q1; q3/q4 never attempted.
    answerDrill(db, { question_id: q2.id, selected_choice_ids: [] }, JULY_6);
    answerDrill(db, { question_id: q1.id, selected_choice_ids: [] }, JULY_7);

    const drill = listDrillQuestions(db);
    expect(drill.map((d) => d.id)).toEqual([q3.id, q4.id, q2.id, q1.id]);
  });

  it('exposes answer-free choices and a multi_select hint', () => {
    mcq(db, 'single', null, 1);
    mcq(db, 'choose two', null, 2);

    const byText = new Map(listDrillQuestions(db).map((d) => [d.question_text, d]));
    expect(byText.get('single')!.multi_select).toBe(false);
    expect(byText.get('choose two')!.multi_select).toBe(true);

    const choices = byText.get('single')!.choices;
    expect(choices.map((c) => c.position)).toEqual([1, 2, 3, 4]);
    for (const choice of choices) {
      expect(choice).not.toHaveProperty('is_correct');
      expect(choice).not.toHaveProperty('rationale');
    }
  });

  it('scopes by objective_id (winning over domain) and by domain', () => {
    const core = createObjective(db, { title: 'Core obj', domain: 'Core' });
    const ops = createObjective(db, { title: 'Ops obj', domain: 'Ops' });
    const coreQ = mcq(db, 'core q', core.id);
    const opsQ = mcq(db, 'ops q', ops.id);
    mcq(db, 'unlinked q');

    expect(listDrillQuestions(db, { objectiveId: core.id }).map((d) => d.id)).toEqual([
      coreQ.id,
    ]);
    expect(listDrillQuestions(db, { domain: 'Ops' }).map((d) => d.id)).toEqual([opsQ.id]);
    expect(
      listDrillQuestions(db, { objectiveId: core.id, domain: 'Ops' }).map((d) => d.id),
    ).toEqual([coreQ.id]); // objective wins
    expect(listDrillQuestions(db)).toHaveLength(3);

    const scoped = listDrillQuestions(db, { domain: 'Core' })[0];
    expect(scoped.objective_title).toBe('Core obj');
    expect(scoped.domain).toBe('Core');
  });

  it('clamps the limit into 1..50', () => {
    for (let i = 0; i < 12; i++) mcq(db, `q${i}`);
    expect(listDrillQuestions(db)).toHaveLength(10); // default
    expect(listDrillQuestions(db, {}, 3)).toHaveLength(3);
    expect(listDrillQuestions(db, {}, 0)).toHaveLength(1); // clamped up
    expect(listDrillQuestions(db, {}, 999)).toHaveLength(12); // clamped to 50, pool is 12
  });
});

describe('drill grading (F22)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('grades a single-select answer and returns elaborated feedback', () => {
    const q = mcq(db, 'single');
    const choices = getChoices(db, q.id);
    const right = choices.find((c) => c.is_correct)!;
    const wrong = choices.find((c) => !c.is_correct)!;

    const hit = answerDrill(db, { question_id: q.id, selected_choice_ids: [right.id] });
    expect(hit.correct).toBe(true);
    expect(hit.correct_choice_ids).toEqual([right.id]);
    // Feedback view includes every choice with is_correct + rationale.
    expect(hit.choices).toHaveLength(4);
    expect(hit.choices.every((c) => typeof c.rationale === 'string')).toBe(true);

    const miss = answerDrill(db, { question_id: q.id, selected_choice_ids: [wrong.id] });
    expect(miss.correct).toBe(false);
  });

  it('choose-two requires the EXACT set — partial or superset is wrong', () => {
    const q = mcq(db, 'choose two', null, 2);
    const choices = getChoices(db, q.id);
    const correctIds = choices.filter((c) => c.is_correct).map((c) => c.id);
    const wrongId = choices.find((c) => !c.is_correct)!.id;

    expect(
      answerDrill(db, { question_id: q.id, selected_choice_ids: [correctIds[0]] }).correct,
    ).toBe(false); // partial
    expect(
      answerDrill(db, {
        question_id: q.id,
        selected_choice_ids: [...correctIds, wrongId],
      }).correct,
    ).toBe(false); // superset
    // Order does not matter; duplicates collapse.
    const exact = answerDrill(db, {
      question_id: q.id,
      selected_choice_ids: [correctIds[1], correctIds[0], correctIds[0]],
    });
    expect(exact.correct).toBe(true);
    expect(exact.correct_choice_ids.sort()).toEqual([...correctIds].sort());
  });

  it("records a source='drill' attempt and NEVER touches the SRS cache (core invariant)", () => {
    const q = mcq(db, 'invariant');
    const before = getQuestion(db, q.id)!;
    const right = getChoices(db, q.id).find((c) => c.is_correct)!;

    answerDrill(db, { question_id: q.id, selected_choice_ids: [right.id] }, JULY_7);

    const [attempt] = listHistory(db, q.id);
    expect(attempt.source).toBe('drill');
    expect(attempt.rating).toBe(4);
    expect(attempt.session_id).toBeNull();
    expect(attempt.confidence).toBeNull();
    expect(attempt.user_answer).toBeNull();
    expect(attempt.selected_choice_ids).toEqual([right.id]); // parsed back to numbers
    expect(attempt.next_review_date).toBeNull();

    // Cache columns must be byte-identical to before the drill answer.
    const after = getQuestion(db, q.id)!;
    expect(after.next_review_date).toBe(before.next_review_date);
    expect(after.interval_days).toBe(before.interval_days);
    expect(after.lapses).toBe(before.lapses);
    expect(after.self_score).toBe(before.self_score);
    expect(after.last_attempted_date).toBe(before.last_attempted_date);

    // A wrong answer records rating 1 — and still no cache movement.
    const wrong = getChoices(db, q.id).find((c) => !c.is_correct)!;
    answerDrill(db, { question_id: q.id, selected_choice_ids: [wrong.id] }, JULY_7);
    expect(listHistory(db, q.id)[0].rating).toBe(1);
    expect(getQuestion(db, q.id)!.next_review_date).toBeNull();
  });

  it('undo refuses drill attempts with ConflictError', () => {
    const q = mcq(db, 'no undo');
    const right = getChoices(db, q.id).find((c) => c.is_correct)!;
    answerDrill(db, { question_id: q.id, selected_choice_ids: [right.id] });
    const [attempt] = listHistory(db, q.id);
    expect(() => undoAttempt(db, attempt.id)).toThrow(ConflictError);
    expect(listHistory(db, q.id)).toHaveLength(1); // nothing deleted
  });

  it('validates the question and the selected ids', () => {
    const recall = createQuestion(db, { question_text: 'recall' });
    const q = mcq(db, 'valid mcq');
    const foreign = mcq(db, 'other mcq');
    const foreignChoice = getChoices(db, foreign.id)[0];

    expect(() =>
      answerDrill(db, { question_id: 999, selected_choice_ids: [1] }),
    ).toThrow(NotFoundError);
    expect(() =>
      answerDrill(db, { question_id: recall.id, selected_choice_ids: [1] }),
    ).toThrow(ValidationError);
    expect(() =>
      answerDrill(db, { question_id: q.id, selected_choice_ids: [foreignChoice.id] }),
    ).toThrow(ValidationError);
    expect(() =>
      answerDrill(db, { question_id: q.id, selected_choice_ids: 'first' }),
    ).toThrow(ValidationError);
    expect(() =>
      answerDrill(db, { question_id: q.id, selected_choice_ids: [1.5] }),
    ).toThrow(ValidationError);
    expect(listHistory(db, q.id)).toHaveLength(0); // no attempt rows leaked
  });
});
