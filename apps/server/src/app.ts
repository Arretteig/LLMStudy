import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { ConflictError, NotFoundError, ValidationError } from './errors';
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

  // Unknown /api/* paths get a JSON 404 instead of Express's HTML default.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

  // Central error mapping. Handlers are synchronous (better-sqlite3), so a
  // thrown repo error lands here without any next(err) plumbing. Every error
  // response is `{ error: string }`; unexpected errors get a generic message
  // (the real one is logged, never leaked).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
    if (err instanceof SyntaxError && 'body' in err) {
      // express.json() rejecting a malformed request body
      return res.status(400).json({ error: 'invalid JSON body' });
    }
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
