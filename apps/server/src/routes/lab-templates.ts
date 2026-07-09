import { Router } from 'express';
import { getDb } from '../db';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from '../lab-templates.repo';

export const labTemplatesRouter = Router();

// GET /api/lab-templates            -> all templates
// GET /api/lab-templates?objective_id=3
labTemplatesRouter.get('/', (req, res) => {
  const raw = req.query.objective_id;
  const objectiveId = typeof raw === 'string' && raw !== '' ? Number(raw) : undefined;
  if (objectiveId !== undefined && Number.isNaN(objectiveId)) {
    return res.status(400).json({ error: 'objective_id must be a number' });
  }
  res.json(listTemplates(getDb(), objectiveId));
});

labTemplatesRouter.get('/:id', (req, res) => {
  const template = getTemplate(getDb(), Number(req.params.id));
  if (!template) return res.status(404).json({ error: 'lab template not found' });
  res.json(template);
});

labTemplatesRouter.post('/', (req, res) => {
  try {
    res.status(201).json(createTemplate(getDb(), req.body ?? {}));
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

labTemplatesRouter.put('/:id', (req, res) => {
  try {
    const template = updateTemplate(getDb(), Number(req.params.id), req.body ?? {});
    if (!template) return res.status(404).json({ error: 'lab template not found' });
    res.json(template);
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

labTemplatesRouter.delete('/:id', (req, res) => {
  if (!deleteTemplate(getDb(), Number(req.params.id))) {
    return res.status(404).json({ error: 'lab template not found' });
  }
  res.status(204).end();
});

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
