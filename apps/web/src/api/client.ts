import type {
  AnswerAttempt,
  DueItem,
  NewObjective,
  NewQuestion,
  Objective,
  ObjectiveUpdate,
  QuestionUpdate,
  RecallQuestion,
  RecallQuestionWithObjective,
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

export function listQuestions(): Promise<RecallQuestionWithObjective[]> {
  return http<RecallQuestionWithObjective[]>('/api/questions');
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

// ---- Reviews --------------------------------------------------------------

export function listDue(): Promise<DueItem[]> {
  return http<DueItem[]>('/api/reviews/due');
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
