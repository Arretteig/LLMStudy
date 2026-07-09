import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type Db } from './db';
import { ValidationError } from './errors';
import { createObjective } from './objectives.repo';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from './lab-templates.repo';
import { createRun } from './lab-runs.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

describe('lab templates repository', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('creates a template with objective, tags, and zero runs', () => {
    const obj = createObjective(db, { title: 'Prompting', domain: 'Core ML' });
    const tpl = createTemplate(db, {
      title: 'Zero vs few-shot',
      objective_id: obj.id,
      goal: 'understand examples',
      difficulty: 2,
      estimated_minutes: 30,
      tags: ['prompting', 'few-shot'],
    });
    expect(tpl.objective_title).toBe('Prompting');
    expect(tpl.tags).toEqual(['few-shot', 'prompting']);
    expect(tpl.run_count).toBe(0);
  });

  it('requires a title and enforces unique titles', () => {
    expect(() => createTemplate(db, { goal: 'x' })).toThrow(/title/);
    createTemplate(db, { title: 'Dup' });
    expect(() => createTemplate(db, { title: 'Dup' })).toThrow();
  });

  it('replaces tags on update', () => {
    const tpl = createTemplate(db, { title: 't', tags: ['a', 'b'] });
    const updated = updateTemplate(db, tpl.id, { tags: ['b', 'c'] })!;
    expect(updated.tags).toEqual(['b', 'c']);
  });

  it('rejects a blank title on update', () => {
    const tpl = createTemplate(db, { title: 'Keep me' });
    expect(() => updateTemplate(db, tpl.id, { title: '' })).toThrow(ValidationError);
    expect(getTemplate(db, tpl.id)!.title).toBe('Keep me');
  });

  it('counts runs started from the template', () => {
    const tpl = createTemplate(db, { title: 't' });
    createRun(db, { template_id: tpl.id });
    createRun(db, { template_id: tpl.id });
    expect(getTemplate(db, tpl.id)!.run_count).toBe(2);
  });

  it('sets objective_id to NULL when its objective is deleted', () => {
    const obj = createObjective(db, { title: 'Temp' });
    const tpl = createTemplate(db, { title: 't', objective_id: obj.id });
    db.prepare('DELETE FROM objectives WHERE id = ?').run(obj.id);
    expect(getTemplate(db, tpl.id)!.objective_id).toBeNull();
  });

  it('cascades template_tags on delete but keeps the tag dictionary', () => {
    const tpl = createTemplate(db, { title: 't', tags: ['x', 'y'] });
    expect(deleteTemplate(db, tpl.id)).toBe(true);
    const links = db.prepare('SELECT COUNT(*) AS n FROM template_tags').get() as { n: number };
    expect(links.n).toBe(0);
    const tags = db.prepare('SELECT COUNT(*) AS n FROM tags').get() as { n: number };
    expect(tags.n).toBe(2);
  });

  it('filters templates by objective', () => {
    const a = createObjective(db, { title: 'A' });
    const b = createObjective(db, { title: 'B' });
    createTemplate(db, { title: 'ta', objective_id: a.id });
    createTemplate(db, { title: 'tb', objective_id: b.id });
    expect(listTemplates(db, a.id)).toHaveLength(1);
    expect(listTemplates(db, a.id)[0].title).toBe('ta');
  });
});
