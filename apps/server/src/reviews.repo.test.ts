import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, runMigrations, type Db } from './db';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { createObjective } from './objectives.repo';
import { createQuestion, getQuestion } from './questions.repo';
import {
  forecast,
  listDue,
  listHistory,
  NEW_CARDS_PER_DAY,
  recordAttempt,
  recordPracticeAttempt,
  undoAttempt,
} from './reviews.repo';
import { seed } from './seed';
import { updateSettings } from './settings.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  runMigrations(db);
  return db;
}

const JULY_8 = new Date(2026, 6, 8, 9, 30, 0);

describe('reviews repository', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('records an attempt and mirrors state onto the question cache', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const attempt = recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8);

    expect(attempt.rating).toBe(4);
    expect(attempt.self_score).toBe(4); // mirrored
    expect(attempt.next_review_date).toBe('2026-07-15'); // +7 days

    const cached = getQuestion(db, q.id)!;
    expect(cached.next_review_date).toBe('2026-07-15');
    expect(cached.last_attempted_date).toBe('2026-07-08');
    expect(cached.self_score).toBe(4);
  });

  it('stores the user answer', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const attempt = recordAttempt(
      db,
      { question_id: q.id, rating: 3, user_answer: 'my answer' },
      JULY_8,
    );
    expect(attempt.user_answer).toBe('my answer');
  });

  it('due queue includes new + overdue and excludes future', () => {
    const neverAttempted = createQuestion(db, { question_text: 'new one' });
    const willBeFuture = createQuestion(db, { question_text: 'answered well' });
    recordAttempt(db, { question_id: willBeFuture.id, rating: 5 }, JULY_8); // due 2026-07-22

    // As of 2026-07-10: the new question is due, the rated-5 one is not yet.
    const due = listDue(db, '2026-07-10');
    const ids = due.map((d) => d.id);
    expect(ids).toContain(neverAttempted.id);
    expect(ids).not.toContain(willBeFuture.id);

    const newItem = due.find((d) => d.id === neverAttempted.id)!;
    expect(newItem.is_new).toBe(true);
  });

  it('a rated question becomes due again once its interval elapses', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 1 }, JULY_8); // due 2026-07-09
    expect(listDue(db, '2026-07-08').map((d) => d.id)).not.toContain(q.id);
    expect(listDue(db, '2026-07-09').map((d) => d.id)).toContain(q.id);
  });

  it('keeps a full attempt history, newest first', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 1 }, JULY_8);
    recordAttempt(db, { question_id: q.id, rating: 5 }, JULY_8);
    const history = listHistory(db, q.id);
    expect(history).toHaveLength(2);
    expect(history[0].rating).toBe(5); // most recent first
  });

  it('cascades: deleting a question removes its attempts', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 2 }, JULY_8);
    db.prepare('DELETE FROM recall_questions WHERE id = ?').run(q.id);
    expect(listHistory(db, q.id)).toHaveLength(0);
  });

  it('rejects an invalid rating', () => {
    const q = createQuestion(db, { question_text: 'q' });
    expect(() => recordAttempt(db, { question_id: q.id, rating: 9 }, JULY_8)).toThrow(
      /invalid rating/,
    );
  });

  it('stores pre-reveal confidence on the attempt (F18)', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const sure = recordAttempt(
      db,
      { question_id: q.id, rating: 2, confidence: 3 },
      JULY_8,
    );
    expect(sure.confidence).toBe(3);
    expect(listHistory(db, q.id)[0].confidence).toBe(3);

    // Confidence is optional — omitted (or null) stores NULL.
    const unstated = recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8);
    expect(unstated.confidence).toBeNull();
  });

  it('rejects an out-of-range or non-integer confidence and inserts nothing', () => {
    const q = createQuestion(db, { question_text: 'q' });
    for (const bad of [0, 4, 1.5, 'sure']) {
      expect(() =>
        recordAttempt(
          db,
          { question_id: q.id, rating: 3, confidence: bad as number },
          JULY_8,
        ),
      ).toThrow(ValidationError);
    }
    expect(listHistory(db, q.id)).toHaveLength(0);
  });

  it('throws when the question does not exist', () => {
    expect(() => recordAttempt(db, { question_id: 999, rating: 3 }, JULY_8)).toThrow(
      NotFoundError,
    );
  });
});

