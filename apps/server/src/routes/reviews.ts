import { Router } from 'express';
import { getDb } from '../db';
import { ValidationError } from '../errors';
import {
  type DueFilter,
  forecast,
  listDue,
  listHistory,
  recordAttempt,
  undoAttempt,
} from '../reviews.repo';

export const reviewsRouter = Router();

// GET /api/reviews/due                    -> full queue (reviews + capped new)
// GET /api/reviews/due?objective_id=3     -> scoped to one objective
// GET /api/reviews/due?domain=Deployment  -> scoped to one domain (objective_id wins)
reviewsRouter.get('/due', (req, res) => {
  const filter: DueFilter = {};
  const rawObjective = req.query.objective_id;
  if (typeof rawObjective === 'string' && rawObjective !== '') {
    const objectiveId = Number(rawObjective);
    if (!Number.isInteger(objectiveId)) {
      throw new ValidationError('objective_id must be an integer');
    }
    filter.objectiveId = objectiveId;
  }
  if (typeof req.query.domain === 'string' && req.query.domain !== '') {
    filter.domain = req.query.domain;
  }
  res.json(listDue(getDb(), undefined, filter));
});

// GET /api/reviews/forecast?days=N -> upcoming review load, one entry per day
reviewsRouter.get('/forecast', (req, res) => {
  const raw = req.query.days;
  const parsed = typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;
  const days = Number.isNaN(parsed) ? 7 : Math.min(60, Math.max(1, Math.trunc(parsed)));
  res.json(forecast(getDb(), days));
});

// GET /api/reviews/history/:questionId -> attempt history, newest first
reviewsRouter.get('/history/:questionId', (req, res) => {
  res.json(listHistory(getDb(), Number(req.params.questionId)));
});

// POST /api/reviews -> record an attempt { question_id, rating, user_answer?, confidence? }
reviewsRouter.post('/', (req, res) => {
  const body = req.body ?? {};
  const questionId = Number(body.question_id);
  if (!Number.isInteger(questionId)) {
    throw new ValidationError('question_id is required');
  }
  const attempt = recordAttempt(getDb(), {
    question_id: questionId,
    rating: Number(body.rating),
    user_answer: typeof body.user_answer === 'string' ? body.user_answer : null,
    confidence: body.confidence ?? null, // repo validates 1..3 or null
  });
  res.status(201).json(attempt);
});

// DELETE /api/reviews/attempts/:id -> undo the latest attempt for a question
reviewsRouter.delete('/attempts/:id', (req, res) => {
  const question = undoAttempt(getDb(), Number(req.params.id));
  res.json({ question });
});
