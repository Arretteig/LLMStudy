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
-- Later milestones (M2+) will add: recall_questions, answer_attempts,
-- labs, tags, lab_tags. Kept out of the MVP slice on purpose.
-- =========================================================================
