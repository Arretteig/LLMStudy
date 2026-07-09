import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, runMigrations, type Db } from './db';
import { getChoices, listQuestions } from './questions.repo';
import { seed } from './seed';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  runMigrations(db);
  return db;
}

/** Write a fixture seed JSON to a temp file and return its path. */
function fixture(json: object): string {
  const path = join(mkdtempSync(join(tmpdir(), 'llmstudy-seed-')), 'fixture.json');
  writeFileSync(path, JSON.stringify(json));
  return path;
}

const MCQ_FIXTURE = {
  _domain_weights: { Core: '60%', Ops: '40%' },
  objectives: [{ title: 'Obj A', domain: 'Core' }],
  questions: [{ objective_title: 'Obj A', question_text: 'recall q' }],
  mcqQuestions: [
    {
      objective_title: 'Obj A',
      question_text: 'Which is core?',
      difficulty: 2,
      choices: [
        { choice_text: 'A', is_correct: true, rationale: 'a is right' },
        { choice_text: 'B', is_correct: false, rationale: 'b is wrong' },
        { choice_text: 'C', is_correct: false, rationale: 'c is wrong' },
      ],
    },
    {
      question_text: 'Unlinked MCQ?',
      choices: [
        { choice_text: 'X', is_correct: true, rationale: 'x' },
        { choice_text: 'Y', is_correct: false, rationale: 'y' },
        { choice_text: 'Z', is_correct: false, rationale: 'z' },
      ],
    },
  ],
};

describe('seed — mcqQuestions (F21)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('seeds MCQ questions with format, difficulty, link, and choices', () => {
    seed(db, fixture(MCQ_FIXTURE));

    const byText = new Map(listQuestions(db).map((q) => [q.question_text, q]));
    const linked = byText.get('Which is core?')!;
    expect(linked.question_format).toBe('mcq');
    expect(linked.difficulty).toBe(2);
    expect(linked.objective_title).toBe('Obj A');

    const choices = getChoices(db, linked.id);
    expect(choices.map((c) => c.position)).toEqual([1, 2, 3]);
    expect(choices.map((c) => c.is_correct)).toEqual([true, false, false]);
    expect(choices[1].rationale).toBe('b is wrong');

    // MCQs without a known objective land unlinked, like recall questions.
    const unlinked = byText.get('Unlinked MCQ?')!;
    expect(unlinked.objective_id).toBeNull();
    expect(getChoices(db, unlinked.id)).toHaveLength(3);

    // Recall questions stay format 'recall'.
    expect(byText.get('recall q')!.question_format).toBe('recall');
  });

  it('re-seeding is idempotent: no duplicate questions or choice rows', () => {
    const path = fixture(MCQ_FIXTURE);
    seed(db, path);
    const first = listQuestions(db).length;
    const firstChoices = (
      db.prepare('SELECT COUNT(*) AS n FROM question_choices').get() as { n: number }
    ).n;

    seed(db, path);
    expect(listQuestions(db)).toHaveLength(first);
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM question_choices').get() as { n: number }).n,
    ).toBe(firstChoices);
  });

  it('re-seeding never clobbers choices edited after the first seed', () => {
    const path = fixture(MCQ_FIXTURE);
    seed(db, path);
    const q = listQuestions(db).find((x) => x.question_text === 'Which is core?')!;
    db.prepare("UPDATE question_choices SET choice_text = 'A (edited)' WHERE question_id = ? AND position = 1").run(
      q.id,
    );

    seed(db, path); // question row is ignored -> choices must stay untouched
    expect(getChoices(db, q.id)[0].choice_text).toBe('A (edited)');
  });

  it('a seed file without the mcqQuestions key is absent-safe', () => {
    const path = fixture({
      _domain_weights: { Core: '100%' },
      objectives: [{ title: 'Only obj', domain: 'Core' }],
      questions: [{ objective_title: 'Only obj', question_text: 'only q' }],
    });
    const result = seed(db, path);
    expect(result.questions).toBe(1);
    expect(listQuestions(db).every((q) => q.question_format === 'recall')).toBe(true);
  });

  it('the real seed JSON still loads (mcqQuestions optional there too)', () => {
    const result = seed(db);
    expect(result.objectives).toBeGreaterThan(0);
    expect(result.questions).toBeGreaterThan(0);
  });
});
