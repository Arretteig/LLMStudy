import { Router } from 'express';
import { getDb } from '../db';
import {
  createQuestion,
  deleteQuestion,
  getQuestion,
  listQuestions,
  updateQuestion,
} from '../questions.repo';

export const questionsRouter = Router();

// GET /api/questions              -> all questions (with objective_title)
// GET /api/questions?objective_id=3
questionsRouter.get('/', (req, res) => {
  const raw = req.query.objective_id;
  const objectiveId = typeof raw === 'string' && raw !== '' ? Number(raw) : undefined;
  if (objectiveId !== undefined && Number.isNaN(objectiveId)) {
    return res.status(400).json({ error: 'objective_id must be a number' });
  }
  res.json(listQuestions(getDb(), objectiveId));
});

// GET /api/questions/:id
questionsRouter.get('/:id', (req, res) => {
  const question = getQuestion(getDb(), Number(req.params.id));
  if (!question) return res.status(404).json({ error: 'question not found' });
  res.json(question);
});

// POST /api/questions
questionsRouter.post('/', (req, res) => {
  try {
    const question = createQuestion(getDb(), req.body ?? {});
    res.status(201).json(question);
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

// PUT /api/questions/:id
questionsRouter.put('/:id', (req, res) => {
  try {
    const question = updateQuestion(getDb(), Number(req.params.id), req.body ?? {});
    if (!question) return res.status(404).json({ error: 'question not found' });
    res.json(question);
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

// DELETE /api/questions/:id
questionsRouter.delete('/:id', (req, res) => {
  const deleted = deleteQuestion(getDb(), Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'question not found' });
  res.status(204).end();
});

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
