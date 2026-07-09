// Single-user app settings, stored as key-value TEXT rows in app_settings.
// Unset keys fall back to defaults, so GET always returns a full AppSettings.
import type { AppSettings, AppSettingsUpdate } from '@llmstudy/shared';
import type { Db } from './db';
import { ValidationError } from './errors';
import { assertIsoDate } from './validate';

/**
 * Default new-question budget per day. Lives here (it is the default for the
 * `new_cards_per_day` setting) and is re-exported by reviews.repo for callers
 * that predate settings.
 */
export const NEW_CARDS_PER_DAY = 15;

const UPSERT = `
  INSERT INTO app_settings (key, value, updated_at)
  VALUES (@key, @value, datetime('now'))
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`;

/** All settings with defaults applied (exam_date null, new_cards_per_day 15). */
export function getSettings(db: Db): AppSettings {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as {
    key: string;
    value: string;
  }[];
  const stored = new Map(rows.map((r) => [r.key, r.value]));

  const rawCards = stored.get('new_cards_per_day');
  const cards = rawCards === undefined ? NaN : Number(rawCards);

  return {
    exam_date: stored.get('exam_date') ?? null,
    new_cards_per_day: Number.isInteger(cards) ? cards : NEW_CARDS_PER_DAY,
  };
}

/**
 * Apply a partial update. `exam_date: null` clears the setting (row deleted);
 * unknown keys are ignored. Returns the full settings after the update.
 */
export function updateSettings(db: Db, patch: AppSettingsUpdate): AppSettings {
  assertIsoDate(patch.exam_date, 'exam_date'); // undefined/null pass, else 'YYYY-MM-DD'
  if (patch.new_cards_per_day !== undefined) {
    const n = patch.new_cards_per_day;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100) {
      throw new ValidationError('new_cards_per_day must be an integer between 0 and 100');
    }
  }

  db.transaction(() => {
    if (patch.exam_date !== undefined) {
      if (patch.exam_date === null) {
        db.prepare("DELETE FROM app_settings WHERE key = 'exam_date'").run();
      } else {
        db.prepare(UPSERT).run({ key: 'exam_date', value: patch.exam_date });
      }
    }
    if (patch.new_cards_per_day !== undefined) {
      db.prepare(UPSERT).run({
        key: 'new_cards_per_day',
        value: String(patch.new_cards_per_day),
      });
    }
  })();

  return getSettings(db);
}
