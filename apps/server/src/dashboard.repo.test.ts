import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, runMigrations, type Db } from './db';
import { createObjective, updateObjective } from './objectives.repo';
import { createQuestion } from './questions.repo';
import { recordAttempt } from './reviews.repo';
import { createTemplate } from './lab-templates.repo';
import { createRun } from './lab-runs.repo';
import { computeStreak, getDashboard } from './dashboard.repo';
import { updateSettings } from './settings.repo';
import { addDaysIso } from './sr';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  runMigrations(db);
  return db;
}

const TODAY = '2026-07-08';

describe('dashboard aggregation', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('summarizes an empty database', () => {
    const d = getDashboard(db, TODAY);
    expect(d.objectives.total).toBe(0);
    expect(d.questions.total).toBe(0);
    expect(d.weakObjectives).toEqual([]);
    expect(d.objectives.avgConfidence).toBeNull();
  });

  it('counts objectives by status and confidence', () => {
    createObjective(db, { title: 'A', domain: 'Core', status: 'confident', confidence: 5 });
    createObjective(db, { title: 'B', domain: 'Core', status: 'learning', confidence: 2 });
    createObjective(db, { title: 'C', domain: 'Core' }); // unrated, not_started
    const d = getDashboard(db, TODAY);
    expect(d.objectives.total).toBe(3);
    expect(d.objectives.byStatus.confident).toBe(1);
    expect(d.objectives.byStatus.not_started).toBe(1);
    expect(d.objectives.weak).toBe(1);
    expect(d.objectives.unrated).toBe(1);
    expect(d.objectives.avgConfidence).toBeCloseTo(3.5); // (5+2)/2
  });

  it('counts due questions (new + overdue)', () => {
    const o = createObjective(db, { title: 'A' });
    const q1 = createQuestion(db, { objective_id: o.id, question_text: 'new' });
    createQuestion(db, { objective_id: o.id, question_text: 'also new' });
    recordAttempt(db, { question_id: q1.id, rating: 5 }, new Date(2026, 6, 8)); // due 2026-07-22
    // As of TODAY: one attempted-and-scheduled-future, one never attempted
    const d = getDashboard(db, TODAY);
    expect(d.questions.total).toBe(2);
    expect(d.questions.due).toBe(1); // only the never-attempted one
    expect(d.questions.attempted).toBe(1);
  });

  it('rolls up domain stats and completed lab runs', () => {
    const o = createObjective(db, { title: 'A', domain: 'Experimentation', confidence: 4 });
    createTemplate(db, { title: 't', objective_id: o.id });
    createRun(db, { objective_id: o.id, status: 'completed' });
    createRun(db, { objective_id: o.id, status: 'in_progress' });
    const d = getDashboard(db, TODAY);
    const exp = d.domains.find((x) => x.domain === 'Experimentation')!;
    expect(exp.objectiveCount).toBe(1);
    expect(exp.runsCompleted).toBe(1);
    expect(d.labs.runsCompleted).toBe(1);
    expect(d.labs.runsInProgress).toBe(1);
    expect(d.labs.templates).toBe(1);
  });

  it('ranks weak objectives with reasons', () => {
    // Strong objective: high confidence, has a question, a run, evidence
    const strong = createObjective(db, {
      title: 'Strong',
      confidence: 5,
      status: 'confident',
      evidence_of_understanding: 'explained it',
    });
    createQuestion(db, { objective_id: strong.id, question_text: 'q' });
    createRun(db, { objective_id: strong.id, status: 'completed' });
    // Weak objective: unset confidence, not started, no questions/runs/evidence
    const weak = createObjective(db, { title: 'Weak' });

    const d = getDashboard(db, TODAY);
    expect(d.weakObjectives[0].title).toBe('Weak');
    expect(d.weakObjectives[0].reasons).toContain('not started');
    expect(d.weakObjectives[0].reasons).toContain('no lab runs');
    expect(d.weakObjectives[0].weaknessScore).toBeGreaterThan(
      d.weakObjectives[d.weakObjectives.length - 1].weaknessScore,
    );
  });

  it('reports recent review activity', () => {
    const o = createObjective(db, { title: 'A' });
    const q = createQuestion(db, { objective_id: o.id, question_text: 'q' });
    recordAttempt(db, { question_id: q.id, rating: 4 }, new Date(2026, 6, 8));
    const d = getDashboard(db, TODAY);
    expect(d.reviews.totalAttempts).toBe(1);
    expect(d.reviews.last7Days).toBe(1);
    expect(d.reviews.avgRecentRating).toBeCloseTo(4);
  });

  it('reports the exam countdown from settings', () => {
    expect(getDashboard(db, TODAY).examDate).toBeNull();
    expect(getDashboard(db, TODAY).daysToExam).toBeNull();

    updateSettings(db, { exam_date: '2026-07-18' });
    const d = getDashboard(db, TODAY);
    expect(d.examDate).toBe('2026-07-18');
    expect(d.daysToExam).toBe(10);

    updateSettings(db, { exam_date: '2026-07-01' }); // already past
    expect(getDashboard(db, TODAY).daysToExam).toBe(-7);
  });

  it('question stats and weak-objective counts exclude MCQs (F21)', () => {
    const o = createObjective(db, { title: 'MCQ-only objective', domain: 'Core' });
    createQuestion(db, { objective_id: o.id, question_text: 'recall q' });
    createQuestion(db, {
      objective_id: o.id,
      question_text: 'mcq q',
      question_format: 'mcq',
      choices: [
        { choice_text: 'A', is_correct: true, rationale: 'a' },
        { choice_text: 'B', is_correct: false, rationale: 'b' },
        { choice_text: 'C', is_correct: false, rationale: 'c' },
      ],
    });

    const d = getDashboard(db, TODAY);
    // The MCQ is invisible to the review-facing counters...
    expect(d.questions.total).toBe(1);
    expect(d.questions.due).toBe(1);
    const weak = d.weakObjectives.find((w) => w.id === o.id)!;
    expect(weak.questionCount).toBe(1);
    expect(weak.dueCount).toBe(1);
    // ...and to the per-domain rollup counts.
    const core = d.domains.find((x) => x.domain === 'Core')!;
    expect(core.questionCount).toBe(1);
    expect(core.dueCount).toBe(1);
  });
});

