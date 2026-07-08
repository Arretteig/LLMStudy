// Single source of truth for domain types shared between the API and the web
// client. Imported directly as TypeScript (no build step) via the workspace
// package "@llmstudy/shared". Keep this file dependency-free.

export type ObjectiveStatus =
  | 'not_started'
  | 'learning'
  | 'reviewing'
  | 'confident';

export const OBJECTIVE_STATUSES: ObjectiveStatus[] = [
  'not_started',
  'learning',
  'reviewing',
  'confident',
];

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  not_started: 'Not started',
  learning: 'Learning',
  reviewing: 'Reviewing',
  confident: 'Confident',
};

/** A certification objective — one row in the blueprint tracker. */
export interface Objective {
  id: number;
  title: string;
  description: string | null;
  cert_path: string;
  domain: string | null;
  /** Self-assessed mastery, 1-5. Null until first assessed. */
  confidence: number | null;
  status: ObjectiveStatus;
  last_reviewed_date: string | null;
  next_review_date: string | null;
  notes: string | null;
  evidence_of_understanding: string | null;
  created_at: string;
  updated_at: string;
}

/** Fields a client may set when creating an objective (title required). */
export type NewObjective = { title: string } & Partial<
  Omit<Objective, 'id' | 'title' | 'created_at' | 'updated_at'>
>;

/** Fields a client may change on an existing objective. */
export type ObjectiveUpdate = Partial<
  Omit<Objective, 'id' | 'created_at' | 'updated_at'>
>;
