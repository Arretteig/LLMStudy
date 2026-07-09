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
// Lab system (M4): templates (guided exercises) + runs (my attempts)
// ---------------------------------------------------------------------------

/** A reusable guided exercise connected to an objective. */
export interface LabTemplate {
  id: number;
  title: string;
  objective_id: number | null;
  domain: string | null;
  goal: string | null;
  background: string | null;
  instructions: string | null;
  success_criteria: string | null;
  reflection_questions: string | null;
  suggested_commands: string | null;
  difficulty: number | null;
  estimated_minutes: number | null;
  created_at: string;
  updated_at: string;
}

/** A template joined with objective title, tag names, and run count. */
export interface LabTemplateWithDetails extends LabTemplate {
  objective_title: string | null;
  tags: string[];
  run_count: number;
}

type TemplateBody = Omit<LabTemplate, 'id' | 'title' | 'created_at' | 'updated_at'>;

export type NewLabTemplate = { title: string } & Partial<TemplateBody> & {
  tags?: string[];
};

export type LabTemplateUpdate = Partial<
  Omit<LabTemplate, 'id' | 'created_at' | 'updated_at'>
> & { tags?: string[] };

/** The read-only guidance sections of a template, shown while running a lab. */
export const LAB_TEMPLATE_SECTIONS: {
  key: keyof LabTemplate;
  label: string;
  hint: string;
}[] = [
  { key: 'goal', label: 'Goal', hint: 'What you should understand by the end.' },
  { key: 'background', label: 'Background', hint: 'Context you need first.' },
  { key: 'instructions', label: 'Steps', hint: 'Step-by-step instructions.' },
  {
    key: 'success_criteria',
    label: 'Success criteria',
    hint: 'How you know you succeeded.',
  },
  {
    key: 'reflection_questions',
    label: 'Reflection questions',
    hint: 'Answer these after the lab.',
  },
  {
    key: 'suggested_commands',
    label: 'Suggested commands / config',
    hint: 'Optional starting point.',
  },
];

export type LabRunStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'needs_repeat';

export const LAB_RUN_STATUSES: LabRunStatus[] = [
  'not_started',
  'in_progress',
  'completed',
  'needs_repeat',
];

export const LAB_RUN_STATUS_LABELS: Record<LabRunStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  needs_repeat: 'Needs repeat',
};

/** My actual attempt at a lab. */
export interface LabRun {
  id: number;
  template_id: number | null;
  objective_id: number | null;
  status: LabRunStatus;
  hypothesis: string | null;
  what_changed: string | null;
  commands_config: string | null;
  observed_result: string | null;
  why_it_happened: string | null;
  mistakes: string | null;
  what_next: string | null;
  confidence_after: number | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A run joined with its template and objective titles. */
export interface LabRunWithDetails extends LabRun {
  template_title: string | null;
  objective_title: string | null;
}

export type NewLabRun = Partial<Omit<LabRun, 'id' | 'created_at' | 'updated_at'>>;

export type LabRunUpdate = Partial<Omit<LabRun, 'id' | 'created_at' | 'updated_at'>>;

/** The editable reflection sections of a run, in workflow order. */
export const LAB_RUN_SECTIONS: {
  key: keyof LabRun;
  label: string;
  hint: string;
  mono?: boolean;
}[] = [
  { key: 'hypothesis', label: 'Hypothesis', hint: 'Write this BEFORE you start.' },
  { key: 'what_changed', label: 'What I changed', hint: 'The variable you altered.' },
  {
    key: 'commands_config',
    label: 'Commands / config used',
    hint: 'Exact commands or config.',
    mono: true,
  },
  { key: 'observed_result', label: 'Observed result', hint: 'What actually happened.' },
  {
    key: 'why_it_happened',
    label: 'Why I think it happened',
    hint: 'Your explanation / mechanism.',
  },
  {
    key: 'mistakes',
    label: 'Mistakes / confusions',
    hint: 'What tripped you up (spin these into recall questions).',
  },
  { key: 'what_next', label: 'What I would try next', hint: 'The follow-up experiment.' },
  { key: 'notes', label: 'Notes', hint: 'Anything else worth recording.' },
];

// ---------------------------------------------------------------------------
// Dashboard (M5)
// ---------------------------------------------------------------------------

export interface DashboardObjectiveStats {
  total: number;
  byStatus: Record<ObjectiveStatus, number>;
  weak: number; // confidence 1-2
  unrated: number; // confidence null
  avgConfidence: number | null;
}

export interface DashboardQuestionStats {
  total: number;
  due: number; // never attempted OR next_review_date <= today
  attempted: number; // has at least one attempt
}

export interface DashboardReviewStats {
  totalAttempts: number;
  last7Days: number;
  avgRecentRating: number | null; // over the most recent attempts
}

export interface DashboardLabStats {
  templates: number;
  runsTotal: number;
  runsCompleted: number;
  runsInProgress: number;
}

export interface DashboardDomainStat {
  domain: string;
  objectiveCount: number;
  avgConfidence: number | null;
  weakCount: number;
  questionCount: number;
  dueCount: number;
  runsCompleted: number;
}

/** A weak objective with the reasons it surfaced, ranked for "work on this next". */
export interface WeakObjective {
  id: number;
  title: string;
  domain: string | null;
  status: ObjectiveStatus;
  confidence: number | null;
  questionCount: number;
  dueCount: number;
  runCount: number;
  hasEvidence: boolean;
  weaknessScore: number;
  reasons: string[];
}

export interface DashboardSummary {
  today: string;
  objectives: DashboardObjectiveStats;
  questions: DashboardQuestionStats;
  reviews: DashboardReviewStats;
  labs: DashboardLabStats;
  domains: DashboardDomainStat[];
  weakObjectives: WeakObjective[];
}
