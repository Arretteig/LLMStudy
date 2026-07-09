import type {
  AnswerAttempt,
  AppSettings,
  AppSettingsUpdate,
  DashboardSummary,
  DrillAnswerResult,
  DrillQuestion,
  DueItem,
  ExamItemView,
  ExamReadinessEstimate,
  ExamResult,
  ExamSession,
  ExamSessionDetail,
  LabRunUpdate,
  LabRunWithDetails,
  LabTemplateUpdate,
  LabTemplateWithDetails,
  NewLabRun,
  NewLabTemplate,
  NewObjective,
  NewQuestion,
  Objective,
  ObjectiveUpdate,
  QuestionChoice,
  QuestionListItem,
  QuestionUpdate,
  RecallQuestion,
  ReviewForecastDay,
  ReviewSubmission,
} from '@llmstudy/shared';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function listObjectives(): Promise<Objective[]> {
  return http<Objective[]>('/api/objectives');
}

export function createObjective(input: NewObjective): Promise<Objective> {
  return http<Objective>('/api/objectives', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateObjective(
  id: number,
  input: ObjectiveUpdate,
): Promise<Objective> {
  return http<Objective>(`/api/objectives/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

// ---- Recall questions -----------------------------------------------------

export function listQuestions(): Promise<QuestionListItem[]> {
  return http<QuestionListItem[]>('/api/questions');
}

export function createQuestion(input: NewQuestion): Promise<RecallQuestion> {
  return http<RecallQuestion>('/api/questions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateQuestion(
  id: number,
  input: QuestionUpdate,
): Promise<RecallQuestion> {
  return http<RecallQuestion>(`/api/questions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteQuestion(id: number): Promise<void> {
  const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
}

/** Full choice set of an MCQ, including answers + rationales (authoring). */
export function getQuestionChoices(questionId: number): Promise<QuestionChoice[]> {
  return http<QuestionChoice[]>(`/api/questions/${questionId}/choices`);
}

// ---- Drill (untimed MCQ practice) ------------------------------------------

export function getDrillQuestions(params?: {
  domain?: string;
  objective_id?: number;
  limit?: number;
}): Promise<DrillQuestion[]> {
  const qs = new URLSearchParams();
  if (params?.domain) qs.set('domain', params.domain);
  if (params?.objective_id != null) qs.set('objective_id', String(params.objective_id));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return http<DrillQuestion[]>(`/api/drill${query ? `?${query}` : ''}`);
}

export function submitDrillAnswer(input: {
  question_id: number;
  selected_choice_ids: number[];
}): Promise<DrillAnswerResult> {
  return http<DrillAnswerResult>('/api/drill/answers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---- Mock exams -------------------------------------------------------------

export function createExam(input: {
  question_count?: number;
  predicted_score?: number;
}): Promise<ExamSessionDetail> {
  return http<ExamSessionDetail>('/api/exams', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listExams(): Promise<ExamSession[]> {
  return http<ExamSession[]>('/api/exams');
}

/** In-progress sessions return ExamSessionDetail; completed ones ExamResult
 * (distinguish by `completed_at`). */
export function getExam(id: number): Promise<ExamSessionDetail | ExamResult> {
  return http<ExamSessionDetail | ExamResult>(`/api/exams/${id}`);
}

export function updateExamItem(
  examId: number,
  position: number,
  patch: {
    selected_choice_ids?: number[];
    flagged?: boolean;
    time_spent_ms?: number;
  },
): Promise<ExamItemView> {
  return http<ExamItemView>(`/api/exams/${examId}/items/${position}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function finishExam(id: number): Promise<ExamResult> {
  return http<ExamResult>(`/api/exams/${id}/finish`, { method: 'POST' });
}

export function getExamReadiness(): Promise<ExamReadinessEstimate> {
  return http<ExamReadinessEstimate>('/api/exams/readiness');
}

// ---- Reviews --------------------------------------------------------------

export function listDue(params?: {
  objective_id?: number;
  domain?: string;
}): Promise<DueItem[]> {
  const qs = new URLSearchParams();
  if (params?.objective_id != null) qs.set('objective_id', String(params.objective_id));
  if (params?.domain) qs.set('domain', params.domain);
  const query = qs.toString();
  return http<DueItem[]>(`/api/reviews/due${query ? `?${query}` : ''}`);
}

export function submitReview(input: ReviewSubmission): Promise<AnswerAttempt> {
  return http<AnswerAttempt>('/api/reviews', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getHistory(questionId: number): Promise<AnswerAttempt[]> {
  return http<AnswerAttempt[]>(`/api/reviews/history/${questionId}`);
}

/** Undo a review by deleting its attempt (409 if not the latest for its question). */
export function deleteAttempt(id: number): Promise<void> {
  return del(`/api/reviews/attempts/${id}`);
}

export function getReviewForecast(days = 7): Promise<ReviewForecastDay[]> {
  return http<ReviewForecastDay[]>(`/api/reviews/forecast?days=${days}`);
}

// ---- Lab templates --------------------------------------------------------

export function listTemplates(): Promise<LabTemplateWithDetails[]> {
  return http<LabTemplateWithDetails[]>('/api/lab-templates');
}

export function createTemplate(input: NewLabTemplate): Promise<LabTemplateWithDetails> {
  return http<LabTemplateWithDetails>('/api/lab-templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTemplate(
  id: number,
  input: LabTemplateUpdate,
): Promise<LabTemplateWithDetails> {
  return http<LabTemplateWithDetails>(`/api/lab-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteTemplate(id: number): Promise<void> {
  return del(`/api/lab-templates/${id}`);
}

// ---- Lab runs -------------------------------------------------------------

export function listRuns(): Promise<LabRunWithDetails[]> {
  return http<LabRunWithDetails[]>('/api/lab-runs');
}

export function createRun(input: NewLabRun): Promise<LabRunWithDetails> {
  return http<LabRunWithDetails>('/api/lab-runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRun(id: number, input: LabRunUpdate): Promise<LabRunWithDetails> {
  return http<LabRunWithDetails>(`/api/lab-runs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteRun(id: number): Promise<void> {
  return del(`/api/lab-runs/${id}`);
}

// ---- Dashboard ------------------------------------------------------------

export function getDashboard(): Promise<DashboardSummary> {
  return http<DashboardSummary>('/api/dashboard');
}

// ---- Settings ---------------------------------------------------------------

export function getSettings(): Promise<AppSettings> {
  return http<AppSettings>('/api/settings');
}

export function updateSettings(patch: AppSettingsUpdate): Promise<AppSettings> {
  return http<AppSettings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
}