// Insert `count` attempts directly (bypassing the scheduler) so a test can
// paint an exact history. attempted_date is LOCAL time by convention.
function insertAttempts(
  db: Db,
  questionId: number,
  day: string,
  count: number,
  rating = 4,
): void {
  const stmt = db.prepare(
    `INSERT INTO answer_attempts (question_id, self_score, rating, attempted_date)
     VALUES (@questionId, @rating, @rating, @attemptedDate)`,
  );
  for (let i = 0; i < count; i++) {
    stmt.run({ questionId, rating, attemptedDate: `${day} 09:${String(i).padStart(2, '0')}:00` });
  }
}

describe('streak walker (F13)', () => {
  const TODAY = '2026-07-08';
  let db: Db;
  let qid: number;

  beforeEach(() => {
    db = memoryDb();
    // One never-attempted question keeps the due queue non-empty, so days only
    // count as active via the 5-attempt goal (the queue-cleared path is off).
    qid = createQuestion(db, { question_text: 'streak fodder' }).id;
  });

  it('returns zeros on an empty history', () => {
    expect(computeStreak(db, TODAY)).toEqual({
      current: 0,
      longest: 0,
      activeToday: false,
      reviewsToday: 0,
      repairTokens: 0,
      dailyGoal: 5,
    });
  });

  it('stays source-inclusive: drill and exam attempts count as study (F22/F23)', () => {
    // 3 drill + 2 exam attempts on one day meet the 5-attempt goal — a
    // mock-exam day is a study day.
    const stmt = db.prepare(
      `INSERT INTO answer_attempts (question_id, rating, source, attempted_date)
       VALUES (?, ?, ?, ?)`,
    );
    for (let i = 0; i < 3; i++) stmt.run(qid, 4, 'drill', `${TODAY} 09:0${i}:00`);
    for (let i = 0; i < 2; i++) stmt.run(qid, 1, 'exam', `${TODAY} 10:0${i}:00`);

    const s = computeStreak(db, TODAY);
    expect(s.current).toBe(1);
    expect(s.activeToday).toBe(true);
    expect(s.reviewsToday).toBe(5);
  });

  it('counts consecutive days that meet the daily goal', () => {
    for (const day of ['2026-07-06', '2026-07-07', '2026-07-08']) {
      insertAttempts(db, qid, day, 5);
    }
    const s = computeStreak(db, TODAY);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.activeToday).toBe(true);
    expect(s.reviewsToday).toBe(5);
    expect(s.repairTokens).toBe(0); // 3 active days, no token earned yet
  });

  it('a past sub-goal day breaks the streak when no token is banked', () => {
    insertAttempts(db, qid, '2026-07-04', 5);
    insertAttempts(db, qid, '2026-07-05', 5);
    insertAttempts(db, qid, '2026-07-06', 4); // below the goal of 5
    insertAttempts(db, qid, '2026-07-07', 5);
    insertAttempts(db, qid, '2026-07-08', 5);
    const s = computeStreak(db, TODAY);
    expect(s.current).toBe(2); // 07-07 + 07-08
    expect(s.longest).toBe(2);
  });

  it('a token earned by 7 active days bridges one missed day', () => {
    // 2026-06-29 .. 2026-07-05: seven active days -> earns 1 token
    let day = '2026-06-29';
    for (let i = 0; i < 7; i++, day = addDaysIso(day, 1)) {
      insertAttempts(db, qid, day, 5);
    }
    // 07-06 missed (token consumed), 07-07 + 07-08 active
    insertAttempts(db, qid, '2026-07-07', 5);
    insertAttempts(db, qid, '2026-07-08', 5);
    const s = computeStreak(db, TODAY);
    expect(s.current).toBe(10); // 7 + repaired day + 2
    expect(s.longest).toBe(10);
    expect(s.repairTokens).toBe(0); // spent on 07-06
  });

  it('the token bank caps at 2 and a third gap day breaks the streak', () => {
    // 21 straight active days (2026-06-15 .. 2026-07-05) earn at 7/14/21,
    // but the bank holds only 2.
    let day = '2026-06-15';
    for (let i = 0; i < 21; i++, day = addDaysIso(day, 1)) {
      insertAttempts(db, qid, day, 5);
    }
    // Three missed days: two repaired, the third breaks.
    insertAttempts(db, qid, '2026-07-09', 5);
    insertAttempts(db, qid, '2026-07-10', 5);
    const s = computeStreak(db, '2026-07-10');
    expect(s.current).toBe(2); // restarted on 07-09
    expect(s.longest).toBe(23); // 21 active + 2 repaired
    expect(s.repairTokens).toBe(0);
  });

  it("an inactive today doesn't break the streak (grace until midnight)", () => {
    insertAttempts(db, qid, '2026-07-06', 5);
    insertAttempts(db, qid, '2026-07-07', 5);
    insertAttempts(db, qid, '2026-07-08', 2); // below goal, queue not cleared
    const s = computeStreak(db, TODAY);
    expect(s.current).toBe(2); // through yesterday
    expect(s.activeToday).toBe(false);
    expect(s.reviewsToday).toBe(2);
  });

  it('today is active with a single review when the queue is cleared', () => {
    // The only question gets attempted today via the real path, so the due
    // queue is empty afterwards -> 1 review is enough for an active day.
    recordAttempt(db, { question_id: qid, rating: 5 }, new Date(2026, 6, 8, 9, 0, 0));
    const s = computeStreak(db, TODAY);
    expect(s.current).toBe(1);
    expect(s.activeToday).toBe(true);
    expect(s.reviewsToday).toBe(1);
  });
});

