import { Router } from 'express';
import { getDb } from '../db';
import { createLab, deleteLab, getLab, listLabs, updateLab } from '../labs.repo';

export const labsRouter = Router();

// GET /api/labs
labsRouter.get('/', (_req, res) => {
  res.json(listLabs(getDb()));
});

// GET /api/labs/:id
labsRouter.get('/:id', (req, res) => {
  const lab = getLab(getDb(), Number(req.params.id));
  if (!lab) return res.status(404).json({ error: 'lab not found' });
  res.json(lab);
});

// POST /api/labs
labsRouter.post('/', (req, res) => {
  try {
    res.status(201).json(createLab(getDb(), req.body ?? {}));
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

// PUT /api/labs/:id
labsRouter.put('/:id', (req, res) => {
  try {
    const lab = updateLab(getDb(), Number(req.params.id), req.body ?? {});
    if (!lab) return res.status(404).json({ error: 'lab not found' });
    res.json(lab);
  } catch (err) {
    res.status(400).json({ error: messageOf(err) });
  }
});

// DELETE /api/labs/:id
labsRouter.delete('/:id', (req, res) => {
  if (!deleteLab(getDb(), Number(req.params.id))) {
    return res.status(404).json({ error: 'lab not found' });
  }
  res.status(204).end();
});

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
