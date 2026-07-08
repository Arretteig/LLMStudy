import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, REPO_ROOT, type Db } from './db';

interface SeedObjective {
  title: string;
  description?: string;
  domain?: string;
  cert_path?: string;
  status?: string;
  confidence?: number;
  notes?: string;
}

/**
 * Load starter objectives from db/seed/nca-genl.json.
 * Idempotent: INSERT OR IGNORE keyed on the UNIQUE(cert_path, title) constraint,
 * so re-running never creates duplicates. Returns the total objective count.
 */
export function seed(db: Db = getDb()): number {
  const seedPath = join(REPO_ROOT, 'db', 'seed', 'nca-genl.json');
  const parsed = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    objectives?: SeedObjective[];
  };
  const objectives = parsed.objectives ?? [];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO objectives
       (title, description, domain, cert_path, status, confidence, notes)
     VALUES
       (@title, @description, @domain, @cert_path, @status, @confidence, @notes)`,
  );

  const insertAll = db.transaction((rows: SeedObjective[]) => {
    for (const o of rows) {
      insert.run({
        title: o.title,
        description: o.description ?? null,
        domain: o.domain ?? null,
        cert_path: o.cert_path ?? 'NCA-GENL',
        status: o.status ?? 'not_started',
        confidence: o.confidence ?? null,
        notes: o.notes ?? null,
      });
    }
  });
  insertAll(objectives);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM objectives').get() as {
    n: number;
  };
  return n;
}