describe('recordAttempt — growing ladder', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('grows the interval on repeated rating-4 success (7 -> 14 -> 28)', () => {
    const q = createQuestion(db, { question_text: 'q' });

    const first = recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8);
    expect(first.interval_days).toBe(7);
    expect(getQuestion(db, q.id)!.interval_days).toBe(7);

    const second = recordAttempt(
      db,
      { question_id: q.id, rating: 4 },
      new Date(2026, 6, 15),
    );
    expect(second.interval_days).toBe(14);
    expect(second.next_review_date).toBe('2026-07-29');

    const third = recordAttempt(
      db,
      { question_id: q.id, rating: 4 },
      new Date(2026, 6, 29),
    );
    expect(third.interval_days).toBe(28);
    const cached = getQuestion(db, q.id)!;
    expect(cached.interval_days).toBe(28);
    expect(cached.lapses).toBe(0);
    expect(cached.next_review_date).toBe('2026-08-26');
  });

  it('a lapse resets the interval to the ladder and counts on the question', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8); // 7
    recordAttempt(db, { question_id: q.id, rating: 4 }, new Date(2026, 6, 15)); // 14

    const lapse = recordAttempt(
      db,
      { question_id: q.id, rating: 2 },
      new Date(2026, 6, 29),
    );
    expect(lapse.interval_days).toBe(2);
    const cached = getQuestion(db, q.id)!;
    expect(cached.interval_days).toBe(2);
    expect(cached.lapses).toBe(1);
    expect(cached.next_review_date).toBe('2026-07-31');
  });

  it('caps the interval when an exam date is set (40 days out -> 6)', () => {
    updateSettings(db, { exam_date: '2026-08-17' }); // 40 days after JULY_8
    const q = createQuestion(db, { question_text: 'q' });
    const attempt = recordAttempt(db, { question_id: q.id, rating: 5 }, JULY_8);
    expect(attempt.interval_days).toBe(6); // 14 uncapped
    expect(attempt.next_review_date).toBe('2026-07-14');
  });

  it('undo restores interval_days and recounts lapses from remaining history', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 1 }, JULY_8); // lapse, interval 1
    recordAttempt(db, { question_id: q.id, rating: 4 }, new Date(2026, 6, 9)); // 7
    const third = recordAttempt(
      db,
      { question_id: q.id, rating: 2 }, // lapse #2, interval 2
      new Date(2026, 6, 16),
    );
    expect(getQuestion(db, q.id)!.lapses).toBe(2);

    const question = undoAttempt(db, third.id);
    expect(question.interval_days).toBe(7); // back to the rating-4 attempt
    expect(question.lapses).toBe(1); // only the rating-1 attempt remains a lapse
  });

  it('undoing the only attempt clears interval_days and lapses', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const attempt = recordAttempt(db, { question_id: q.id, rating: 1 }, JULY_8);
    const question = undoAttempt(db, attempt.id);
    expect(question.interval_days).toBeNull();
    expect(question.lapses).toBe(0);
  });
});

