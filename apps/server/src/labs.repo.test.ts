import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, type Db } from './db';
import { createObjective } from './objectives.repo';
import { createLab, deleteLab, getLab, listLabs, updateLab } from './labs.repo';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

describe('labs repository', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('creates a lab with an objective and tags', () => {
    const obj = createObjective(db, { title: 'LoRA', domain: 'Experimentation' });
    const lab = createLab(db, {
      title: 'LoRA VRAM test',
      objective_id: obj.id,
      hypothesis: 'LoRA uses less VRAM',
      tags: ['vram', 'lora'],
    });
    expect(lab.objective_title).toBe('LoRA');
    expect(lab.tags).toEqual(['lora', 'vram']); // sorted by name
    expect(lab.hypothesis).toBe('LoRA uses less VRAM');
  });

  it('dedupes tags case-insensitively, keeping first-seen casing', () => {
    const lab = createLab(db, { title: 't', tags: ['LoRA', 'lora', ' LORA '] });
    expect(lab.tags).toEqual(['LoRA']);
    // second lab reuses the same tag row (no duplicate created)
    createLab(db, { title: 't2', tags: ['lora'] });
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM tags').get() as { n: number };
    expect(n).toBe(1);
  });

  it('replaces tags on update', () => {
    const lab = createLab(db, { title: 't', tags: ['a', 'b'] });
    const updated = updateLab(db, lab.id, { tags: ['b', 'c'] })!;
    expect(updated.tags).toEqual(['b', 'c']);
  });

  it('updates a body field without touching tags when tags omitted', () => {
    const lab = createLab(db, { title: 't', tags: ['keep'] });
    const updated = updateLab(db, lab.id, { observed_result: 'it worked' })!;
    expect(updated.observed_result).toBe('it worked');
    expect(updated.tags).toEqual(['keep']);
  });

  it('requires a title', () => {
    expect(() => createLab(db, { hypothesis: 'x' })).toThrow(/title/);
  });

  it('sets objective_id to NULL when the objective is deleted', () => {
    const obj = createObjective(db, { title: 'Temp' });
    const lab = createLab(db, { title: 'l', objective_id: obj.id });
    db.prepare('DELETE FROM objectives WHERE id = ?').run(obj.id);
    expect(getLab(db, lab.id)?.objective_id).toBeNull();
  });

  it('cascades lab_tags when a lab is deleted', () => {
    const lab = createLab(db, { title: 'l', tags: ['x', 'y'] });
    expect(deleteLab(db, lab.id)).toBe(true);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM lab_tags').get() as { n: number };
    expect(n).toBe(0);
    // the tag dictionary itself survives
    const tagCount = db.prepare('SELECT COUNT(*) AS n FROM tags').get() as { n: number };
    expect(tagCount.n).toBe(2);
  });

  it('lists labs most-recently-updated first', () => {
    const a = createLab(db, { title: 'A' });
    const b = createLab(db, { title: 'B' });
    // Set explicit timestamps so ordering is deterministic (datetime('now') has
    // only second granularity and both rows could otherwise tie).
    db.prepare('UPDATE labs SET updated_at = ? WHERE id = ?').run('2026-01-02 00:00:00', a.id);
    db.prepare('UPDATE labs SET updated_at = ? WHERE id = ?').run('2026-01-01 00:00:00', b.id);
    expect(listLabs(db).map((l) => l.title)).toEqual(['A', 'B']);
  });
});
