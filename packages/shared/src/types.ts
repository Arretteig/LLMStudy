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
  /** 'recall' cards live in the spaced Review queue; 'mcq' items live in Drill/Mock. */
  question_format: 'recall' | 'mcq';
  question_text: string;
  expected_answer: string | null;
  /** 1 (easy) .. 5 (hard). Null until set. */
  difficulty: number | null;
  // Denormalized SRS cache — populated by the spaced-review engine in M3.
  last_attempted_date: string | null;
  next_review_date: string | null;
  self_score: number | null;
  /** Current interval in days (grows with the ladder); null until attempted. */
  interval_days: number | null;
  /** How many times this card has been rated 1-2 (Forgot/Poor). */
  lapses: number;
  created_at: string;
  updated_at: string;
}

/** A question joined with its objective's title (list responses). */
export interface RecallQuestionWithObjective extends RecallQuestion {
  objective_title: string | null;
}

/** Question list row with attempt aggregates for the browser (GET /api/questions). */
export interface QuestionListItem extends RecallQuestionWithObjective {
  attempt_count: number;
  /** Rating of the most recent attempt, or null. */
  last_rating: number | null;
}

/** One MCQ answer option. */
export interface QuestionChoice {
  id: number;
  question_id: number;
  position: number;
  choice_text: string;
  is_correct: boolean;
  /** Why this option is right/wrong — mandatory when authoring MCQs. */
  rationale: string | null;
}

/** Choice payload when creating/updating an MCQ (rationale required). */
export interface NewQuestionChoice {
  choice_text: string;
  is_correct: boolean;
  rationale: string;
}

/** Fields a client may set when creating a question (question_text required).
 *  MCQs (question_format 'mcq') must include >= 3 choices with >= 1 correct. */
export type NewQuestion = {
  question_text: string;
  question_format?: 'recall' | 'mcq';
  choices?: NewQuestionChoice[];
} & Partial<Pick<RecallQuestion, 'objective_id' | 'expected_answer' | 'difficulty'>>;

/** Fields a client may change on an existing question. `choices` replaces the
 *  full choice set (MCQs only). question_format itself is immutable. */
export type QuestionUpdate = Partial<
  Pick<
    RecallQuestion,
    'objective_id' | 'question_text' | 'expected_answer' | 'difficulty'
  >
> & { choices?: NewQuestionChoice[] };

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
  /** Pre-reveal confidence: 1 = guessing, 2 = probably, 3 = sure. Null when not captured. */
  confidence: number | null;
  /** Interval (days) this attempt produced; null on pre-M2 rows. */
  interval_days: number | null;
  /** Where the attempt came from. Only 'review' attempts drive the SRS schedule. */
  source: 'review' | 'drill' | 'exam';
  /** Owning exam session for source 'exam', else null. */
  session_id: number | null;
  /** MCQ selections (choice ids), null for recall attempts. */
  selected_choice_ids: number[] | null;
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
  /** Pre-reveal confidence: 1 = guessing, 2 = probably, 3 = sure. */
  confidence?: number | null;
}

/** One day of the upcoming review-load forecast. */
export interface ReviewForecastDay {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  /** Questions whose next_review_date falls on that date. */
  count: number;
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
  /** Rated attempts in this domain (all time). */
  attemptCount: number;
  /** Fraction of attempts rated >= 3 (0..1); null with no attempts. */
  successRate: number | null;
  /** Fraction of attempts rated <= 2 (0..1); null with no attempts. */
  againRate: number | null;
  /** Local date of the most recent attempt in this domain, or null. */
  lastAttemptDate: string | null;
  /** Official exam weight (percent) from the domains table, or null if unknown. */
  weight: number | null;
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
  /** Mean rating over the last 10 attempts on this objective's questions; null if unattempted. */
  meanRecentRating: number | null;
  /** Whole days since the last attempt on this objective; null if unattempted. */
  daysSinceLastAttempt: number | null;
  /** Official exam weight (percent) of this objective's domain, or null. */
  examWeight: number | null;
}

/** An official cert domain with its exam weight. */
export interface Domain {
  cert_path: string;
  name: string;
  /** Exam weight in percent (e.g. 30). */
  weight: number;
}

/** Confidence-vs-correctness quadrant over a recent window (calibration). */
export interface CalibrationSummary {
  /** Attempts window in days. */
  windowDays: number;
  /** Only attempts that captured confidence are counted. */
  quadrant: {
    confidentCorrect: number;
    /** The danger zone: "sure" but rated <= 2. */
    confidentWrong: number;
    unsureCorrect: number;
    unsureWrong: number;
  };
  /** Questions answered "sure" but rated <= 2 within the window, newest first. */
  dangerZone: {
    question_id: number;
    question_text: string;
    objective_title: string | null;
    last_wrong_date: string;
  }[];
  /** Objectives whose self-set confidence >= 4 but mean recent rating <= 2.5. */
  overconfidentObjectives: {
    id: number;
    title: string;
    confidence: number;
    meanRecentRating: number;
  }[];
}