describe('listDue — new-card cap and domain interleaving', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('caps new cards at NEW_CARDS_PER_DAY on the full seeded question bank', () => {
    seed(db);
    const total = db
      .prepare('SELECT COUNT(*) AS n FROM recall_questions')
      .get() as { n: number };
    expect(total.n).toBeGreaterThan(NEW_CARDS_PER_DAY); // 100 in the seed

    const due = listDue(db, '2026-07-10');
    const reviews = due.filter((d) => !d.is_new);
    expect(reviews).toHaveLength(0); // nothing attempted yet
    expect(due).toHaveLength(NEW_CARDS_PER_DAY);
  });

  it('counts questions first attempted today against the cap', () => {
    seed(db);
    const firstBatch = listDue(db, '2026-07-08');
    // First-attempt 5 new questions "today" — a page reload must not hand out
    // another full batch of 15 on top of them.
    for (const item of firstBatch.slice(0, 5)) {
      recordAttempt(db, { question_id: item.id, rating: 5 }, JULY_8);
    }
    const reloaded = listDue(db, '2026-07-08');
    expect(reloaded.filter((d) => d.is_new)).toHaveLength(NEW_CARDS_PER_DAY - 5);
  });

  it('lists scheduled reviews (overdue first) before new cards', () => {
    const overdue = createQuestion(db, { question_text: 'overdue' });
    const dueToday = createQuestion(db, { question_text: 'due today' });
    const brandNew = createQuestion(db, { question_text: 'brand new' });
    recordAttempt(db, { question_id: overdue.id, rating: 1 }, JULY_8); // due 07-09
    recordAttempt(db, { question_id: dueToday.id, rating: 2 }, JULY_8); // due 07-10

    const due = listDue(db, '2026-07-10');
    expect(due.map((d) => d.id)).toEqual([overdue.id, dueToday.id, brandNew.id]);
    expect(due.map((d) => d.is_new)).toEqual([false, false, true]);
  });

  it('interleaves the new-card block round-robin across domains', () => {
    const domains = ['Data', 'Ops', 'Theory'];
    for (const domain of domains) {
      const obj = createObjective(db, { title: `${domain} objective`, domain });
      for (let i = 0; i < 5; i++) {
        createQuestion(db, { objective_id: obj.id, question_text: `${domain} q${i}` });
      }
    }

    const due = listDue(db, '2026-07-10');
    expect(due).toHaveLength(15);
    // Deterministic strict cycle: Data, Ops, Theory, Data, Ops, Theory, ...
    due.forEach((item, i) => {
      expect(item.question_text.startsWith(domains[i % domains.length])).toBe(true);
    });
    // The property that matters: no long same-domain runs.
    for (let i = 2; i < due.length; i++) {
      const run = [due[i - 2], due[i - 1], due[i]].map((d) => d.objective_title);
      expect(new Set(run).size).toBeGreaterThan(1);
    }
  });

  it('puts uncategorized new cards after categorized domains', () => {
    createQuestion(db, { question_text: 'no domain' });
    const obj = createObjective(db, { title: 'Beta objective', domain: 'Beta' });
    createQuestion(db, { objective_id: obj.id, question_text: 'beta q' });

    const due = listDue(db, '2026-07-10');
    expect(due.map((d) => d.question_text)).toEqual(['beta q', 'no domain']);
  });

  it('reads the new-card budget from the new_cards_per_day setting', () => {
    updateSettings(db, { new_cards_per_day: 3 });
    for (let i = 0; i < 10; i++) createQuestion(db, { question_text: `q${i}` });
    expect(listDue(db, '2026-07-10')).toHaveLength(3);

    updateSettings(db, { new_cards_per_day: 0 });
    expect(listDue(db, '2026-07-10')).toHaveLength(0);
    expect(NEW_CARDS_PER_DAY).toBe(15); // the default constant is untouched
  });
});

