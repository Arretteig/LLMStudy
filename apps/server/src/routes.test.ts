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
});
