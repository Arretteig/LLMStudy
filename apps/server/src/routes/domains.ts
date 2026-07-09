import { Router } from 'express';
import { getDb } from '../db';
import { listDomains } from '../domains.repo';

export const domainsRouter = Router();

// GET /api/domains -> official cert domains with exam weights, heaviest first
domainsRouter.get('/', (_req, res) => {
  res.json(listDomains(getDb()));
});
