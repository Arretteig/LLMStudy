import express, { type Express } from 'express';
import { dashboardRouter } from './routes/dashboard';
import { labRunsRouter } from './routes/lab-runs';
import { labTemplatesRouter } from './routes/lab-templates';
import { objectivesRouter } from './routes/objectives';
import { questionsRouter } from './routes/questions';
import { reviewsRouter } from './routes/reviews';

/** Build the Express app with all routes mounted. No DB or network side effects. */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/objectives', objectivesRouter);
  app.use('/api/questions', questionsRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/lab-templates', labTemplatesRouter);
  app.use('/api/lab-runs', labRunsRouter);
  app.use('/api/dashboard', dashboardRouter);

  return app;
}
