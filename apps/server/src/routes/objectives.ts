import { Router } from 'express';
import { getDb } from '../db';
import { NotFoundError } from '../errors';
import {
  createObjective,
  getObjective,
  listObjectives,
  updateObjective,
} from '../objectives.repo';

export const objectivesRouter = Router();

// GET /api/objectives           -> all objectives
// GET /api/objectives?cert_path=NCA-GENL
objectivesRouter.get('/', (req, res) => {
  const certPath =
    typeof req.query.cert_path === 'string' ? req.query.cert_path : undefined;
  res.json(listObjectives(getDb(), certPath));
});

// GET /api/objectives/:id
objectivesRouter.get('/:id', (req, res) => {
  const objective = getObjective(getDb(), Number(req.params.id));
  if (!objective) throw new NotFoundError('objective not found');
  res.json(objective);
});

// POST /api/objectives
objectivesRouter.post('/', (req, res) => {
  res.status(201).json(createObjective(getDb(), req.body ?? {}));
});

// PUT /api/objectives/:id
objectivesRouter.put('/:id', (req, res) => {
  res.json(updateObjective(getDb(), Number(req.params.id), req.body ?? {}));
});
