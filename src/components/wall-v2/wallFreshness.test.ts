import { describe, it, expect } from 'vitest';
import { computeFreshness, STALE_AFTER_MIN, CRITICAL_AFTER_MIN } from './wallFreshness';

// All `now` values are local-time (no Z) because the quiet-hours window is
// evaluated in local time. 6pm is comfortably outside quiet hours; 2am is inside.
const evening = (min: number) => new Date(2026, 6, 29, 18, min, 0);
const overnight = (min: number) => new Date(2026, 6, 29, 2, min, 0);

describe('computeFreshness', () => {
  it('is fresh when the last refresh was moments ago', () => {
    const result = computeFreshness({
      lastRefresh: evening(0),
      error: null,
      now: evening(1),
    });

    expect(result.level).toBe('fresh');
    expect(result.minutesStale).toBe(1);
  });

  it('labels the time of the last successful refresh', () => {
    const result = computeFreshness({
      lastRefresh: new Date(2026, 6, 29, 17, 53, 0),
      error: null,
      now: evening(0),
    });

    expect(result.label).toBe('Updated 5:53 PM');
  });

  it('is fresh on cold boot, before any refresh has landed', () => {
    const result = computeFreshness({
      lastRefresh: null,
      error: null,
      now: evening(0),
    });

    expect(result.level).toBe('fresh');
    expect(result.label).toBe('Updating…');
  });

  it('goes stale once the data passes the stale threshold', () => {
    const result = computeFreshness({
      lastRefresh: evening(0),
      error: null,
      now: evening(STALE_AFTER_MIN),
    });

    expect(result.level).toBe('stale');
  });

  it('stays fresh one minute before the stale threshold', () => {
    const result = computeFreshness({
      lastRefresh: evening(0),
      error: null,
      now: evening(STALE_AFTER_MIN - 1),
    });

    expect(result.level).toBe('fresh');
  });

  it('goes critical once the data passes the critical threshold', () => {
    const result = computeFreshness({
      lastRefresh: evening(0),
      error: null,
      now: evening(CRITICAL_AFTER_MIN),
    });

    expect(result.level).toBe('critical');
  });

  it('goes stale immediately on a fetch error, even with recent data', () => {
    const result = computeFreshness({
      lastRefresh: evening(0),
      error: 'TypeError: Failed to fetch',
      now: evening(1),
    });

    expect(result.level).toBe('stale');
  });

  it('escalates a sustained fetch error to critical before the hour is up', () => {
    const result = computeFreshness({
      lastRefresh: evening(0),
      error: 'TypeError: Failed to fetch',
      now: evening(STALE_AFTER_MIN),
    });

    expect(result.level).toBe('critical');
  });

  // Polling is deliberately suspended 23:00-06:00, so age alone must not raise an
  // alarm overnight — otherwise the wall would report ~7 hours stale every 6am.
  it('suppresses age-based escalation during quiet hours', () => {
    const result = computeFreshness({
      lastRefresh: new Date(2026, 6, 28, 22, 30, 0),
      error: null,
      now: overnight(0),
    });

    expect(result.level).toBe('fresh');
  });

  it('still reports a real fetch error during quiet hours', () => {
    const result = computeFreshness({
      lastRefresh: new Date(2026, 6, 28, 22, 30, 0),
      error: 'TypeError: Failed to fetch',
      now: overnight(0),
    });

    expect(result.level).toBe('stale');
  });

  it('still labels the real refresh time during quiet hours', () => {
    const result = computeFreshness({
      lastRefresh: new Date(2026, 6, 28, 22, 30, 0),
      error: null,
      now: overnight(0),
    });

    expect(result.label).toBe('Updated 10:30 PM');
    expect(result.minutesStale).toBe(210);
  });
});
