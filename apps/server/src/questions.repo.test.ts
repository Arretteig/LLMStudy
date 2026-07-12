import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, runMigrations, type Db } from './db';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { createObjective } from './objectives.repo';
import {
  createQuestion,
  deleteQuestion,
  getChoices,
  getQuestion,
  listQuestions,
  updateQuestion,
} from './questions.repo';
import { recordAttempt } from './reviews.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  runMigrations(db);
  return db;
}

describe('questions repository', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('creates a question linked to an objective', () => {
    const obj = createObjective(db, { title: 'Transformers', domain: 'Core ML' });
    const q = createQuestion(db, {
      objective_id: obj.id,
      question_text: 'What is self-attention?',
      difficulty: 3,
    });
    expect(q.id).toBeGreaterThan(0);
    expect(q.objective_id).toBe(obj.id);
    expect(q.next_review_date).toBeNull(); // SRS cache untouched in M2
  });

  it('lists questions with their objective title joined', () => {
    const obj = createObjective(db, { title: 'Tokenization', domain: 'Data' });
    createQuestion(db, { objective_id: obj.id, question_text: 'What is BPE?' });
    const list = listQuestions(db);
    expect(list).toHaveLength(1);
    expect(list[0].objective_title).toBe('Tokenization');
  });

  it('filters questions by objective', () => {
    const a = createObjective(db, { title: 'A' });
    const b = createObjective(db, { title: 'B' });
    createQuestion(db, { objective_id: a.id, question_text: 'qa' });
    createQuestion(db, { objective_id: b.id, question_text: 'qb' });
    expect(listQuestions(db, a.id)).toHaveLength(1);
    expect(listQuestions(db, a.id)[0].question_text).toBe('qa');
  });

  it('list rows carry attempt_count and last_rating aggregates (F20)', () => {
    const attempted = createQuestion(db, { question_text: 'attempted' });
    createQuestion(db, { question_text: 'untouched' });
    recordAttempt(db, { question_id: attempted.id, rating: 2 }, new Date(2026, 6, 6));
    recordAttempt(db, { question_id: attempted.id, rating: 5 }, new Date(2026, 6, 7));

    const byText = new Map(listQuestions(db).map((q) => [q.question_text, q]));
    // last_rating tracks the MOST RECENT attempt (rating 5), not the best/first.
    expect(byText.get('attempted')).toMatchObject({ attempt_count: 2, last_rating: 5 });
    expect(byText.get('untouched')).toMatchObject({ attempt_count: 0, last_rating: null });
  });

  it('requires question_text', () => {
    expect(() => createQuestion(db, { difficulty: 2 })).toThrow(/question_text/);
  });

  it('rejects out-of-range difficulty via CHECK', () => {
    expect(() =>
      createQuestion(db, { question_text: 'bad', difficulty: 9 }),
    ).toThrow();
  });

  it('updates only whitelisted fields', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const updated = updateQuestion(db, q.id, {
      expected_answer: 'the answer',
      difficulty: 4,
    })!;
    expect(updated.expected_answer).toBe('the answer');
    expect(updated.difficulty).toBe(4);
  });

  it('rejects a blank or non-string question_text on update', () => {
    const q = createQuestion(db, { question_text: 'keep me' });
    expect(() => updateQuestion(db, q.id, { question_text: '  ' })).toThrow(
      ValidationError,
    );
    expect(() => updateQuestion(db, q.id, { question_text: 7 })).toThrow(
      ValidationError,
    );
    expect(getQuestion(db, q.id)!.question_text).toBe('keep me');
  });

  it('throws NotFoundError when updating a missing question', () => {
    expect(() => updateQuestion(db, 4242, { difficulty: 2 })).toThrow(NotFoundError);
  });

  it('sets objective_id to NULL when the objective is deleted (ON DELETE SET NULL)', () => {
    const obj = createObjective(db, { title: 'Temp' });
    const q = createQuestion(db, { objective_id: obj.id, question_text: 'orphan me' });
    db.prepare('DELETE FROM objectives WHERE id = ?').run(obj.id);
    expect(getQuestion(db, q.id)?.objective_id).toBeNull();
  });

  it('deletes a question', () => {
    const q = createQuestion(db, { question_text: 'delete me' });
    expect(deleteQuestion(db, q.id)).toBe(true);
    expect(getQuestion(db, q.id)).toBeUndefined();
    expect(deleteQuestion(db, q.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MCQ questions (F21)
// ---------------------------------------------------------------------------

const CHOICES = [
  { choice_text: 'Right', is_correct: true, rationale: 'Because it is right.' },
  { choice_text: 'Wrong A', is_correct: false, rationale: 'Distractor A.' },
  { choice_text: 'Wrong B', is_correct: false, rationale: 'Distractor B.' },
];

function mcq(db: Db, text = 'Which one?', choices = CHOICES) {
  return createQuestion(db, {
    question_text: text,
    question_format: 'mcq',
    choices,
  });
}

describe('questions repository — MCQs (F21)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('creates an MCQ with choices at positions 1..n', () => {
    const q = mcq(db);
    expect(q.question_format).toBe('mcq');
    const choices = getChoices(db, q.id);
    expect(choices).toHaveLength(3);
    expect(choices.map((c) => c.position)).toEqual([1, 2, 3]);
    expect(choices.map((c) => c.is_correct)).toEqual([true, false, false]); // booleans
    expect(choices[0].rationale).toBe('Because it is right.');
  });

  it('defaults question_format to recall and rejects unknown formats', () => {
    const q = createQuestion(db, { question_text: 'plain' });
    expect(q.question_format).toBe('recall');
    expect(() =>
      createQuestion(db, { question_text: 'x', question_format: 'essay' }),
    ).toThrow(ValidationError);
  });

  it('validation matrix: rejects bad MCQ choice sets and inserts nothing', () => {
    const bad: [string, unknown][] = [
      ['missing choices', undefined],
      ['not an array', 'nope'],
      ['fewer than 3 choices', CHOICES.slice(0, 2)],
      [
        'no correct choice',
        CHOICES.map((c) => ({ ...c, is_correct: false })),
      ],
      [
        'blank choice_text',
        [{ choice_text: '  ', is_correct: true, rationale: 'r' }, ...CHOICES.slice(1)],
      ],
      [
        'blank rationale',
        [{ choice_text: 'Right', is_correct: true, rationale: '' }, ...CHOICES.slice(1)],
      ],
      [
        'missing rationale',
        [{ choice_text: 'Right', is_correct: true }, ...CHOICES.slice(1)],
      ],
    ];
    for (const [label, choices] of bad) {
      expect(
        () => createQuestion(db, { question_text: label, question_format: 'mcq', choices }),
        label,
      ).toThrow(ValidationError);
    }
    expect(listQuestions(db)).toHaveLength(0); // transaction rolled everything back
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM question_choices').get() as { n: number }).n,
    ).toBe(0);
  });

  it('rejects choices on a recall question (create and update)', () => {
    expect(() =>
      createQuestion(db, { question_text: 'recall with choices', choices: CHOICES }),
    ).toThrow(ValidationError);
    const q = createQuestion(db, { question_text: 'recall' });
    expect(() => updateQuestion(db, q.id, { choices: CHOICES })).toThrow(ValidationError);
  });

  it('question_format is immutable on update', () => {
    const recall = createQuestion(db, { question_text: 'recall' });
    const multi = mcq(db);
    expect(() => updateQuestion(db, recall.id, { question_format: 'mcq' })).toThrow(
      ValidationError,
    );
    expect(() => updateQuestion(db, multi.id, { question_format: 'recall' })).toThrow(
      ValidationError,
    );
    // Sending the unchanged format is not "a change" and passes through.
    const same = updateQuestion(db, multi.id, {
      question_format: 'mcq',
      difficulty: 2,
    });
    expect(same.difficulty).toBe(2);
  });

  it('update with choices replaces the full set (delete + reinsert)', () => {
    const q = mcq(db);

    updateQuestion(db, q.id, {
      choices: [
        { choice_text: 'New right', is_correct: true, rationale: 'yes' },
        { choice_text: 'New wrong 1', is_correct: false, rationale: 'no' },
        { choice_text: 'New wrong 2', is_correct: false, rationale: 'no' },
        { choice_text: 'Also right', is_correct: true, rationale: 'yes too' },
      ],
    });

    const replaced = getChoices(db, q.id);
    expect(replaced).toHaveLength(4);
    expect(replaced.map((c) => c.position)).toEqual([1, 2, 3, 4]);
    expect(replaced.map((c) => c.choice_text)).toEqual([
      'New right',
      'New wrong 1',
      'New wrong 2',
      'Also right',
    ]);
    expect(replaced.map((c) => c.is_correct)).toEqual([true, false, false, true]);
  });

  it('a bad replacement choice set leaves the old set intact', () => {
    const q = mcq(db);
    expect(() =>
      updateQuestion(db, q.id, { choices: CHOICES.slice(0, 2) }),
    ).toThrow(ValidationError);
    expect(getChoices(db, q.id).map((c) => c.choice_text)).toEqual([
      'Right',
      'Wrong A',
      'Wrong B',
    ]);
  });

  it('deleting an MCQ cascades its choices', () => {
    const q = mcq(db);
    expect(getChoices(db, q.id)).toHaveLength(3);
    expect(deleteQuestion(db, q.id)).toBe(true);
    expect(getChoices(db, q.id)).toHaveLength(0);
  });

  it('list rows carry question_format', () => {
    mcq(db);
    createQuestion(db, { question_text: 'recall q' });
    const formats = listQuestions(db).map((q) => q.question_format);
    expect(formats.sort()).toEqual(['mcq', 'recall']);
  });
});

