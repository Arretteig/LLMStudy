import { Router } from 'express';
import { getDb } from '../db';
import { NotFoundError, ValidationError } from '../errors';
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
    throw new ValidationError('objective_id must be a number');
  }
  res.json(listTemplates(getDb(), objectiveId));
});

labTemplatesRouter.get('/:id', (req, res) => {
  const template = getTemplate(getDb(), Number(req.params.id));
  if (!template) throw new NotFoundError('lab template not found');
  res.json(template);
});

labTemplatesRouter.post('/', (req, res) => {
  res.status(201).json(createTemplate(getDb(), req.body ?? {}));
});

labTemplatesRouter.put('/:id', (req, res) => {
  res.json(updateTemplate(getDb(), Number(req.params.id), req.body ?? {}));
});

labTemplatesRouter.delete('/:id', (req, res) => {
  if (!deleteTemplate(getDb(), Number(req.params.id))) {
    throw new NotFoundError('lab template not found');
  }
  res.status(204).end();
});
