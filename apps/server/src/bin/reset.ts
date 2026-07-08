// CLI entry: `npm run db:reset`. Deletes the SQLite file and re-seeds from scratch.
import { rmSync } from 'node:fs';
import { DB_PATH, openDb } from '../db';
import { seed } from '../seed';

for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(DB_PATH + suffix);
  } catch {
    // file may not exist yet — fine
  }
}

const db = openDb();
const result = seed(db);
console.log(
  `Database reset. Objectives: ${result.objectives}, questions: ${result.questions}.`,
);
