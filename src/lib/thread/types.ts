import type { TimelineItem } from '@/types/timeline'

/**
 * The thread has three bands and nothing below them.
 *
 * - `now`   — live in this moment: what changes if you don't act.
 * - `next`  — the shape of the rest of the day.
 * - `loose` — unanchored and decaying: inbox, carried over, missed.
 */
export type BandId = 'now' | 'next' | 'loose'

/**
 * A moment is a TimelineItem plus the composer's judgment about it.
 *
 * `reason` is the whole point of the mock. It states, in plain words, why the
 * composer put this here ("starts in 12 min", "phones close at 5", "carried
 * over from Thursday"). It is rendered on the card so a wrong composer is
 * visibly wrong rather than mysteriously wrong.
 */
export interface Moment {
  /** Stable across bands — the underlying TimelineItem id. */
  id: string
  item: TimelineItem
  band: BandId
  reason: string
  /** Sort key inside a band: ms epoch, or Number.MAX_SAFE_INTEGER when untimed. */
  sortAt: number
}

export interface ThreadComposition {
  now: Moment[]
  next: Moment[]
  loose: Moment[]
  /**
   * How many moments the Now cap pushed down into Next. Rendered, never
   * silent — a truncated band that looks complete is a lie about the day.
   */
  nowOverflow: number
}

export const EMPTY_COMPOSITION: ThreadComposition = {
  now: [],
  next: [],
  loose: [],
  nowOverflow: 0,
}
