import { Router } from 'express';
import { getDb } from '../db';
import { NotFoundError, ValidationError } from '../errors';
import {
  createRun,
  deleteRun,
  getRun,
  listRuns,
  updateRun,
  type RunFilter,
} from '../lab-runs.repo';

export const labRunsRouter = Router();

// GET /api/lab-runs?template_id=&objective_id=&status=
labRunsRouter.get('/', (req, res) => {
  const filter: RunFilter = {};
  const templateId = numParam(req.query.template_id);
  const objectiveId = numParam(req.query.objective_id);
  if (templateId !== undefined) {
    if (Number.isNaN(templateId)) throw new ValidationError('template_id must be a number');
    filter.templateId = templateId;
  }
  if (objectiveId !== undefined) {
    if (Number.isNaN(objectiveId)) throw new ValidationError('objective_id must be a number');
    filter.objectiveId = objectiveId;
  }
  if (typeof req.query.status === 'string' && req.query.status !== '') {
    filter.status = req.query.status;
  }
  res.json(listRuns(getDb(), filter));
});

labRunsRouter.get('/:id', (req, res) => {
  const run = getRun(getDb(), Number(req.params.id));
  if (!run) throw new NotFoundError('lab run not found');
  res.json(run);
});

labRunsRouter.post('/', (req, res) => {
  res.status(201).json(createRun(getDb(), req.body ?? {}));
});

labRunsRouter.put('/:id', (req, res) => {
  res.json(updateRun(getDb(), Number(req.params.id), req.body ?? {}));
});

labRunsRouter.delete('/:id', (req, res) => {
  if (!deleteRun(getDb(), Number(req.params.id))) {
    throw new NotFoundError('lab run not found');
  }
  res.status(204).end();
});

function numParam(raw: unknown): number | undefined {
  return typeof raw === 'string' && raw !== '' ? Number(raw) : undefined;
}
