import { Router } from 'express';
import { getDb } from '../db';
import { getSettings, updateSettings } from '../settings.repo';

export const settingsRouter = Router();

// GET /api/settings -> full settings with defaults applied
settingsRouter.get('/', (_req, res) => {
  res.json(getSettings(getDb()));
});

// PUT /api/settings -> partial body { exam_date?, new_cards_per_day? } -> full settings
settingsRouter.put('/', (req, res) => {
  res.json(updateSettings(getDb(), req.body ?? {}));
});
