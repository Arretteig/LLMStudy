import { Router } from 'express';
import { getDb } from '../db';
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
  if (!objective) return res.status(404).json({ error: 'objective not found' });
  res.json(objective);
});

// POST /api/objectives
objectivesRouter.post('/', (req, res) => {
  try {
    const objective = createObjective(getDb(), req.body ?? {});
    res.status(201).json(objective);
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

// PUT /api/objectives/:id
objectivesRouter.put('/:id', (req, res) => {
  try {
    const objective = updateObjective(getDb(), Number(req.params.id), req.body ?? {});
    if (!objective) return res.status(404).json({ error: 'objective not found' });
    res.json(objective);
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
