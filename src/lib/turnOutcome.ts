// src/lib/turnOutcome.ts
//
// What one agent turn did, as the server states it (mirror of
// supabase/functions/symphony-agent/outcome.ts). Every surface — the typed
// bar, the live voice, the wall — reads this one verdict instead of inferring
// "saved" from the reply's wording. A proposal is never a save.

export type TurnOutcomeState = 'answered' | 'proposed' | 'saved' | 'partial' | 'failed' | 'unverified'

export interface TurnWrite { name: string; ok: boolean; ids?: string[]; error?: string }

export interface TurnOutcome {
  state: TurnOutcomeState
  writes: TurnWrite[]
  proposal?: { key: string; title: string; ops: number }
  suggestions?: number
  /** Plain words that match the state; safe to repeat aloud. */
  say: string
}

const STATES = new Set<TurnOutcomeState>(['answered', 'proposed', 'saved', 'partial', 'failed', 'unverified'])

/** The outcome from a stream event, or undefined when the server sent none
 *  (older builds) or sent something malformed. */
export function parseTurnOutcome(raw: unknown): TurnOutcome | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.state !== 'string' || !STATES.has(o.state as TurnOutcomeState)) return undefined
  const writes = Array.isArray(o.writes)
    ? o.writes.flatMap((w) => (w && typeof w === 'object' && typeof (w as TurnWrite).name === 'string' && typeof (w as TurnWrite).ok === 'boolean')
      ? [{ name: (w as TurnWrite).name, ok: (w as TurnWrite).ok, ...(Array.isArray((w as TurnWrite).ids) ? { ids: (w as TurnWrite).ids!.filter((i): i is string => typeof i === 'string') } : {}), ...(typeof (w as TurnWrite).error === 'string' ? { error: (w as TurnWrite).error } : {}) }]
      : [])
    : []
  const out: TurnOutcome = { state: o.state as TurnOutcomeState, writes, say: typeof o.say === 'string' ? o.say : '' }
  const p = o.proposal as Record<string, unknown> | undefined
  if (p && typeof p === 'object' && typeof p.key === 'string') out.proposal = { key: p.key, title: typeof p.title === 'string' ? p.title : '', ops: typeof p.ops === 'number' ? p.ops : 0 }
  if (typeof o.suggestions === 'number') out.suggestions = o.suggestions
  return out
}

/** The outcome a surface reports when the stream itself failed and the server
 *  sent none: writes may have happened before the failure. */
export const UNKNOWN_OUTCOME: TurnOutcome = { state: 'unverified', writes: [], say: 'The request did not finish; whether anything saved has not been confirmed.' }
