// CLI entry: `npm run seed`. Loads starter objectives (idempotent).
import { seed } from '../seed';

const total = seed();
console.log(`Seed complete. Objectives in database: ${total}`);
