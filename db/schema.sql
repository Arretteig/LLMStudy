-- LLMStudy schema.
-- Applied idempotently on every boot (CREATE TABLE IF NOT EXISTS), so it is
-- safe to run repeatedly. No migration framework for the MVP — a single file
-- plus `npm run db:reset` when you want a clean slate.
--
-- Conventions:
--   * dates/timestamps are ISO-8601 TEXT (sort lexically, export cleanly to CSV)
--   * enums are CHECK constraints on plain columns (no lookup tables)
--   * all 1-5 scores use CHECK (x BETWEEN 1 AND 5)

PRAGMA foreign_keys = ON;

-- =========================================================================
-- M1: Certification blueprint tracker
-- =========================================================================
CREATE TABLE IF NOT EXISTS objectives (
  id                        INTEGER PRIMARY KEY,
  title                     TEXT NOT NULL,
  description               TEXT,
  cert_path                 TEXT NOT NULL DEFAULT 'NCA-GENL',
  domain                    TEXT,
  confidence                INTEGER CHECK (confidence BETWEEN 1 AND 5),
  status                    TEXT NOT NULL DEFAULT 'not_started'
                              CHECK (status IN ('not_started','learning','reviewing','confident')),
  last_reviewed_date        TEXT,   -- ISO 'YYYY-MM-DD'
  next_review_date          TEXT,   -- ISO 'YYYY-MM-DD' (manual blueprint-level cadence)
  notes                     TEXT,
  evidence_of_understanding TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cert_path, title)         -- lets seeding stay idempotent (INSERT OR IGNORE)
);

CREATE INDEX IF NOT EXISTS idx_objectives_next_review ON objectives(next_review_date);
CREATE INDEX IF NOT EXISTS idx_objectives_domain      ON objectives(domain);

-- =========================================================================
-- M2: Active-recall question bank
-- =========================================================================
-- One row per question, optionally tied to an objective. The last_attempted_date
-- / next_review_date / self_score columns are a denormalized "current SRS state"
-- cache. They are present now (so M3 needs no schema reset) but stay NULL until
-- M3 wires up answer_attempts and the spaced-review scheduler.
CREATE TABLE IF NOT EXISTS recall_questions (
  id                  INTEGER PRIMARY KEY,
  objective_id        INTEGER REFERENCES objectives(id) ON DELETE SET NULL,
  question_text       TEXT NOT NULL,
  expected_answer     TEXT,                                   -- model answer / rubric
  difficulty          INTEGER CHECK (difficulty BETWEEN 1 AND 5),
  last_attempted_date TEXT,                                   -- cache (M3)
  next_review_date    TEXT,                                   -- cache (M3), indexed for the due queue
  self_score          INTEGER CHECK (self_score BETWEEN 1 AND 5), -- cache (M3)
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (objective_id, question_text)   -- keeps seeding idempotent (INSERT OR IGNORE)
);

CREATE INDEX IF NOT EXISTS idx_questions_objective    ON recall_questions(objective_id);
CREATE INDEX IF NOT EXISTS idx_questions_next_review  ON recall_questions(next_review_date);

-- =========================================================================
-- M3: Spaced review — immutable answer history
-- =========================================================================
-- One row per attempt at a question. This is the source of truth for progress
-- over time (kept as a real table, never a JSON blob on the question, so
-- accuracy/streaks are queryable). The parent question's cache columns
-- (last_attempted_date, next_review_date, self_score) are updated to mirror the
-- latest attempt so the due-queue is a single indexed scan.
--
--   rating -> next review interval:  1:+1d  2:+2d  3:+4d  4:+7d  5:+14d
--
CREATE TABLE IF NOT EXISTS answer_attempts (
  id               INTEGER PRIMARY KEY,
  question_id      INTEGER NOT NULL REFERENCES recall_questions(id) ON DELETE CASCADE,
  user_answer      TEXT,
  self_score       INTEGER CHECK (self_score BETWEEN 1 AND 5),  -- how good the answer was
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), -- SRS ease signal (drives interval)
  attempted_date   TEXT NOT NULL DEFAULT (datetime('now')),
  next_review_date TEXT,   -- computed = attempted day + interval(rating)
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attempts_question ON answer_attempts(question_id, attempted_date);

-- =========================================================================
-- M4: Lab system — templates (guided exercises) + runs (my attempts)
-- =========================================================================
-- NOTE: this replaces the earlier freeform `labs` table. Existing databases
-- keep that now-unused table until `npm run db:reset`; nothing references it.

-- A reusable guided exercise connected to an objective.
CREATE TABLE IF NOT EXISTS lab_templates (
  id                   INTEGER PRIMARY KEY,
  title                TEXT NOT NULL,
  objective_id         INTEGER REFERENCES objectives(id) ON DELETE SET NULL,
  domain               TEXT,
  goal                 TEXT,
  background           TEXT,
  instructions         TEXT,   -- step-by-step, stored as freeform text
  success_criteria     TEXT,
  reflection_questions TEXT,
  suggested_commands   TEXT,   -- optional
  difficulty           INTEGER CHECK (difficulty BETWEEN 1 AND 5),
  estimated_minutes    INTEGER,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (title)               -- keeps template seeding idempotent
);

CREATE INDEX IF NOT EXISTS idx_templates_objective ON lab_templates(objective_id);

-- Canonical tag dictionary. COLLATE NOCASE dedupes case-insensitively while
-- preserving first-seen display casing (so "LoRA" and "lora" are one tag).
CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Many-to-many lab_templates <-> tags. Composite PK doubles as the index.
CREATE TABLE IF NOT EXISTS template_tags (
  template_id INTEGER NOT NULL REFERENCES lab_templates(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, tag_id)
);

-- My actual attempt at a lab. Template/objective are SET NULL on delete so run
-- history survives even if the source template or objective is removed.
CREATE TABLE IF NOT EXISTS lab_runs (
  id               INTEGER PRIMARY KEY,
  template_id      INTEGER REFERENCES lab_templates(id) ON DELETE SET NULL,
  objective_id     INTEGER REFERENCES objectives(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started','in_progress','completed','needs_repeat')),
  hypothesis       TEXT,
  what_changed     TEXT,
  commands_config  TEXT,
  observed_result  TEXT,
  why_it_happened  TEXT,
  mistakes         TEXT,   -- mistakes / confusions
  what_next        TEXT,
  confidence_after INTEGER CHECK (confidence_after BETWEEN 1 AND 5),
  started_at       TEXT,
  completed_at     TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_template  ON lab_runs(template_id);
CREATE INDEX IF NOT EXISTS idx_runs_objective ON lab_runs(objective_id);

-- =========================================================================
-- Extensibility hooks designed but NOT built (see README roadmap):
-- documents/chunks/citations (RAG), attempt_gradings (LLM grading),
-- exam_sessions/exam_items (mock exams), benchmark_runs (vLLM logger).
-- =========================================================================
