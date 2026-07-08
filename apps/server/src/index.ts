import express from 'express';
import { getDb } from './db';
import { objectivesRouter } from './routes/objectives';
import { questionsRouter } from './routes/questions';
import { reviewsRouter } from './routes/reviews';
import { seed } from './seed';

const PORT = Number(process.env.PORT ?? 3001);

const db = getDb();

// Make the app usable on first run: seed a brand-new (no objectives) database.
// Existing databases are never auto-reseeded, so deleted content stays deleted;
// run `npm run seed` to pull in new starter content added in a later milestone.
const { n } = db.prepare('SELECT COUNT(*) AS n FROM objectives').get() as {
  n: number;
};
if (n === 0) {
  const result = seed(db);
  console.log(
    `[seed] new database — seeded ${result.objectives} objectives and ${result.questions} questions`,
  );
}

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/objectives', objectivesRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/reviews', reviewsRouter);

app.listen(PORT, () => {
  console.log(`LLMStudy API listening on http://localhost:${PORT}`);
});
