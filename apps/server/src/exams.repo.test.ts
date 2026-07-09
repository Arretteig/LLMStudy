import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, runMigrations, type Db } from './db';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import {
  allocateByWeight,
  createExam,
  examReadiness,
  finishExam,
  getExam,
  getSession,
  listExams,
  updateExamItem,
} from './exams.repo';
import { createObjective } from './objectives.repo';
import { createQuestion, getChoices, getQuestion } from './questions.repo';
import { listHistory } from './reviews.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  runMigrations(db);
  return db;
}

function mcq(db: Db, text: string, objectiveId: number | null = null) {
  return createQuestion(db, {
    objective_id: objectiveId,
    question_text: text,
    question_format: 'mcq',
    choices: [
      { choice_text: 'Right', is_correct: true, rationale: 'yes' },
      { choice_text: 'Wrong A', is_correct: false, rationale: 'no' },
      { choice_text: 'Wrong B', is_correct: false, rationale: 'also no' },
    ],
  });
}

/** Build an MCQ pool: per domain, an objective + n MCQs (+ optional weight row). */
function buildPool(db: Db, spec: { domain: string; weight: number | null; count: number }[]) {
  for (const { domain, weight, count } of spec) {
    if (weight !== null) {
      db.prepare(
        "INSERT INTO domains (cert_path, name, weight) VALUES ('NCA-GENL', ?, ?)",
      ).run(domain, weight);
    }
    const obj = createObjective(db, { title: `${domain} objective`, domain });
    for (let i = 0; i < count; i++) mcq(db, `${domain} q${i}`, obj.id);
  }
}