describe('per-domain retention (F15)', () => {
  const TODAY = '2026-07-08';
  let db: Db;

  beforeEach(() => {
    db = memoryDb();
  });

  it('computes attempt counts, success/again rates, and last attempt date', () => {
    const alpha = createObjective(db, { title: 'A', domain: 'Alpha' });
    const beta = createObjective(db, { title: 'B', domain: 'Beta' });
    const qa = createQuestion(db, { objective_id: alpha.id, question_text: 'qa' });
    createQuestion(db, { objective_id: beta.id, question_text: 'qb' });

    recordAttempt(db, { question_id: qa.id, rating: 4 }, new Date(2026, 6, 6));
    recordAttempt(db, { question_id: qa.id, rating: 5 }, new Date(2026, 6, 7));
    recordAttempt(db, { question_id: qa.id, rating: 2 }, new Date(2026, 6, 8));

    const d = getDashboard(db, TODAY);
    const alphaStat = d.domains.find((x) => x.domain === 'Alpha')!;
    expect(alphaStat.attemptCount).toBe(3);
    expect(alphaStat.successRate).toBeCloseTo(2 / 3);
    expect(alphaStat.againRate).toBeCloseTo(1 / 3);
    expect(alphaStat.lastAttemptDate).toBe('2026-07-08');

    const betaStat = d.domains.find((x) => x.domain === 'Beta')!;
    expect(betaStat.attemptCount).toBe(0);
    expect(betaStat.successRate).toBeNull();
    expect(betaStat.againRate).toBeNull();
    expect(betaStat.lastAttemptDate).toBeNull();
  });

  it('rolls attempts on unlinked questions into Uncategorized', () => {
    const qu = createQuestion(db, { question_text: 'unlinked' });
    recordAttempt(db, { question_id: qu.id, rating: 1 }, new Date(2026, 6, 8));

    const stat = getDashboard(db, TODAY).domains.find(
      (x) => x.domain === 'Uncategorized',
    )!;
    expect(stat.attemptCount).toBe(1);
    expect(stat.successRate).toBe(0);
    expect(stat.againRate).toBe(1);
    expect(stat.objectiveCount).toBe(0); // no objective produced this domain
  });
});

