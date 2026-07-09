// Small input validators shared by the repos. Each throws ValidationError
// (HTTP 400 via the error middleware) so repos never hand malformed values to
// SQLite — TEXT columns are dynamically typed, so bad dates would otherwise be
// stored silently and corrupt lexical date comparisons.
import { ValidationError } from './errors';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;

/**
 * Required text column (create paths, and update paths when the key is sent):
 * must be a non-empty, non-whitespace string.
 */
export function assertNonBlankText(value: unknown, column: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${column} is required`);
  }
}

/** Client-writable date column: null clears it, otherwise must be 'YYYY-MM-DD'. */
export function assertIsoDate(value: unknown, column: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new ValidationError(`${column} must be 'YYYY-MM-DD' or null`);
  }
}

/** Client-writable timestamp column: null, 'YYYY-MM-DD', or 'YYYY-MM-DD HH:MM:SS'. */
export function assertIsoDateTime(value: unknown, column: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value)) {
    throw new ValidationError(
      `${column} must be 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS' or null`,
    );
  }
}