/** Item count per domain for a session's snapshot. */
function domainCounts(db: Db, sessionId: number): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT COALESCE(o.domain, 'Uncategorized') AS domain, COUNT(*) AS n
       FROM exam_items i
       JOIN recall_questions q ON q.id = i.question_id
       LEFT JOIN objectives o ON o.id = q.objective_id
       WHERE i.session_id = ? GROUP BY 1`,
    )
    .all(sessionId) as { domain: string; n: number }[];
  return new Map(rows.map((r) => [r.domain, r.n]));
}

const JULY_8 = new Date(2026, 6, 8, 9, 0, 0);

describe('allocateByWeight', () => {
  it('splits seats proportionally by weight (largest remainder)', () => {
    const alloc = allocateByWeight(10, [
      { domain: 'A', available: 12, weight: 60 },
      { domain: 'B', available: 8, weight: 40 },
    ]);
    expect(alloc.get('A')).toBe(6);
    expect(alloc.get('B')).toBe(4);
  });

  it('redistributes a capped domain deficit to the rest proportionally', () => {
    const alloc = allocateByWeight(10, [
      { domain: 'A', available: 2, weight: 60 }, // wants 6, has 2
      { domain: 'B', available: 20, weight: 30 },
      { domain: 'C', available: 20, weight: 10 },
    ]);
    expect(alloc.get('A')).toBe(2);
    // The 4-seat deficit flows to B and C in a 3:1 ratio: B 3+3, C 1+1.
    expect(alloc.get('B')).toBe(6);
    expect(alloc.get('C')).toBe(2);
    expect([...alloc.values()].reduce((s, n) => s + n, 0)).toBe(10);
  });

  it('unweighted domains only absorb what weighted domains cannot take', () => {
    const alloc = allocateByWeight(10, [
      { domain: 'A', available: 4, weight: 30 },
      { domain: 'Uncategorized', available: 10, weight: null },
    ]);
    expect(alloc.get('A')).toBe(4);
    expect(alloc.get('Uncategorized')).toBe(6);
  });
});

describe('createExam (F23)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('400s when the MCQ pool is smaller than 10, quoting the pool size', () => {
    buildPool(db, [{ domain: 'A', weight: 100, count: 9 }]);
    expect(() => createExam(db, {})).toThrow(
      'need at least 10 MCQ items to start a mock exam (have 9)',
    );
    expect(() => createExam(db, {})).toThrow(ValidationError);
  });

  it('assembles weight-proportional forms and snapshots items 1..n', () => {
    buildPool(db, [
      { domain: 'A', weight: 60, count: 12 },
      { domain: 'B', weight: 40, count: 8 },
    ]);
    const exam = createExam(db, { question_count: 10 }, JULY_8);

    expect(exam.question_count).toBe(10);
    expect(exam.duration_minutes).toBe(12); // round(10 * 1.2)
    expect(exam.started_at).toBe('2026-07-08 09:00:00');
    expect(exam.completed_at).toBeNull();
    expect(exam.score_percent).toBeNull();

    const counts = domainCounts(db, exam.id);
    expect(counts.get('A')).toBe(6);
    expect(counts.get('B')).toBe(4);

    expect(exam.items.map((i) => i.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const ids = exam.items.map((i) => i.question_id);
    expect(new Set(ids).size).toBe(10); // no repeats
    for (const item of exam.items) {
      expect(item.flagged).toBe(false);
      expect(item.selected_choice_ids).toBeNull();
      expect(item.multi_select).toBe(false);
      expect(item.choices).toHaveLength(3);
      for (const choice of item.choices) {
        expect(choice).not.toHaveProperty('is_correct'); // no answers while running
        expect(choice).not.toHaveProperty('rationale');
      }
    }
  });

  it('a thin domain redistributes its deficit into the rest of the pool', () => {
    buildPool(db, [
      { domain: 'A', weight: 60, count: 2 },
      { domain: 'B', weight: 40, count: 20 },
    ]);
    const exam = createExam(db, { question_count: 10 }, JULY_8);
    const counts = domainCounts(db, exam.id);
    expect(counts.get('A')).toBe(2);
    expect(counts.get('B')).toBe(8);
  });

  it('defaults question_count to min(50, pool) and clamps into 10..pool', () => {
    buildPool(db, [{ domain: 'A', weight: 100, count: 12 }]);
    expect(createExam(db, {}, JULY_8).question_count).toBe(12); // pool < 50
    expect(createExam(db, { question_count: 5 }, JULY_8).question_count).toBe(10);
    expect(createExam(db, { question_count: 100 }, JULY_8).question_count).toBe(12);
    expect(() => createExam(db, { question_count: 'many' })).toThrow(ValidationError);
  });

  it('validates predicted_score (integer 0..100 or null)', () => {
    buildPool(db, [{ domain: 'A', weight: 100, count: 10 }]);
    expect(createExam(db, { predicted_score: 70 }, JULY_8).predicted_score).toBe(70);
    expect(createExam(db, {}, JULY_8).predicted_score).toBeNull();
    expect(() => createExam(db, { predicted_score: 101 })).toThrow(ValidationError);
    expect(() => createExam(db, { predicted_score: 'high' })).toThrow(ValidationError);
  });

  it('lists sessions newest-first and 404s on an unknown id', () => {
    buildPool(db, [{ domain: 'A', weight: 100, count: 10 }]);
    const first = createExam(db, {}, JULY_8);
    const second = createExam(db, {}, JULY_8);
    expect(listExams(db).map((s) => s.id)).toEqual([second.id, first.id]);
    expect(() => getExam(db, 999)).toThrow(NotFoundError);
  });
});

describe('updateExamItem (F23)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
    buildPool(db, [{ domain: 'A', weight: 100, count: 10 }]);
  });

  it('stores answers, flags, and timing, returning the updated view', () => {
    const exam = createExam(db, {}, JULY_8);
    const item = exam.items[0];
    const rightId = getChoices(db, item.question_id).find((c) => c.is_correct)!.id;

    const answered = updateExamItem(db, exam.id, item.position, {
      selected_choice_ids: [rightId],
      flagged: true,
      time_spent_ms: 42_000,
    });
    expect(answered.selected_choice_ids).toEqual([rightId]);
    expect(answered.flagged).toBe(true);
    expect(answered.position).toBe(item.position);

    // Explicit null clears the answer; flag can come back down separately.
    const cleared = updateExamItem(db, exam.id, item.position, {
      selected_choice_ids: null,
      flagged: false,
    });
    expect(cleared.selected_choice_ids).toBeNull();
    expect(cleared.flagged).toBe(false);
  });

  it('rejects choice ids from another question, bad flags, and bad timing', () => {
    const exam = createExam(db, {}, JULY_8);
    const [first, second] = exam.items;
    const foreignId = getChoices(db, second.question_id)[0].id;

    expect(() =>
      updateExamItem(db, exam.id, first.position, { selected_choice_ids: [foreignId] }),
    ).toThrow(ValidationError);
    expect(() =>
      updateExamItem(db, exam.id, first.position, { flagged: 'yes' }),
    ).toThrow(ValidationError);
    expect(() =>
      updateExamItem(db, exam.id, first.position, { time_spent_ms: -5 }),
    ).toThrow(ValidationError);
    expect(() => updateExamItem(db, exam.id, 99, { flagged: true })).toThrow(NotFoundError);
    expect(() => updateExamItem(db, 999, 1, { flagged: true })).toThrow(NotFoundError);
  });
});

describe('finishExam (F23)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
    buildPool(db, [
      { domain: 'A', weight: 60, count: 6 },
      { domain: 'B', weight: 40, count: 4 },
    ]);
  });

  /** Answer every A item correctly, 2 B items wrongly, leave 2 B unanswered. */
  function runScriptedExam(now = JULY_8) {
    const exam = createExam(db, { question_count: 10 }, now);
    let wrongAnswered = 0;
    for (const item of exam.items) {
      const question = getQuestion(db, item.question_id)!;
      const choices = getChoices(db, item.question_id);
      if (question.question_text.startsWith('A')) {
        updateExamItem(db, exam.id, item.position, {
          selected_choice_ids: choices.filter((c) => c.is_correct).map((c) => c.id),
        });
      } else if (wrongAnswered < 2) {
        wrongAnswered += 1;
        updateExamItem(db, exam.id, item.position, {
          selected_choice_ids: [choices.find((c) => !c.is_correct)!.id],
        });
      } // else: unanswered = wrong
    }
    return exam;
  }

  it('grades every item, scores the session, and rolls up domains', () => {
    const exam = runScriptedExam();
    const result = finishExam(db, exam.id, new Date(2026, 6, 8, 10, 30, 0));

    expect(result.score_percent).toBe(60); // 6 of 10
    expect(result.completed_at).toBe('2026-07-08 10:30:00');
    expect(result.domainScores).toEqual([
      { domain: 'A', weight: 60, correct: 6, total: 6 },
      { domain: 'B', weight: 40, correct: 0, total: 4 },
    ]);

    // Review: ordered by position, full choices with answers + rationales.
    expect(result.review.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const item of result.review) {
      expect(typeof item.is_correct).toBe('boolean');
      expect(item.choices.some((c) => c.is_correct)).toBe(true);
      expect(item.choices.every((c) => typeof c.rationale === 'string')).toBe(true);
    }
    const unanswered = result.review.filter((r) => r.selected_choice_ids === null);
    expect(unanswered).toHaveLength(2);
    expect(unanswered.every((r) => !r.is_correct)).toBe(true); // unanswered = wrong

    // getExam now returns the result view, and item updates are frozen.
    expect(getExam(db, exam.id)).toHaveProperty('review');
    expect(() => updateExamItem(db, exam.id, 1, { flagged: true })).toThrow(ConflictError);
    expect(() => finishExam(db, exam.id)).toThrow(ConflictError);
  });

  it("writes one source='exam' attempt per item and NEVER touches the SRS (core invariant)", () => {
    const exam = runScriptedExam();
    finishExam(db, exam.id, new Date(2026, 6, 8, 10, 30, 0));

    for (const item of exam.items) {
      const question = getQuestion(db, item.question_id)!;
      const history = listHistory(db, item.question_id);
      expect(history).toHaveLength(1);
      const attempt = history[0];
      expect(attempt.source).toBe('exam');
      expect(attempt.session_id).toBe(exam.id);
      expect(attempt.rating).toBe(question.question_text.startsWith('A') ? 4 : 1);
      expect(attempt.next_review_date).toBeNull();

      // Cache columns stay pristine — exam attempts never enter the SRS.
      expect(question.next_review_date).toBeNull();
      expect(question.last_attempted_date).toBeNull();
      expect(question.interval_days).toBeNull();
      expect(question.self_score).toBeNull();
      expect(question.lapses).toBe(0);
    }
  });
});

describe('examReadiness (F23)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('is empty-safe before any completed mock', () => {
    expect(examReadiness(db)).toEqual({
      mockCount: 0,
      estimate: null,
      band: 6,
      history: [],
    });
  });

  it('estimates from the median of the two most recent completed scores', () => {
    buildPool(db, [{ domain: 'A', weight: 100, count: 10 }]);

    // Mock 1: everything answered correctly -> 100.
    const first = createExam(db, {}, JULY_8);
    for (const item of first.items) {
      updateExamItem(db, first.id, item.position, {
        selected_choice_ids: getChoices(db, item.question_id)
          .filter((c) => c.is_correct)
          .map((c) => c.id),
      });
    }
    finishExam(db, first.id, new Date(2026, 6, 8, 10, 0, 0));
    expect(examReadiness(db).estimate).toBe(100); // single mock -> its score

    // Mock 2 (newer): nothing answered -> 0. Median of {100, 0} = 50.
    const second = createExam(db, {}, new Date(2026, 6, 9, 9, 0, 0));
    finishExam(db, second.id, new Date(2026, 6, 9, 10, 0, 0));
    const two = examReadiness(db);
    expect(two.mockCount).toBe(2);
    expect(two.estimate).toBe(50);
    expect(two.band).toBe(6);
    expect(two.history.map((h) => h.id)).toEqual([second.id, first.id]); // newest first

    // An in-progress session never counts.
    createExam(db, {}, new Date(2026, 6, 10, 9, 0, 0));
    expect(examReadiness(db).mockCount).toBe(2);
  });

  it('caps the history at 10 while still counting every completed mock', () => {
    const insert = db.prepare(
      `INSERT INTO exam_sessions (started_at, completed_at, question_count, duration_minutes, score_percent)
       VALUES (@t, @t, 10, 12, @score)`,
    );
    for (let i = 1; i <= 12; i++) {
      insert.run({ t: `2026-06-${String(i).padStart(2, '0')} 09:00:00`, score: 50 + i });
    }
    const readiness = examReadiness(db);
    expect(readiness.mockCount).toBe(12);
    expect(readiness.history).toHaveLength(10);
    expect(readiness.history[0].score_percent).toBe(62); // newest (June 12) first
    expect(readiness.estimate).toBe(61.5); // (62 + 61) / 2
  });
});

describe('exam session row plumbing', () => {
  it('getSession returns undefined for unknown ids', () => {
    const db = memoryDb();
    expect(getSession(db, 1)).toBeUndefined();
  });
});