describe('readiness (F13 mastery signal)', () => {
  const TODAY = '2026-07-08';
  let db: Db;

  beforeEach(() => {
    db = memoryDb();
  });

  it('needs history before it can be ready', () => {
    expect(getDashboard(db, TODAY).readiness).toEqual({
      ready: false,
      detail: 'Not enough review history yet (need 20+ rated attempts per domain)',
    });

    const o = createObjective(db, { title: 'A', domain: 'Solo' });
    const q = createQuestion(db, { objective_id: o.id, question_text: 'q' });
    insertAttempts(db, q.id, '2026-07-07', 5); // only 5 of the 20 needed
    expect(getDashboard(db, TODAY).readiness.ready).toBe(false);
    expect(getDashboard(db, TODAY).readiness.detail).toMatch(/Not enough review history/);
  });

  it('is ready when every domain has 20+ attempts at >= 85% success', () => {
    const o = createObjective(db, { title: 'A', domain: 'Solo' });
    const q = createQuestion(db, { objective_id: o.id, question_text: 'q' });
    insertAttempts(db, q.id, '2026-07-07', 20, 4);
    expect(getDashboard(db, TODAY).readiness).toEqual({
      ready: true,
      detail: 'Ready: all domains >= 85% retention',
    });
  });

  it('reports how many domains sit below 85% retention', () => {
    const a = createObjective(db, { title: 'A', domain: 'Alpha' });
    const b = createObjective(db, { title: 'B', domain: 'Beta' });
    const qa = createQuestion(db, { objective_id: a.id, question_text: 'qa' });
    const qb = createQuestion(db, { objective_id: b.id, question_text: 'qb' });
    insertAttempts(db, qa.id, '2026-07-07', 20, 4); // 100%
    insertAttempts(db, qb.id, '2026-07-06', 16, 4); // 16 of 20 -> 80%
    insertAttempts(db, qb.id, '2026-07-07', 4, 2);
    expect(getDashboard(db, TODAY).readiness).toEqual({
      ready: false,
      detail: '1 of 2 domains below 85% retention',
    });
  });
});

function insertDomain(db: Db, name: string, weight: number): void {
  db.prepare(
    "INSERT INTO domains (cert_path, name, weight) VALUES ('NCA-GENL', ?, ?)",
  ).run(name, weight);
}

