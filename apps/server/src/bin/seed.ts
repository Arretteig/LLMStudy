// CLI entry: `npm run seed`. Loads starter objectives + questions (idempotent).
import { seed } from '../seed';

const result = seed();
console.log(
  `Seed complete. Objectives: ${result.objectives}, questions: ${result.questions}, labs: ${result.labs}.`,
);
