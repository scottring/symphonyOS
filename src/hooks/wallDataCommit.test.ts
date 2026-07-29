import { describe, it, expect } from 'vitest';
import { resolveFetchOutcome } from './wallDataCommit';

describe('resolveFetchOutcome', () => {
  it('commits everything when the fetch fully succeeded', () => {
    expect(resolveFetchOutcome({ dataError: null, hasRenderedData: true })).toEqual({
      commitData: true,
      advanceLastRefresh: true,
    });
  });

  // The 2026-07-29 incident: a failed fetch blanked the wall, so a "showing older
  // information" warning would have sat above empty sections.
  it('keeps the last good render when a fetch fails and the wall already has data', () => {
    expect(
      resolveFetchOutcome({ dataError: 'TypeError: Failed to fetch', hasRenderedData: true }),
    ).toEqual({ commitData: false, advanceLastRefresh: false });
  });

  it('still commits partial data on cold boot, so a failure is not a permanently empty wall', () => {
    expect(
      resolveFetchOutcome({ dataError: 'TypeError: Failed to fetch', hasRenderedData: false }),
    ).toEqual({ commitData: true, advanceLastRefresh: false });
  });

  // lastRefresh drives age-based staleness. If a failed fetch advanced it, the wall
  // would report itself freshly updated forever while never actually updating.
  it('never advances the last-refresh clock on a failed fetch', () => {
    for (const hasRenderedData of [true, false]) {
      expect(
        resolveFetchOutcome({ dataError: 'boom', hasRenderedData }).advanceLastRefresh,
      ).toBe(false);
    }
  });
});