describe('weak-area ranking v2 (F17) + domain weights (F16)', () => {
  const TODAY = '2026-07-08';
  let db: Db;

  beforeEach(() => {
    db = memoryDb();
  });

  // One objective + one question, attempted through the real scheduler so the
  // due-queue state is realistic (lapses stay due, successes schedule ahead).
  function objectiveWithAttempts(
    title: string,
    confidence: number,
    ratings: number[],
    attemptDate: Date,
  ): number {
    const o = createObjective(db, { title, confidence, status: 'reviewing' });
    const q = createQuestion(db, { objective_id: o.id, question_text: `${title} q` });
    for (const rating of ratings) {
      recordAttempt(db, { question_id: q.id, rating }, attemptDate);
    }
    return o.id;
  }

  it('fills DashboardDomainStat.weight from the domains table (null when unknown)', () => {
    insertDomain(db, 'Weighted', 30);
    createObjective(db, { title: 'A', domain: 'Weighted' });
    createObjective(db, { title: 'B', domain: 'Mystery' });
    createQuestion(db, { question_text: 'unlinked' });

    const domains = getDashboard(db, TODAY).domains;
    expect(domains.find((d) => d.domain === 'Weighted')!.weight).toBe(30);
    expect(domains.find((d) => d.domain === 'Mystery')!.weight).toBeNull();
  });

  it('demonstrated recall failure outranks low self-confidence (accuracy term)', () => {
    // "I know this" (confidence 5) but the last attempts average 1.5...
    objectiveWithAttempts('Overconfident', 5, [1, 2, 1, 2], new Date(2026, 6, 6));
    // ...versus shaky self-confidence (2) with excellent actual recall (4.5).
    objectiveWithAttempts('Humble', 2, [4, 5, 4, 5], new Date(2026, 6, 6));

    const weak = getDashboard(db, TODAY).weakObjectives;
    expect(weak.map((w) => w.title)).toEqual(['Overconfident', 'Humble']);
    expect(weak[0].meanRecentRating).toBeCloseTo(1.5);
    expect(weak[0].reasons).toContain('recent recall 1.5/5');
    expect(weak[1].meanRecentRating).toBeCloseTo(4.5);
    expect(weak[1].reasons.join()).not.toMatch(/recent recall/);
  });

  it('the exam-weight multiplier flips ordering between 30% and 10% domains', () => {
    insertDomain(db, 'Big', 30);
    insertDomain(db, 'Small', 10);
    // Unweighted, Small (confidence 2 -> 7.5) outranks Big (confidence 3 -> 6.5)...
    createObjective(db, { title: 'Big objective', domain: 'Big', confidence: 3 });
    createObjective(db, { title: 'Small objective', domain: 'Small', confidence: 2 });

    const weak = getDashboard(db, TODAY).weakObjectives;
    // ...but the multiplier (x1.5 vs ~x0.83) swaps them: 6.5 * 1.5 = 9.8 > 7.5 * 0.83.
    expect(weak.map((w) => w.title)).toEqual(['Big objective', 'Small objective']);
    expect(weak[0].weaknessScore).toBe(9.8);
    expect(weak[0].examWeight).toBe(30);
    expect(weak[1].examWeight).toBe(10);
  });

  it('a stale objective (21 days) outranks a fresh one, all else equal', () => {
    objectiveWithAttempts('Stale', 4, [3, 3, 3], new Date(2026, 5, 17)); // 2026-06-17
    objectiveWithAttempts('Fresh', 4, [3, 3, 3], new Date(2026, 6, 7)); // 2026-07-07

    const weak = getDashboard(db, TODAY).weakObjectives;
    expect(weak.map((w) => w.title)).toEqual(['Stale', 'Fresh']);
    expect(weak[0].daysSinceLastAttempt).toBe(21);
    expect(weak[0].reasons).toContain('not reviewed in 21 days');
    expect(weak[1].daysSinceLastAttempt).toBe(1);
    expect(weak[1].reasons.join()).not.toMatch(/not reviewed/);
  });

  it('meanRecentRating covers only the last 10 attempts; unattempted stays null', () => {
    const o = createObjective(db, { title: 'Windowed', confidence: 3 });
    const q = createQuestion(db, { objective_id: o.id, question_text: 'w q' });
    insertAttempts(db, q.id, '2026-07-06', 2, 5); // older, pushed out of the window
    insertAttempts(db, q.id, '2026-07-07', 10, 1); // the last 10, all "forgot"
    createObjective(db, { title: 'Untouched', confidence: 3 });

    const weak = getDashboard(db, TODAY).weakObjectives;
    expect(weak.find((w) => w.title === 'Windowed')!.meanRecentRating).toBe(1);
    const untouched = weak.find((w) => w.title === 'Untouched')!;
    expect(untouched.meanRecentRating).toBeNull();
    expect(untouched.daysSinceLastAttempt).toBeNull();
    expect(untouched.examWeight).toBeNull();
  });

  it('the due bump scales with the backlog and caps at 2', () => {
    const o = createObjective(db, { title: 'Backlog', confidence: 5, status: 'reviewing' });
    for (let i = 0; i < 12; i++) {
      createQuestion(db, { objective_id: o.id, question_text: `b q${i}` }); // never attempted -> due
    }
    const w = getDashboard(db, TODAY).weakObjectives.find((x) => x.title === 'Backlog')!;
    // conf 5 -> 0, reviewing -> 0, no runs -> 1, no evidence -> 0.5, due min(2, 12 * 0.25) -> 2
    expect(w.weaknessScore).toBe(3.5);
    expect(w.reasons).toContain('12 questions due');
  });
});

