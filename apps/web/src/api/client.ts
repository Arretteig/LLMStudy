import type { NewObjective, Objective, ObjectiveUpdate } from '@llmstudy/shared';

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
