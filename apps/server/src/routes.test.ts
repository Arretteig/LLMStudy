// Route-level smoke test. Uses an in-memory DB (DB_PATH set before importing db)
// so it exercises the real Express wiring, JSON bodies, and status codes without
// touching the on-disk database.
process.env.DB_PATH = ':memory:';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { getDb } from './db';
import { seed } from './seed';

const app = createApp();

beforeAll(() => {
  seed(getDb());
});

describe('HTTP routes', () => {
  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/objectives returns seeded objectives', async () => {
    const res = await request(app).get('/api/objectives');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('POST /api/objectives creates, then rejects a missing title', async () => {
    const ok = await request(app).post('/api/objectives').send({ title: 'Route test obj' });
    expect(ok.status).toBe(201);
    expect(ok.body.id).toBeGreaterThan(0);

    const bad = await request(app).post('/api/objectives').send({ domain: 'x' });
    expect(bad.status).toBe(400);
  });

  it('POST /api/reviews validates the rating', async () => {
    const q = await request(app).get('/api/questions');
    const questionId = q.body[0].id;
    const bad = await request(app)
      .post('/api/reviews')
      .send({ question_id: questionId, rating: 9 });
    expect(bad.status).toBe(400);
  });

  it('GET /api/dashboard returns an aggregate summary', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.objectives.total).toBeGreaterThan(0);
    expect(Array.isArray(res.body.domains)).toBe(true);
  });

  it('404s on an unknown resource', async () => {
    const res = await request(app).get('/api/lab-templates/999999');
    expect(res.status).toBe(404);
  });

  it('GET /api/reviews/forecast returns a zero-filled window (default 7 days)', async () => {
    const week = await request(app).get('/api/reviews/forecast');
    expect(week.status).toBe(200);
    expect(week.body).toHaveLength(7);
    for (const day of week.body) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof day.count).toBe('number');
    }

    const three = await request(app).get('/api/reviews/forecast?days=3');
    expect(three.body).toHaveLength(3);

    const clamped = await request(app).get('/api/reviews/forecast?days=banana');
    expect(clamped.body).toHaveLength(7); // non-numeric falls back to the default
  });

  it('DELETE /api/reviews/attempts/:id undoes only the latest attempt', async () => {
    const created = await request(app)
      .post('/api/questions')
      .send({ question_text: 'undo me (route test)' });
    const questionId = created.body.id;

    const first = await request(app)
      .post('/api/reviews')
      .send({ question_id: questionId, rating: 2 });
    const second = await request(app)
      .post('/api/reviews')
      .send({ question_id: questionId, rating: 5 });

    // Undoing the older attempt is a conflict, not a delete.
    const conflict = await request(app).delete(`/api/reviews/attempts/${first.body.id}`);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({
      error: 'only the latest attempt for a question can be undone',
    });

    // Undoing the latest rolls the question's cache back to the first attempt.
    const undone = await request(app).delete(`/api/reviews/attempts/${second.body.id}`);
    expect(undone.status).toBe(200);
    expect(undone.body.question.id).toBe(questionId);
    expect(undone.body.question.self_score).toBe(2);
    expect(undone.body.question.next_review_date).toBe(first.body.next_review_date);

    const missing = await request(app).delete(`/api/reviews/attempts/${second.body.id}`);
    expect(missing.status).toBe(404);
  });

  it('PUT /api/objectives/:id rejects an empty title with JSON 400', async () => {
    const objectives = await request(app).get('/api/objectives');
    const id = objectives.body[0].id;
    const res = await request(app).put(`/api/objectives/${id}`).send({ title: '  ' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'title is required' });
  });

  it('unknown /api paths get a JSON 404', async () => {
    const res = await request(app).get('/api/nonsense');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('malformed JSON bodies get a JSON 400', async () => {
    const res = await request(app)
      .post('/api/objectives')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid JSON body' });
  });
});
