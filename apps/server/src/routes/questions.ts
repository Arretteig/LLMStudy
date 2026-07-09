import { Router } from 'express';
import { getDb } from '../db';
import { NotFoundError, ValidationError } from '../errors';
import {
  createQuestion,
  deleteQuestion,
  getChoices,
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
    throw new ValidationError('objective_id must be a number');
  }
  res.json(listQuestions(getDb(), objectiveId));
});

// GET /api/questions/:id
questionsRouter.get('/:id', (req, res) => {
  const question = getQuestion(getDb(), Number(req.params.id));
  if (!question) throw new NotFoundError('question not found');
  res.json(question);
});

// GET /api/questions/:id/choices -> full choice set (is_correct + rationale),
// position order. This is the AUTHORING view — practice endpoints (drill/exam)
// serve choices without the answers.
questionsRouter.get('/:id/choices', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!getQuestion(db, id)) throw new NotFoundError('question not found');
  res.json(getChoices(db, id));
});

// POST /api/questions
questionsRouter.post('/', (req, res) => {
  res.status(201).json(createQuestion(getDb(), req.body ?? {}));
});

// PUT /api/questions/:id
questionsRouter.put('/:id', (req, res) => {
  res.json(updateQuestion(getDb(), Number(req.params.id), req.body ?? {}));
});

// DELETE /api/questions/:id
questionsRouter.delete('/:id', (req, res) => {
  if (!deleteQuestion(getDb(), Number(req.params.id))) {
    throw new NotFoundError('question not found');
  }
  res.status(204).end();
});
