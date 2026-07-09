import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type Db } from './db';
import { createObjective } from './objectives.repo';
import { createTemplate } from './lab-templates.repo';
import {
  createRun,
  deleteRun,
  getRun,
  listRuns,
  updateRun,
} from './lab-runs.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

describe('lab runs repository', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('creates a run from a template with joined titles', () => {
    const obj = createObjective(db, { title: 'Prompting' });
    const tpl = createTemplate(db, { title: 'Zero vs few-shot', objective_id: obj.id });
    const run = createRun(db, {
      template_id: tpl.id,
      objective_id: obj.id,
      status: 'in_progress',
      hypothesis: 'examples will help',
    });
    expect(run.status).toBe('in_progress');
    expect(run.template_title).toBe('Zero vs few-shot');
    expect(run.objective_title).toBe('Prompting');
  });

  it('creates an empty run with default status', () => {
    const run = createRun(db, {});
    expect(run.status).toBe('not_started');
    expect(run.template_id).toBeNull();
  });

  it('rejects an invalid status via CHECK', () => {
    expect(() => createRun(db, { status: 'bogus' })).toThrow();
  });

  it('rejects out-of-range confidence via CHECK', () => {
    expect(() => createRun(db, { confidence_after: 9 })).toThrow();
  });

  it('updates fields including status and confidence', () => {
    const run = createRun(db, {});
    const updated = updateRun(db, run.id, {
      status: 'completed',
      confidence_after: 4,
      completed_at: '2026-07-08',
    })!;
    expect(updated.status).toBe('completed');
    expect(updated.confidence_after).toBe(4);
    expect(updated.completed_at).toBe('2026-07-08');
  });

  it('filters runs by template, objective, and status', () => {
    const tpl = createTemplate(db, { title: 't' });
    createRun(db, { template_id: tpl.id, status: 'completed' });
    createRun(db, { template_id: tpl.id, status: 'in_progress' });
    createRun(db, { status: 'completed' });
    expect(listRuns(db, { templateId: tpl.id })).toHaveLength(2);
    expect(listRuns(db, { status: 'completed' })).toHaveLength(2);
    expect(listRuns(db, { templateId: tpl.id, status: 'completed' })).toHaveLength(1);
  });

  it('keeps run history when its template is deleted (SET NULL)', () => {
    const tpl = createTemplate(db, { title: 't' });
    const run = createRun(db, { template_id: tpl.id });
    db.prepare('DELETE FROM lab_templates WHERE id = ?').run(tpl.id);
    const after = getRun(db, run.id)!;
    expect(after).toBeTruthy();
    expect(after.template_id).toBeNull();
    expect(after.template_title).toBeNull();
  });

  it('deletes a run', () => {
    const run = createRun(db, {});
    expect(deleteRun(db, run.id)).toBe(true);
    expect(getRun(db, run.id)).toBeUndefined();
  });
});