describe('questions repository — duplicate text (error-log spawn collision)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  const CHOICES = [
    { choice_text: 'right', is_correct: true, rationale: 'yes' },
    { choice_text: 'wrong a', is_correct: false, rationale: 'no' },
    { choice_text: 'wrong b', is_correct: false, rationale: 'no' },
  ];

  it('rejects a recall card duplicating an MCQ stem under the same objective with ConflictError', () => {
    const obj = createObjective(db, { title: 'Objective A' });
    createQuestion(db, {
      objective_id: obj.id,
      question_text: 'Shared stem?',
      question_format: 'mcq',
      choices: CHOICES,
    });
    // The Drill/Exam error-log dialog used to submit the stem verbatim — this
    // must be a 409-mapped ConflictError, never a raw SqliteError (-> 500).
    expect(() =>
      createQuestion(db, { objective_id: obj.id, question_text: 'Shared stem?' }),
    ).toThrow(ConflictError);
  });

  it('rejects an update that collides with another question of the same objective', () => {
    const obj = createObjective(db, { title: 'Objective B' });
    createQuestion(db, { objective_id: obj.id, question_text: 'first' });
    const second = createQuestion(db, { objective_id: obj.id, question_text: 'second' });
    expect(() =>
      updateQuestion(db, second.id, { question_text: 'first' }),
    ).toThrow(ConflictError);
  });

  it('allows the same text under a different objective (constraint is per-objective)', () => {
    const a = createObjective(db, { title: 'Objective C' });
    const b = createObjective(db, { title: 'Objective D' });
    createQuestion(db, { objective_id: a.id, question_text: 'same text' });
    expect(() =>
      createQuestion(db, { objective_id: b.id, question_text: 'same text' }),
    ).not.toThrow();
  });
});
