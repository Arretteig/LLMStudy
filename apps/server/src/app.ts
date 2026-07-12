import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { dashboardRouter } from './routes/dashboard';
import { domainsRouter } from './routes/domains';
import { drillRouter } from './routes/drill';
import { examsRouter } from './routes/exams';
import { labRunsRouter } from './routes/lab-runs';
import { labTemplatesRouter } from './routes/lab-templates';
import { objectivesRouter } from './routes/objectives';
import { questionsRouter } from './routes/questions';
import { reviewsRouter } from './routes/reviews';
import { settingsRouter } from './routes/settings';

/** Build the Express app with all routes mounted. No DB or network side effects. */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/objectives', objectivesRouter);
  app.use('/api/questions', questionsRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/drill', drillRouter);
  app.use('/api/exams', examsRouter);
  app.use('/api/lab-templates', labTemplatesRouter);
  app.use('/api/lab-runs', labRunsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/domains', domainsRouter);
  app.use('/api/settings', settingsRouter);

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
    // Backstop: any SQLite constraint violation a repo didn't translate is a
    // client-data conflict, not a server fault — never let it become a 500.
    // (Generic message on purpose: raw SQLite errors leak schema details.)
    const code = (err as { code?: string } | null)?.code;
    if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
      const unique = code === 'SQLITE_CONSTRAINT_UNIQUE';
      return res
        .status(unique ? 409 : 400)
        .json({ error: unique ? 'already exists' : 'constraint violation' });
    }
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
