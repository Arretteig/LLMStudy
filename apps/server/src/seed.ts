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

interface SeedQuestion {
  objective_title?: string;
  question_text: string;
  expected_answer?: string;
  difficulty?: number;
}

export interface SeedResult {
  objectives: number;
  questions: number;
}

/**
 * Load starter content from db/seed/nca-genl.json.
 * Idempotent: objectives use INSERT OR IGNORE on UNIQUE(cert_path, title);
 * questions use INSERT OR IGNORE on UNIQUE(objective_id, question_text). So
 * re-running never creates duplicates and picks up newly added seed rows.
 * Returns the total counts in each table.
 */
export function seed(db: Db = getDb()): SeedResult {
  const seedPath = join(REPO_ROOT, 'db', 'seed', 'nca-genl.json');
  const parsed = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    objectives?: SeedObjective[];
    questions?: SeedQuestion[];
  };

  seedObjectives(db, parsed.objectives ?? []);
  seedQuestions(db, parsed.questions ?? []);

  return {
    objectives: count(db, 'objectives'),
    questions: count(db, 'recall_questions'),
  };
}

function seedObjectives(db: Db, objectives: SeedObjective[]): void {
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
}

function seedQuestions(db: Db, questions: SeedQuestion[]): void {
  // Resolve objective titles -> ids so seed questions link to the right objective.
  const idByTitle = new Map<string, number>();
  for (const row of db
    .prepare('SELECT id, title FROM objectives')
    .all() as { id: number; title: string }[]) {
    idByTitle.set(row.title, row.id);
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO recall_questions
       (objective_id, question_text, expected_answer, difficulty)
     VALUES
       (@objective_id, @question_text, @expected_answer, @difficulty)`,
  );
  const insertAll = db.transaction((rows: SeedQuestion[]) => {
    for (const q of rows) {
      const objectiveId = q.objective_title
        ? idByTitle.get(q.objective_title) ?? null
        : null;
      if (q.objective_title && objectiveId === null) {
        console.warn(
          `[seed] question references unknown objective "${q.objective_title}" — inserting unlinked`,
        );
      }
      insert.run({
        objective_id: objectiveId,
        question_text: q.question_text,
        expected_answer: q.expected_answer ?? null,
        difficulty: q.difficulty ?? null,
      });
    }
  });
  insertAll(questions);
}

function count(db: Db, table: 'objectives' | 'recall_questions'): number {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number;
  };
  return n;
}
