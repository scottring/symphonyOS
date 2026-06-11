/**
 * Normalize a scheduled_for input for Postgres timestamptz storage.
 *
 * The Symphony app serializes local-midnight Date objects (e.g. 04:00Z when
 * the machine is in US Eastern). A bare date-only string ("2026-06-22")
 * passed straight to Postgres is interpreted as UTC midnight, which renders
 * as the PREVIOUS day in any US timezone — tasks land on the wrong date.
 *
 * Date-only strings become local midnight of the server's timezone (matching
 * the app's convention). Full ISO strings with a time component pass through
 * untouched.
 */
export function normalizeScheduledFor<T>(value: T): T | string {
  if (typeof value !== 'string' || value === '') return value
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return value
  const [, y, mo, d] = m
  return new Date(Number(y), Number(mo) - 1, Number(d)).toISOString()
}
