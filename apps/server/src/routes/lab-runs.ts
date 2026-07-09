import { Router } from 'express';
import { getDb } from '../db';
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
    if (Number.isNaN(templateId)) return res.status(400).json({ error: 'template_id must be a number' });
    filter.templateId = templateId;
  }
  if (objectiveId !== undefined) {
    if (Number.isNaN(objectiveId)) return res.status(400).json({ error: 'objective_id must be a number' });
    filter.objectiveId = objectiveId;
  }
  if (typeof req.query.status === 'string' && req.query.status !== '') {
    filter.status = req.query.status;
  }
  res.json(listRuns(getDb(), filter));
});

labRunsRouter.get('/:id', (req, res) => {
  const run = getRun(getDb(), Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'lab run not found' });
  res.json(run);
});

labRunsRouter.post('/', (req, res) => {
  try {
    res.status(201).json(createRun(getDb(), req.body ?? {}));
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

labRunsRouter.put('/:id', (req, res) => {
  try {
    const run = updateRun(getDb(), Number(req.params.id), req.body ?? {});
    if (!run) return res.status(404).json({ error: 'lab run not found' });
    res.json(run);
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

labRunsRouter.delete('/:id', (req, res) => {
  if (!deleteRun(getDb(), Number(req.params.id))) {
    return res.status(404).json({ error: 'lab run not found' });
  }
  res.status(204).end();
});

function numParam(raw: unknown): number | undefined {
  return typeof raw === 'string' && raw !== '' ? Number(raw) : undefined;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
