// CLI entry: `npm run db:reset`. Deletes the SQLite file and re-seeds from scratch.
import { rmSync } from 'node:fs';
import { openDb, resolveDbPath } from '../db';
import { seed } from '../seed';

const dbPath = resolveDbPath();
for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(dbPath + suffix);
  } catch {
    // file may not exist yet — fine
  }
}

const db = openDb();
const result = seed(db);
console.log(
  `Database reset. Objectives: ${result.objectives}, questions: ${result.questions}, lab templates: ${result.labTemplates}.`,
);