describe('listDue — objective/domain scope (F14)', () => {
  let db: Db;
  let dataObj: { id: number };
  let opsObj: { id: number };

  beforeEach(() => {
    db = memoryDb();
    dataObj = createObjective(db, { title: 'Data objective', domain: 'Data' });
    opsObj = createObjective(db, { title: 'Ops objective', domain: 'Ops' });
    for (let i = 0; i < 3; i++) {
      createQuestion(db, { objective_id: dataObj.id, question_text: `data q${i}` });
      createQuestion(db, { objective_id: opsObj.id, question_text: `ops q${i}` });
    }
    createQuestion(db, { question_text: 'unlinked q' });
  });

  it('filters by objective_id (new and review cards)', () => {
    const due = listDue(db, '2026-07-10', { objectiveId: dataObj.id });
    expect(due).toHaveLength(3);
    expect(due.every((d) => d.objective_id === dataObj.id)).toBe(true);

    // A scheduled review inside the scope still shows; outside doesn't.
    recordAttempt(db, { question_id: due[0].id, rating: 1 }, JULY_8); // due 07-09
    const later = listDue(db, '2026-07-10', { objectiveId: dataObj.id });
    expect(later.filter((d) => !d.is_new).map((d) => d.id)).toEqual([due[0].id]);
    const opsScoped = listDue(db, '2026-07-10', { objectiveId: opsObj.id });
    expect(opsScoped.every((d) => d.objective_id === opsObj.id)).toBe(true);
  });

  it('filters by domain via the linked objective', () => {
    const due = listDue(db, '2026-07-10', { domain: 'Ops' });
    expect(due).toHaveLength(3);
    expect(due.every((d) => d.question_text.startsWith('ops'))).toBe(true);
    expect(listDue(db, '2026-07-10', { domain: 'Nope' })).toHaveLength(0);
  });

  it('objective_id wins when both filters are given', () => {
    const due = listDue(db, '2026-07-10', { objectiveId: dataObj.id, domain: 'Ops' });
    expect(due.every((d) => d.objective_id === dataObj.id)).toBe(true);
  });

  it('keeps the new-card cap global across scopes', () => {
    updateSettings(db, { new_cards_per_day: 4 });
    // Spend 3 of the 4-card budget on Data first attempts "today"...
    const data = listDue(db, '2026-07-08', { objectiveId: dataObj.id });
    for (const item of data) {
      recordAttempt(db, { question_id: item.id, rating: 5 }, JULY_8);
    }
    // ...so any scope — including a different one — has 1 new card left today.
    expect(
      listDue(db, '2026-07-08', { domain: 'Ops' }).filter((d) => d.is_new),
    ).toHaveLength(1);
    expect(listDue(db, '2026-07-08').filter((d) => d.is_new)).toHaveLength(1);
  });
});

describe('SRS exclusions — MCQs never enter the review pipeline (F21/F22)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  function mcq(db: Db, text: string) {
    return createQuestion(db, {
      question_text: text,
      question_format: 'mcq',
      choices: [
        { choice_text: 'A', is_correct: true, rationale: 'a' },
        { choice_text: 'B', is_correct: false, rationale: 'b' },
        { choice_text: 'C', is_correct: false, rationale: 'c' },
      ],
    });
  }

  it('listDue serves only recall cards', () => {
    const recall = createQuestion(db, { question_text: 'recall card' });
    mcq(db, 'mcq card');
    const due = listDue(db, '2026-07-10');
    expect(due.map((d) => d.id)).toEqual([recall.id]);
  });

  it('a stray next_review_date on an MCQ never reaches the queue or forecast', () => {
    const m = mcq(db, 'mcq card');
    // Simulate corruption: no code path sets this for MCQs, but the queries
    // must exclude by format, not rely on the cache staying NULL.
    db.prepare('UPDATE recall_questions SET next_review_date = ? WHERE id = ?').run(
      '2026-07-09',
      m.id,
    );
    expect(listDue(db, '2026-07-10')).toHaveLength(0);
    expect(forecast(db, 7, '2026-07-08').reduce((s, d) => s + d.count, 0)).toBe(0);
  });

  it('drill attempts on MCQs do not spend the new-card budget', () => {
    updateSettings(db, { new_cards_per_day: 3 });
    for (let i = 0; i < 3; i++) createQuestion(db, { question_text: `recall ${i}` });
    const m1 = mcq(db, 'mcq 1');
    const m2 = mcq(db, 'mcq 2');
    // Two MCQ first-attempts "today" via the practice path (no SRS touch).
    for (const m of [m1, m2]) {
      const right = db
        .prepare('SELECT id FROM question_choices WHERE question_id = ? AND is_correct = 1')
        .get(m.id) as { id: number };
      recordPracticeAttempt(
        db,
        { question_id: m.id, source: 'drill', rating: 4, selected_choice_ids: [right.id] },
        JULY_8,
      );
    }
    // The full recall budget is still available.
    expect(listDue(db, '2026-07-08').filter((d) => d.is_new)).toHaveLength(3);
  });

  it("recordAttempt marks rows source='review' and round-trips selected ids as null", () => {
    const q = createQuestion(db, { question_text: 'q' });
    const attempt = recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8);
    expect(attempt.source).toBe('review');
    expect(attempt.session_id).toBeNull();
    expect(attempt.selected_choice_ids).toBeNull();
  });

  it('undo refuses non-review attempts with ConflictError', () => {
    const m = mcq(db, 'mcq card');
    const attempt = recordPracticeAttempt(
      db,
      { question_id: m.id, source: 'drill', rating: 1, selected_choice_ids: null },
      JULY_8,
    );
    expect(() => undoAttempt(db, attempt.id)).toThrow(ConflictError);
    expect(() => undoAttempt(db, attempt.id)).toThrow(/only review attempts/);
    expect(listHistory(db, m.id)).toHaveLength(1);
  });
});

