import { Router } from 'express';
import { getDb } from '../db';
import { ValidationError } from '../errors';
import { forecast, listDue, listHistory, recordAttempt, undoAttempt } from '../reviews.repo';

export const reviewsRouter = Router();

// GET /api/reviews/due -> questions due today or overdue (plus capped new questions)
reviewsRouter.get('/due', (_req, res) => {
  res.json(listDue(getDb()));
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

// POST /api/reviews -> record an attempt { question_id, rating, user_answer? }
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
  });
  res.status(201).json(attempt);
});

// DELETE /api/reviews/attempts/:id -> undo the latest attempt for a question
reviewsRouter.delete('/attempts/:id', (req, res) => {
  const question = undoAttempt(getDb(), Number(req.params.id));
  res.json({ question });
});
