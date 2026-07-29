// How the wall should treat the result of a data fetch.
//
// Extracted so the decision is testable without standing up mocks for the
// thirteen parallel queries in useWallData.

export interface FetchOutcomeInput {
  /** First error message across the parallel queries, or null when all succeeded. */
  dataError: string | null;
  /** True when the wall is already showing real data from an earlier fetch. */
  hasRenderedData: boolean;
}

export interface FetchOutcome {
  /** Write the newly fetched values into state. */
  commitData: boolean;
  /** Advance the last-successful-refresh clock. */
  advanceLastRefresh: boolean;
}

export function resolveFetchOutcome({
  dataError,
  hasRenderedData,
}: FetchOutcomeInput): FetchOutcome {
  if (!dataError) return { commitData: true, advanceLastRefresh: true };

  // A failed fetch must never advance the refresh clock, or age-based staleness
  // could never fire — the wall would claim to be freshly updated forever.
  //
  // Keep the last good render rather than blanking the wall (PostgREST returns
  // `{ data: null }` per failed query, which used to collapse to empty arrays).
  // On cold boot there is nothing to preserve, so commit whatever did arrive.
  return { commitData: !hasRenderedData, advanceLastRefresh: false };
}