describe('undoAttempt', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('restores the cache from the previous attempt', () => {
    const q = createQuestion(db, { question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8); // next 07-15
    const second = recordAttempt(
      db,
      { question_id: q.id, rating: 1 },
      new Date(2026, 6, 9, 10, 0, 0), // next 07-10
    );

    const question = undoAttempt(db, second.id);
    expect(question.last_attempted_date).toBe('2026-07-08');
    expect(question.next_review_date).toBe('2026-07-15');
    expect(question.self_score).toBe(4);
    expect(listHistory(db, q.id)).toHaveLength(1);
  });

  it('resets the question to "new" when the only attempt is undone', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const attempt = recordAttempt(db, { question_id: q.id, rating: 5 }, JULY_8);

    const question = undoAttempt(db, attempt.id);
    expect(question.last_attempted_date).toBeNull();
    expect(question.next_review_date).toBeNull();
    expect(question.self_score).toBeNull();

    const item = listDue(db, '2026-07-08').find((d) => d.id === q.id)!;
    expect(item.is_new).toBe(true);
  });

  it('rejects undoing a non-latest attempt and deletes nothing', () => {
    const q = createQuestion(db, { question_text: 'q' });
    const first = recordAttempt(db, { question_id: q.id, rating: 3 }, JULY_8);
    recordAttempt(db, { question_id: q.id, rating: 4 }, JULY_8);

    expect(() => undoAttempt(db, first.id)).toThrow(ConflictError);
    expect(listHistory(db, q.id)).toHaveLength(2);
  });

  it('throws NotFoundError for an unknown attempt id', () => {
    expect(() => undoAttempt(db, 999)).toThrow(NotFoundError);
  });
});

describe('forecast', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('buckets upcoming reviews by date with zero-filled empty days', () => {
    const q1 = createQuestion(db, { question_text: 'q1' });
    const q2 = createQuestion(db, { question_text: 'q2' });
    const q3 = createQuestion(db, { question_text: 'q3' });
    const q4 = createQuestion(db, { question_text: 'q4' });
    recordAttempt(db, { question_id: q1.id, rating: 1 }, JULY_8); // 07-09
    recordAttempt(db, { question_id: q2.id, rating: 1 }, JULY_8); // 07-09
    recordAttempt(db, { question_id: q3.id, rating: 3 }, JULY_8); // 07-12
    recordAttempt(db, { question_id: q4.id, rating: 5 }, JULY_8); // 07-22, outside window

    const days = forecast(db, 7, '2026-07-08');
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: '2026-07-09', count: 2 });
    expect(days[1]).toEqual({ date: '2026-07-10', count: 0 });
    expect(days[3]).toEqual({ date: '2026-07-12', count: 1 });
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(3);
  });

  it('excludes questions due today and never-attempted questions', () => {
    const dueNow = createQuestion(db, { question_text: 'due today' });
    createQuestion(db, { question_text: 'never attempted' });
    recordAttempt(db, { question_id: dueNow.id, rating: 1 }, JULY_8); // 07-09

    const days = forecast(db, 7, '2026-07-09'); // its due date IS today
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });
});
