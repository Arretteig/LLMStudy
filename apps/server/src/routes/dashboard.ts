import { Router } from 'express';
import { getDb } from '../db';
import { getDashboard } from '../dashboard.repo';

export const dashboardRouter = Router();

// GET /api/dashboard -> aggregated progress + weak-areas summary
dashboardRouter.get('/', (_req, res) => {
  res.json(getDashboard(getDb()));
});
