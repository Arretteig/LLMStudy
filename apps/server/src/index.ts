import express from 'express';
import { getDb } from './db';
import { objectivesRouter } from './routes/objectives';
import { seed } from './seed';

const PORT = Number(process.env.PORT ?? 3001);

const db = getDb();

// Make the app usable on first run: if the DB is empty, load the seed content.
const { n } = db.prepare('SELECT COUNT(*) AS n FROM objectives').get() as {
  n: number;
};
if (n === 0) {
  const total = seed(db);
  console.log(`[seed] empty database detected — seeded ${total} objectives`);
}

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/objectives', objectivesRouter);

app.listen(PORT, () => {
  console.log(`LLMStudy API listening on http://localhost:${PORT}`);
});
