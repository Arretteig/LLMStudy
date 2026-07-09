import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, runMigrations, type Db } from './db';
import { listDomains, weightByDomain } from './domains.repo';
import { seed } from './seed';

function memoryDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  runMigrations(db);
  return db;
}

describe('domains (F16)', () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it('seed populates the 5 official NCA-GENL domains, heaviest first', () => {
    seed(db);
    expect(listDomains(db)).toEqual([
      { cert_path: 'NCA-GENL', name: 'Core Machine Learning and AI Knowledge', weight: 30 },
      { cert_path: 'NCA-GENL', name: 'Software Development', weight: 24 },
      { cert_path: 'NCA-GENL', name: 'Experimentation', weight: 22 },
      { cert_path: 'NCA-GENL', name: 'Data Analysis and Visualization', weight: 14 },
      { cert_path: 'NCA-GENL', name: 'Trustworthy AI', weight: 10 },
    ]);
  });

  it('re-seeding is idempotent (INSERT OR IGNORE on the composite PK)', () => {
    seed(db);
    seed(db);
    expect(listDomains(db)).toHaveLength(5);
  });

  it('weights parse to integer percents that sum to 100', () => {
    seed(db);
    const weights = weightByDomain(db);
    expect(weights.get('Trustworthy AI')).toBe(10);
    expect([...weights.values()].reduce((sum, w) => sum + w, 0)).toBe(100);
  });
});
