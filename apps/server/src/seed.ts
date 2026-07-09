import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, REPO_ROOT, type Db } from './db';
import { createTemplate } from './lab-templates.repo';

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

interface SeedMcqChoice {
  choice_text: string;
  is_correct: boolean;
  rationale: string;
}

interface SeedMcqQuestion {
  objective_title?: string;
  question_text: string;
  difficulty?: number;
  choices: SeedMcqChoice[];
}

interface SeedLabTemplate {
  title: string;
  objective_title?: string;
  domain?: string;
  goal?: string;
  background?: string;
  instructions?: string;
  success_criteria?: string;
  reflection_questions?: string;
  suggested_commands?: string;
  difficulty?: number;
  estimated_minutes?: number;
  tags?: string[];
}

export interface SeedResult {
  objectives: number;
  questions: number;
  labTemplates: number;
}

const DEFAULT_SEED_PATH = join(REPO_ROOT, 'db', 'seed', 'nca-genl.json');

/**
 * Load starter content from db/seed/nca-genl.json (or a caller-supplied file —
 * tests point this at a fixture). Idempotent: objectives use INSERT OR IGNORE
 * on UNIQUE(cert_path, title); questions (recall AND mcq) use INSERT OR IGNORE
 * on UNIQUE(objective_id, question_text); domains use INSERT OR IGNORE on
 * PRIMARY KEY (cert_path, name). So re-running never creates duplicates and
 * picks up newly added seed rows. Returns the total counts in each table.
 */
export function seed(db: Db = getDb(), seedPath: string = DEFAULT_SEED_PATH): SeedResult {
  const parsed = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    _domain_weights?: Record<string, string>;
    objectives?: SeedObjective[];
    questions?: SeedQuestion[];
    mcqQuestions?: SeedMcqQuestion[];
    labTemplates?: SeedLabTemplate[];
  };

  seedDomains(db, parsed._domain_weights ?? {});
  seedObjectives(db, parsed.objectives ?? []);
  seedQuestions(db, parsed.questions ?? []);
  seedMcqQuestions(db, parsed.mcqQuestions ?? []); // key may be absent — older seed files
  seedLabTemplates(db, parsed.labTemplates ?? []);

  return {
    objectives: count(db, 'objectives'),
    questions: count(db, 'recall_questions'),
    labTemplates: count(db, 'lab_templates'),
  };
}

/**
 * Self-heal for databases created before the domains table existed (M3):
 * migrations create the empty table, but boot only full-seeds brand-new
 * databases, so weights would stay missing until a manual `npm run seed`.
 * Cheap and idempotent, so it runs on every boot.
 */
export function seedDomainsIfEmpty(db: Db = getDb()): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM domains').get() as { n: number };
  if (n > 0) return;
  const parsed = JSON.parse(readFileSync(DEFAULT_SEED_PATH, 'utf8')) as {
    _domain_weights?: Record<string, string>;
  };
  seedDomains(db, parsed._domain_weights ?? {});
}

// Official exam domains + weights (F16). The seed JSON stores weights as
// percent strings ({"Core Machine Learning and AI Knowledge": "30%", ...});
// parseInt strips the trailing '%'.
function seedDomains(db: Db, weights: Record<string, string>): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO domains (cert_path, name, weight)
     VALUES ('NCA-GENL', @name, @weight)`,
  );
  const insertAll = db.transaction((entries: [string, string][]) => {
    for (const [name, raw] of entries) {
      const weight = Number.parseInt(raw, 10);
      if (!Number.isInteger(weight)) {
        console.warn(`[seed] domain "${name}" has unparseable weight "${raw}" — skipped`);
        continue;
      }
      insert.run({ name, weight });
    }
  });
  insertAll(Object.entries(weights));
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

// Seed MCQ items (F21). The question row uses INSERT OR IGNORE like recall
// questions; choices are inserted ONLY when the question row was newly created
// (info.changes > 0), so a re-seed never duplicates choice rows or clobbers
// edits made to an existing MCQ in the authoring UI.
function seedMcqQuestions(db: Db, questions: SeedMcqQuestion[]): void {
  const idByTitle = new Map<string, number>();
  for (const row of db
    .prepare('SELECT id, title FROM objectives')
    .all() as { id: number; title: string }[]) {
    idByTitle.set(row.title, row.id);
  }

  const insertQuestion = db.prepare(
    `INSERT OR IGNORE INTO recall_questions
       (objective_id, question_text, difficulty, question_format)
     VALUES
       (@objective_id, @question_text, @difficulty, 'mcq')`,
  );
  const insertChoice = db.prepare(
    `INSERT INTO question_choices (question_id, position, choice_text, is_correct, rationale)
     VALUES (@question_id, @position, @choice_text, @is_correct, @rationale)`,
  );

  const insertAll = db.transaction((rows: SeedMcqQuestion[]) => {
    for (const q of rows) {
      const objectiveId = q.objective_title
        ? idByTitle.get(q.objective_title) ?? null
        : null;
      if (q.objective_title && objectiveId === null) {
        console.warn(
          `[seed] MCQ references unknown objective "${q.objective_title}" — inserting unlinked`,
        );
      }
      const info = insertQuestion.run({
        objective_id: objectiveId,
        question_text: q.question_text,
        difficulty: q.difficulty ?? null,
      });
      if (info.changes === 0) continue; // already seeded — keep existing choices
      const questionId = Number(info.lastInsertRowid);
      (q.choices ?? []).forEach((choice, i) => {
        insertChoice.run({
          question_id: questionId,
          position: i + 1,
          choice_text: choice.choice_text,
          is_correct: choice.is_correct ? 1 : 0,
          rationale: choice.rationale,
        });
      });
    }
  });
  insertAll(questions);
}

function seedLabTemplates(db: Db, templates: SeedLabTemplate[]): void {
  // Templates use INSERT via createTemplate; UNIQUE(title) makes a re-seed a
  // no-op for existing titles. We skip titles that already exist to stay idempotent.
  const existing = new Set(
    (db.prepare('SELECT title FROM lab_templates').all() as { title: string }[]).map(
      (r) => r.title,
    ),
  );

  const idByTitle = new Map<string, number>();
  for (const row of db
    .prepare('SELECT id, title FROM objectives')
    .all() as { id: number; title: string }[]) {
    idByTitle.set(row.title, row.id);
  }

  const seedAll = db.transaction((rows: SeedLabTemplate[]) => {
    for (const tpl of rows) {
      if (existing.has(tpl.title)) continue;
      createTemplate(db, {
        title: tpl.title,
        objective_id: tpl.objective_title
          ? idByTitle.get(tpl.objective_title) ?? null
          : null,
        domain: tpl.domain ?? null,
        goal: tpl.goal ?? null,
        background: tpl.background ?? null,
        instructions: tpl.instructions ?? null,
        success_criteria: tpl.success_criteria ?? null,
        reflection_questions: tpl.reflection_questions ?? null,
        suggested_commands: tpl.suggested_commands ?? null,
        difficulty: tpl.difficulty ?? null,
        estimated_minutes: tpl.estimated_minutes ?? null,
        tags: tpl.tags ?? [],
      });
    }
  });
  seedAll(templates);
}

function count(
  db: Db,
  table: 'objectives' | 'recall_questions' | 'lab_templates',
): number {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number;
  };
  return n;
}
