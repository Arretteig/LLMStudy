import { Router } from 'express';
import { getDb } from '../db';
import { listDue, listHistory, recordAttempt } from '../reviews.repo';

export const reviewsRouter = Router();

// GET /api/reviews/due -> questions due today or overdue (new questions included)
reviewsRouter.get('/due', (_req, res) => {
  res.json(listDue(getDb()));
});

// GET /api/reviews/history/:questionId -> attempt history, newest first
reviewsRouter.get('/history/:questionId', (req, res) => {
  res.json(listHistory(getDb(), Number(req.params.questionId)));
});

// POST /api/reviews -> record an attempt { question_id, rating, user_answer? }
reviewsRouter.post('/', (req, res) => {
  const body = req.body ?? {};
  const questionId = Number(body.question_id);
  const rating = Number(body.rating);
  if (!Number.isInteger(questionId)) {
    return res.status(400).json({ error: 'question_id is required' });
  }
  try {
    const attempt = recordAttempt(getDb(), {
      question_id: questionId,
      rating,
      user_answer: typeof body.user_answer === 'string' ? body.user_answer : null,
    });
    res.status(201).json(attempt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message.includes('not found') ? 404 : 400).json({ error: message });
  }
});
