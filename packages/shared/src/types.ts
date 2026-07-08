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

// ---------------------------------------------------------------------------
// Recall questions (M2)
// ---------------------------------------------------------------------------

/** An active-recall question, optionally linked to an objective. */
export interface RecallQuestion {
  id: number;
  objective_id: number | null;
  question_text: string;
  expected_answer: string | null;
  /** 1 (easy) .. 5 (hard). Null until set. */
  difficulty: number | null;
  // Denormalized SRS cache — populated by the spaced-review engine in M3.
  last_attempted_date: string | null;
  next_review_date: string | null;
  self_score: number | null;
  created_at: string;
  updated_at: string;
}

/** A question joined with its objective's title (list responses). */
export interface RecallQuestionWithObjective extends RecallQuestion {
  objective_title: string | null;
}

/** Fields a client may set when creating a question (question_text required). */
export type NewQuestion = { question_text: string } & Partial<
  Pick<RecallQuestion, 'objective_id' | 'expected_answer' | 'difficulty'>
>;

/** Fields a client may change on an existing question. */
export type QuestionUpdate = Partial<
  Pick<
    RecallQuestion,
    'objective_id' | 'question_text' | 'expected_answer' | 'difficulty'
  >
>;

// ---------------------------------------------------------------------------
// Spaced review (M3)
// ---------------------------------------------------------------------------

/** One immutable record of attempting a question. */
export interface AnswerAttempt {
  id: number;
  question_id: number;
  user_answer: string | null;
  self_score: number | null;
  /** 1-5 self-rating that drove the next interval. */
  rating: number;
  attempted_date: string;
  next_review_date: string | null;
  created_at: string;
}

/** A question surfaced in the due queue. */
export interface DueItem extends RecallQuestionWithObjective {
  /** True when the question has never been attempted. */
  is_new: boolean;
}

/** Payload for submitting a review. */
export interface ReviewSubmission {
  question_id: number;
  rating: number;
  user_answer?: string | null;
}

export interface ReviewRatingOption {
  value: number;
  label: string;
  hint: string;
  days: number;
}

/** The 1-5 self-rating scale shown in the review UI. */
export const REVIEW_RATINGS: ReviewRatingOption[] = [
  { value: 1, label: 'Forgot', hint: 'tomorrow', days: 1 },
  { value: 2, label: 'Poor', hint: 'in 2 days', days: 2 },
  { value: 3, label: 'Okay', hint: 'in 4 days', days: 4 },
  { value: 4, label: 'Good', hint: 'in 7 days', days: 7 },
  { value: 5, label: 'Easy', hint: 'in 14 days', days: 14 },
];

// ---------------------------------------------------------------------------
// Lab notebook (M4)
// ---------------------------------------------------------------------------

/** A hands-on experiment entry. */
export interface Lab {
  id: number;
  title: string;
  objective_id: number | null;
  hypothesis: string | null;
  what_changed: string | null;
  commands_config: string | null;
  observed_result: string | null;
  why_it_happened: string | null;
  what_next: string | null;
  created_at: string;
  updated_at: string;
}

/** A lab joined with its objective title and tag names. */
export interface LabWithDetails extends Lab {
  objective_title: string | null;
  tags: string[];
}

type LabBodyFields = Omit<Lab, 'id' | 'title' | 'created_at' | 'updated_at'>;

/** Fields a client may set when creating a lab (title required, tags optional). */
export type NewLab = { title: string } & Partial<LabBodyFields> & {
  tags?: string[];
};

/** Fields a client may change on an existing lab. */
export type LabUpdate = Partial<Omit<Lab, 'id' | 'created_at' | 'updated_at'>> & {
  tags?: string[];
};

/** The structured prompts that make a lab a real experiment, in order. */
export const LAB_SECTIONS: { key: keyof Lab; label: string; hint: string }[] = [
  { key: 'hypothesis', label: 'Hypothesis', hint: 'What did you expect to happen?' },
  { key: 'what_changed', label: 'What I changed', hint: 'The variable / knob you altered.' },
  {
    key: 'commands_config',
    label: 'Commands / config',
    hint: 'Exact commands or config used.',
  },
  { key: 'observed_result', label: 'Observed result', hint: 'What actually happened.' },
  {
    key: 'why_it_happened',
    label: 'Why I think it happened',
    hint: 'Your explanation / mechanism.',
  },
  { key: 'what_next', label: 'What I would try next', hint: 'The follow-up experiment.' },
];
