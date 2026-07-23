//
// The Tend sweep's proposal vocabulary. Proposals are DATA — nothing applies
// until the user clicks Apply on a card (applyProposal.ts does the writes).

export interface TendMerge {
  kind: 'merge'
  id: string
  keepId: string
  dropIds: string[]
  why: string
}

export interface TendPutAside {
  kind: 'put_aside'
  id: string
  taskId: string
  why: string
}

export interface TendRegrade {
  kind: 'regrade'
  id: string
  taskId: string
  to: 'week' | 'month' | 'season' | 'someday'
  why: string
}

export interface TendPlace {
  kind: 'place'
  id: string
  taskIds: string[]
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  /** HH:MM 24h; absence means an all-day placement. */
  time?: string
  why: string
}

export type TendProposal = TendMerge | TendPutAside | TendRegrade | TendPlace
