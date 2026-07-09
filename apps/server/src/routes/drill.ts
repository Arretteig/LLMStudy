import { Router } from 'express';
import { getDb } from '../db';
import {
  answerDrill,
  DRILL_DEFAULT_LIMIT,
  type DrillFilter,
  listDrillQuestions,
} from '../drill.repo';
import { ValidationError } from '../errors';

export const drillRouter = Router();

// GET /api/drill                      -> next 10 MCQs to practice
// GET /api/drill?domain=Experimentation&limit=25
// GET /api/drill?objective_id=3       -> scoped (objective_id wins over domain)
drillRouter.get('/', (req, res) => {
  const filter: DrillFilter = {};
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

  const rawLimit = req.query.limit;
  const parsed = typeof rawLimit === 'string' && rawLimit !== '' ? Number(rawLimit) : NaN;
  const limit = Number.isNaN(parsed) ? DRILL_DEFAULT_LIMIT : parsed; // repo clamps 1..50

  res.json(listDrillQuestions(getDb(), filter, limit));
});

// POST /api/drill/answers -> grade { question_id, selected_choice_ids: number[] }
drillRouter.post('/answers', (req, res) => {
  const body = req.body ?? {};
  const questionId = Number(body.question_id);
  if (!Number.isInteger(questionId)) {
    throw new ValidationError('question_id is required');
  }
  const result = answerDrill(getDb(), {
    question_id: questionId,
    selected_choice_ids: body.selected_choice_ids,
  });
  res.status(201).json(result);
});
