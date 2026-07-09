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

  it('GET /api/dashboard includes streak, readiness, and exam fields', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.streak).toMatchObject({ dailyGoal: 5 });
    expect(typeof res.body.streak.current).toBe('number');
    expect(typeof res.body.streak.repairTokens).toBe('number');
    expect(typeof res.body.readiness.ready).toBe('boolean');
    expect(typeof res.body.readiness.detail).toBe('string');
    expect(res.body).toHaveProperty('examDate');
    expect(res.body).toHaveProperty('daysToExam');
    for (const domain of res.body.domains) {
      expect(domain).toHaveProperty('attemptCount');
      expect(domain).toHaveProperty('successRate');
    }
  });

  it('settings round-trip: GET defaults, PUT persists, bad values 400', async () => {
    const defaults = await request(app).get('/api/settings');
    expect(defaults.status).toBe(200);
    expect(defaults.body).toEqual({ exam_date: null, new_cards_per_day: 15 });

    const updated = await request(app)
      .put('/api/settings')
      .send({ exam_date: '2026-10-01', new_cards_per_day: 20 });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ exam_date: '2026-10-01', new_cards_per_day: 20 });

    const persisted = await request(app).get('/api/settings');
    expect(persisted.body).toEqual({ exam_date: '2026-10-01', new_cards_per_day: 20 });

    const badDate = await request(app)
      .put('/api/settings')
      .send({ exam_date: 'October-ish' });
    expect(badDate.status).toBe(400);
    expect(badDate.body.error).toMatch(/exam_date/);

    const badCards = await request(app)
      .put('/api/settings')
      .send({ new_cards_per_day: 500 });
    expect(badCards.status).toBe(400);

    // Clear back to defaults so later tests see a pristine config.
    const cleared = await request(app)
      .put('/api/settings')
      .send({ exam_date: null, new_cards_per_day: 15 });
    expect(cleared.body).toEqual({ exam_date: null, new_cards_per_day: 15 });
  });

  it('GET /api/reviews/due supports objective_id and domain scopes', async () => {
    interface Obj {
      id: number;
      domain: string | null;
    }
    const objectives = await request(app).get('/api/objectives');
    const questions = await request(app).get('/api/questions');
    const byId = new Map<number, Obj>(objectives.body.map((o: Obj) => [o.id, o]));
    // An objective that certainly has a question and a domain.
    const target = byId.get(
      questions.body.find(
        (q: { objective_id: number | null }) =>
          q.objective_id !== null && byId.get(q.objective_id)?.domain,
      ).objective_id,
    )!;

    const scoped = await request(app).get(`/api/reviews/due?objective_id=${target.id}`);
    expect(scoped.status).toBe(200);
    expect(scoped.body.length).toBeGreaterThan(0);
    for (const item of scoped.body) {
      expect(item.objective_id).toBe(target.id);
    }

    const domainIds = new Set(
      objectives.body
        .filter((o: Obj) => o.domain === target.domain)
        .map((o: Obj) => o.id),
    );
    const byDomain = await request(app).get(
      `/api/reviews/due?domain=${encodeURIComponent(target.domain!)}`,
    );
    expect(byDomain.status).toBe(200);
    expect(byDomain.body.length).toBeGreaterThan(0);
    for (const item of byDomain.body) {
      expect(domainIds.has(item.objective_id)).toBe(true);
    }

    const bad = await request(app).get('/api/reviews/due?objective_id=banana');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/objective_id/);
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

  it('GET /api/domains returns the seeded exam weights, heaviest first', async () => {
    const res = await request(app).get('/api/domains');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0]).toEqual({
      cert_path: 'NCA-GENL',
      name: 'Core Machine Learning and AI Knowledge',
      weight: 30,
    });
    const weights = res.body.map((d: { weight: number }) => d.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  it('GET /api/dashboard includes calibration and per-domain exam weights', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.calibration.windowDays).toBe(30);
    for (const key of ['confidentCorrect', 'confidentWrong', 'unsureCorrect', 'unsureWrong']) {
      expect(typeof res.body.calibration.quadrant[key]).toBe('number');
    }
    expect(Array.isArray(res.body.calibration.dangerZone)).toBe(true);
    expect(Array.isArray(res.body.calibration.overconfidentObjectives)).toBe(true);

    const core = res.body.domains.find(
      (d: { domain: string }) => d.domain === 'Core Machine Learning and AI Knowledge',
    );
    expect(core.weight).toBe(30);
  });

  it('POST /api/reviews round-trips confidence and 400s on a bad value', async () => {
    const created = await request(app)
      .post('/api/questions')
      .send({ question_text: 'confidence route test' });
    const questionId = created.body.id;

    const ok = await request(app)
      .post('/api/reviews')
      .send({ question_id: questionId, rating: 4, confidence: 2 });
    expect(ok.status).toBe(201);
    expect(ok.body.confidence).toBe(2);

    const history = await request(app).get(`/api/reviews/history/${questionId}`);
    expect(history.body[0].confidence).toBe(2);

    const bad = await request(app)
      .post('/api/reviews')
      .send({ question_id: questionId, rating: 4, confidence: 9 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/confidence/);
  });

  it('GET /api/questions rows include attempt aggregates', async () => {
    const created = await request(app)
      .post('/api/questions')
      .send({ question_text: 'aggregate route test' });
    const questionId = created.body.id;
    await request(app).post('/api/reviews').send({ question_id: questionId, rating: 3 });
    await request(app).post('/api/reviews').send({ question_id: questionId, rating: 5 });

    const list = await request(app).get('/api/questions');
    const reviewed = list.body.find((q: { id: number }) => q.id === questionId);
    expect(reviewed).toMatchObject({ attempt_count: 2, last_rating: 5 });

    const untouched = list.body.find(
      (q: { attempt_count: number }) => q.attempt_count === 0,
    );
    expect(untouched.last_rating).toBeNull();
  });

  const MCQ_CHOICES = [
    { choice_text: 'Right', is_correct: true, rationale: 'yes' },
    { choice_text: 'Wrong A', is_correct: false, rationale: 'no' },
    { choice_text: 'Wrong B', is_correct: false, rationale: 'also no' },
  ];

  it('MCQ authoring round-trip: create, read choices, replace, immutable format', async () => {
    const created = await request(app).post('/api/questions').send({
      question_text: 'route mcq',
      question_format: 'mcq',
      choices: MCQ_CHOICES,
    });
    expect(created.status).toBe(201);
    expect(created.body.question_format).toBe('mcq');

    const choices = await request(app).get(`/api/questions/${created.body.id}/choices`);
    expect(choices.status).toBe(200);
    expect(choices.body).toHaveLength(3);
    expect(choices.body[0]).toMatchObject({
      position: 1,
      choice_text: 'Right',
      is_correct: true,
      rationale: 'yes',
    });

    const replaced = await request(app)
      .put(`/api/questions/${created.body.id}`)
      .send({ choices: [...MCQ_CHOICES.slice(1), MCQ_CHOICES[0], MCQ_CHOICES[0]] });
    expect(replaced.status).toBe(200);
    const after = await request(app).get(`/api/questions/${created.body.id}/choices`);
    expect(after.body).toHaveLength(4);

    const badFormat = await request(app)
      .put(`/api/questions/${created.body.id}`)
      .send({ question_format: 'recall' });
    expect(badFormat.status).toBe(400);

    const badCreate = await request(app).post('/api/questions').send({
      question_text: 'invalid mcq',
      question_format: 'mcq',
      choices: MCQ_CHOICES.slice(0, 2), // only 2 choices
    });
    expect(badCreate.status).toBe(400);

    const missing = await request(app).get('/api/questions/999999/choices');
    expect(missing.status).toBe(404);
  });

  it('GET /api/drill serves answer-free MCQs and validates objective_id', async () => {
    const res = await request(app).get('/api/drill');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0); // the MCQ created above
    const item = res.body[0];
    expect(item).toHaveProperty('multi_select');
    expect(item.choices.length).toBeGreaterThanOrEqual(3);
    expect(item.choices[0]).not.toHaveProperty('is_correct');

    const limited = await request(app).get('/api/drill?limit=1');
    expect(limited.body).toHaveLength(1);

    const bad = await request(app).get('/api/drill?objective_id=banana');
    expect(bad.status).toBe(400);
  });

  it('POST /api/drill/answers grades and elaborates; 400s on bad input', async () => {
    const drill = await request(app).get('/api/drill?limit=1');
    const question = drill.body[0];
    const choiceIds = question.choices.map((c: { id: number }) => c.id);

    const graded = await request(app)
      .post('/api/drill/answers')
      .send({ question_id: question.id, selected_choice_ids: [choiceIds[0]] });
    expect(graded.status).toBe(201);
    expect(typeof graded.body.correct).toBe('boolean');
    expect(Array.isArray(graded.body.correct_choice_ids)).toBe(true);
    expect(graded.body.choices[0]).toHaveProperty('rationale');

    const noQuestion = await request(app)
      .post('/api/drill/answers')
      .send({ selected_choice_ids: [1] });
    expect(noQuestion.status).toBe(400);

    const badIds = await request(app)
      .post('/api/drill/answers')
      .send({ question_id: question.id, selected_choice_ids: [999999] });
    expect(badIds.status).toBe(400);
  });

  it('mock-exam lifecycle: create, answer, finish, readiness', async () => {
    // Make sure the pool holds at least 10 MCQs (the seed already ships some;
    // the short-pool 400 with its exact message is covered in exams.repo.test).
    const questions = await request(app).get('/api/questions');
    const mcqCount = questions.body.filter(
      (q: { question_format: string }) => q.question_format === 'mcq',
    ).length;
    for (let i = mcqCount; i < 10; i++) {
      await request(app).post('/api/questions').send({
        question_text: `exam pool mcq ${i}`,
        question_format: 'mcq',
        choices: MCQ_CHOICES,
      });
    }
    const created = await request(app)
      .post('/api/exams')
      .send({ question_count: 10, predicted_score: 70 });
    expect(created.status).toBe(201);
    expect(created.body.question_count).toBe(10);
    expect(created.body.duration_minutes).toBe(12);
    expect(created.body.predicted_score).toBe(70);
    expect(created.body.items).toHaveLength(10);
    const examId = created.body.id;

    const list = await request(app).get('/api/exams');
    expect(list.status).toBe(200);
    expect(list.body[0].id).toBe(examId); // newest first

    // Answer item 1 correctly (correct ids via the authoring choices route).
    const item = created.body.items[0];
    const choices = await request(app).get(`/api/questions/${item.question_id}/choices`);
    const correctIds = choices.body
      .filter((c: { is_correct: boolean }) => c.is_correct)
      .map((c: { id: number }) => c.id);
    const updated = await request(app)
      .put(`/api/exams/${examId}/items/${item.position}`)
      .send({ selected_choice_ids: correctIds, flagged: true, time_spent_ms: 30000 });
    expect(updated.status).toBe(200);
    expect(updated.body.selected_choice_ids).toEqual(correctIds);
    expect(updated.body.flagged).toBe(true);

    const inProgress = await request(app).get(`/api/exams/${examId}`);
    expect(inProgress.status).toBe(200);
    expect(inProgress.body.completed_at).toBeNull();
    expect(inProgress.body).not.toHaveProperty('review');

    const finished = await request(app).post(`/api/exams/${examId}/finish`);
    expect(finished.status).toBe(200);
    expect(finished.body.score_percent).toBe(10); // 1 of 10 answered correctly
    expect(finished.body.review).toHaveLength(10);
    expect(Array.isArray(finished.body.domainScores)).toBe(true);

    // Completed sessions are frozen: item updates and re-finishing conflict.
    const frozen = await request(app)
      .put(`/api/exams/${examId}/items/1`)
      .send({ flagged: false });
    expect(frozen.status).toBe(409);
    const again = await request(app).post(`/api/exams/${examId}/finish`);
    expect(again.status).toBe(409);

    const result = await request(app).get(`/api/exams/${examId}`);
    expect(result.body).toHaveProperty('review');

    const readiness = await request(app).get('/api/exams/readiness');
    expect(readiness.status).toBe(200);
    expect(readiness.body.mockCount).toBe(1);
    expect(readiness.body.estimate).toBe(10);
    expect(readiness.body.band).toBe(6);
    expect(readiness.body.history).toHaveLength(1);

    const unknown = await request(app).get('/api/exams/999999');
    expect(unknown.status).toBe(404);
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