describe('calibration summary (F19)', () => {
  const TODAY = '2026-07-08';
  let db: Db;

  beforeEach(() => {
    db = memoryDb();
  });

  it('returns zeros and empty lists on an empty history', () => {
    const c = getDashboard(db, TODAY).calibration;
    expect(c.windowDays).toBe(30);
    expect(c.quadrant).toEqual({
      confidentCorrect: 0,
      confidentWrong: 0,
      unsureCorrect: 0,
      unsureWrong: 0,
    });
    expect(c.dangerZone).toEqual([]);
    expect(c.overconfidentObjectives).toEqual([]);
  });

  it('buckets in-window confidence-captured attempts into the four quadrants', () => {
    const q = createQuestion(db, { question_text: 'quad' });
    const day = new Date(2026, 6, 7);
    recordAttempt(db, { question_id: q.id, rating: 4, confidence: 3 }, day); // confident + correct
    recordAttempt(db, { question_id: q.id, rating: 2, confidence: 3 }, day); // confident + wrong
    recordAttempt(db, { question_id: q.id, rating: 5, confidence: 1 }, day); // unsure + correct
    recordAttempt(db, { question_id: q.id, rating: 3, confidence: 2 }, day); // unsure + correct
    recordAttempt(db, { question_id: q.id, rating: 1, confidence: 2 }, day); // unsure + wrong
    recordAttempt(db, { question_id: q.id, rating: 1 }, day); // no confidence -> excluded
    recordAttempt(db, { question_id: q.id, rating: 1, confidence: 3 }, new Date(2026, 5, 1)); // outside 30d

    expect(getDashboard(db, TODAY).calibration.quadrant).toEqual({
      confidentCorrect: 1,
      confidentWrong: 1,
      unsureCorrect: 2,
      unsureWrong: 1,
    });
  });

  it('danger zone lists distinct in-window confident-wrong questions, newest first', () => {
    const obj = createObjective(db, { title: 'Objo' });
    const q1 = createQuestion(db, { objective_id: obj.id, question_text: 'first wrong' });
    const q2 = createQuestion(db, { question_text: 'later wrong' });
    const q3 = createQuestion(db, { question_text: 'confident right' });
    const q4 = createQuestion(db, { question_text: 'stale wrong' });

    recordAttempt(db, { question_id: q4.id, rating: 1, confidence: 3 }, new Date(2026, 5, 1)); // outside 30d
    recordAttempt(db, { question_id: q1.id, rating: 2, confidence: 3 }, new Date(2026, 6, 3));
    recordAttempt(db, { question_id: q1.id, rating: 1, confidence: 3 }, new Date(2026, 6, 5)); // dedupe
    recordAttempt(db, { question_id: q2.id, rating: 1, confidence: 3 }, new Date(2026, 6, 7));
    recordAttempt(db, { question_id: q3.id, rating: 5, confidence: 3 }, new Date(2026, 6, 7));

    const zone = getDashboard(db, TODAY).calibration.dangerZone;
    expect(zone).toEqual([
      {
        question_id: q2.id,
        question_text: 'later wrong',
        objective_title: null,
        last_wrong_date: '2026-07-07',
      },
      {
        question_id: q1.id,
        question_text: 'first wrong',
        objective_title: 'Objo',
        last_wrong_date: '2026-07-05', // latest of its two wrong attempts
      },
    ]);
  });

  it('flags overconfident objectives (confidence >= 4, mean recent <= 2.5, >= 3 attempts)', () => {
    const flagged = createObjective(db, { title: 'Flagged', confidence: 4 });
    const fq = createQuestion(db, { objective_id: flagged.id, question_text: 'fq' });
    const solid = createObjective(db, { title: 'Solid', confidence: 5 });
    const sq = createQuestion(db, { objective_id: solid.id, question_text: 'sq' });
    const thin = createObjective(db, { title: 'Thin history', confidence: 4 });
    const tq = createQuestion(db, { objective_id: thin.id, question_text: 'tq' });

    const day = new Date(2026, 6, 7);
    for (const rating of [2, 2, 2]) recordAttempt(db, { question_id: fq.id, rating }, day);
    for (const rating of [5, 5, 5]) recordAttempt(db, { question_id: sq.id, rating }, day);
    for (const rating of [1, 1]) recordAttempt(db, { question_id: tq.id, rating }, day); // < 3 attempts

    expect(getDashboard(db, TODAY).calibration.overconfidentObjectives).toEqual([
      { id: flagged.id, title: 'Flagged', confidence: 4, meanRecentRating: 2 },
    ]);
  });
});
