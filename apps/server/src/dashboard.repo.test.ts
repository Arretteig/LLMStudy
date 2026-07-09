import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type Db } from './db';
import { createObjective, updateObjective } from './objectives.repo';
import { createQuestion } from './questions.repo';
import { recordAttempt } from './reviews.repo';
import { createTemplate } from './lab-templates.repo';
import { createRun } from './lab-runs.repo';
import { getDashboard } from './dashboard.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
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
});