/** Daily-habit streak, computed from answer_attempts (never stored). */
export interface StreakInfo {
  /** Consecutive active days ending today (or yesterday if today isn't active yet). */
  current: number;
  longest: number;
  activeToday: boolean;
  reviewsToday: number;
  /** Unspent repair tokens (earned 1 per 7 active days, bank max 2). */
  repairTokens: number;
  /** Reviews needed for a day to count (queue-cleared days also count). */
  dailyGoal: number;
}

/** Mastery-based "ready to schedule the exam" signal (no exam date required). */
export interface ReadinessInfo {
  ready: boolean;
  /** Human-readable explanation of what's met / missing. */
  detail: string;
}

export interface DashboardSummary {
  today: string;
  objectives: DashboardObjectiveStats;
  questions: DashboardQuestionStats;
  reviews: DashboardReviewStats;
  labs: DashboardLabStats;
  domains: DashboardDomainStat[];
  weakObjectives: WeakObjective[];
  streak: StreakInfo;
  /** Target exam date from settings, or null when not scheduled. */
  examDate: string | null;
  /** Whole days from today to examDate (negative if past), or null. */
  daysToExam: number | null;
  readiness: ReadinessInfo;
  calibration: CalibrationSummary;
}

// ---------------------------------------------------------------------------
// App settings (single-user key-value)
// ---------------------------------------------------------------------------

/** Parsed app settings. GET /api/settings returns all keys with defaults applied. */
export interface AppSettings {
  /** Target exam date 'YYYY-MM-DD', or null when not scheduled. */
  exam_date: string | null;
  /** New (never-attempted) cards introduced into the review queue per day. */
  new_cards_per_day: number;
}

/** Payload for PUT /api/settings — any subset of keys; exam_date null clears it. */
export type AppSettingsUpdate = Partial<AppSettings>;

// ---------------------------------------------------------------------------
// MCQ practice: Drill (untimed) + Mock exams (timed). Neither touches the SRS.
// ---------------------------------------------------------------------------

/** An MCQ served for practice — no answers/rationales until graded. */
export interface DrillQuestion {
  id: number;
  objective_id: number | null;
  objective_title: string | null;
  domain: string | null;
  question_text: string;
  difficulty: number | null;
  /** True when more than one choice is correct ("choose two"). */
  multi_select: boolean;
  choices: { id: number; position: number; choice_text: string }[];
}

/** Grading result for one drill answer, with full elaborated feedback. */
export interface DrillAnswerResult {
  correct: boolean;
  correct_choice_ids: number[];
  /** Every choice with is_correct + rationale (UWorld-style feedback). */
  choices: QuestionChoice[];
}

export interface ExamSession {
  id: number;
  started_at: string;
  completed_at: string | null;
  question_count: number;
  duration_minutes: number;
  /** Self-predicted score (percent), captured before the exam starts. */
  predicted_score: number | null;
  score_percent: number | null;
  created_at: string;
}

/** One exam item as shown while the session runs (no answers). */
export interface ExamItemView {
  position: number;
  question_id: number;
  question_text: string;
  multi_select: boolean;
  flagged: boolean;
  selected_choice_ids: number[] | null;
  choices: { id: number; position: number; choice_text: string }[];
}

export interface ExamSessionDetail extends ExamSession {
  items: ExamItemView[];
}

export interface ExamDomainScore {
  domain: string;
  weight: number | null;
  correct: number;
  total: number;
}

/** One graded item on the post-exam review screen. */
export interface ExamReviewItem {
  position: number;
  question_id: number;
  question_text: string;
  objective_id: number | null;
  objective_title: string | null;
  domain: string | null;
  multi_select: boolean;
  flagged: boolean;
  selected_choice_ids: number[] | null;
  is_correct: boolean;
  choices: QuestionChoice[];
}

export interface ExamResult extends ExamSession {
  domainScores: ExamDomainScore[];
  review: ExamReviewItem[];
}

/** Mock-exam-based readiness estimate (median of the last two mocks). */
export interface ExamReadinessEstimate {
  mockCount: number;
  /** Median of the last two completed scores (percent); null until one exists. */
  estimate: number | null;
  /** +/- band in percent (irreducible day-of noise). */
  band: number;
  history: {
    id: number;
    completed_at: string;
    score_percent: number;
    predicted_score: number | null;
  }[];
}
