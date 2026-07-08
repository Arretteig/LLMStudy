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
-- Later milestones will add: labs + tags + lab_tags (M4).
-- Kept out of the current slice on purpose.
-- =========================================================================
