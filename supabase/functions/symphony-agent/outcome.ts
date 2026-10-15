// The turn's outcome, in one structured line (beta plan, 2026-10-14, §2):
// every conversational surface — the typed bar, the live voice, the wall —
// reads the SAME verdict about what this turn did, instead of inferring it
// from the model's prose. A fluent voice must never turn "proposed" into
// "done"; with this, it does not have to guess.
//
// States:
//   answered    nothing was written and nothing was proposed
//   proposed    a change card (or suggestions) is on the page, nothing saved
//   saved       every write this turn reported ok
//   partial     some writes saved, some did not
//   failed      every write failed (or the turn failed before any write)
//   unverified  the turn ended abnormally after a write MAY have committed

export type TurnOutcomeState = 'answered' | 'proposed' | 'saved' | 'partial' | 'failed' | 'unverified'

export interface TurnWrite { name: string; ok: boolean; ids?: string[]; error?: string }

export interface TurnOutcome {
  state: TurnOutcomeState
  /** Every write tool that ran this turn, in order, with the rows it touched. */
  writes: TurnWrite[]
  /** The change card now on the page, if this turn put one there. */
  proposal?: { key: string; title: string; ops: number }
  /** Suggestions shown dashed (Keep / Leave out), if any. */
  suggestions?: number
  /** Plain words every surface may repeat; they match the state exactly. */
  say: string
}

const SAY: Record<TurnOutcomeState, string> = {
  answered: 'Nothing was changed.',
  proposed: 'Shown as a change card. Nothing is saved until the person approves it.',
  saved: 'Saved.',
  partial: 'Some of it saved and some did not.',
  failed: 'Nothing saved.',
  unverified: 'The turn was cut short; whether it saved has not been confirmed.',
}

export function summarizeTurn(
  writes: readonly TurnWrite[],
  shown: { proposal?: { key: string; title: string; ops: number }; suggestions?: number },
  ended: 'ok' | 'error',
): TurnOutcome {
  const ok = writes.filter((w) => w.ok).length
  const bad = writes.length - ok
  let state: TurnOutcomeState
  if (ended === 'error') state = ok > 0 ? 'unverified' : 'failed'
  else if (writes.length === 0) state = shown.proposal || shown.suggestions ? 'proposed' : 'answered'
  else if (bad === 0) state = 'saved'
  else if (ok === 0) state = 'failed'
  else state = 'partial'
  const base: TurnOutcome = { state, writes: [...writes], say: SAY[state] }
  if (shown.proposal) base.proposal = shown.proposal
  if (shown.suggestions) base.suggestions = shown.suggestions
  // Saved AND a card still waiting: say both, so "saved" cannot be heard as
  // covering the card.
  if ((state === 'saved' || state === 'partial') && shown.proposal) base.say = `${SAY[state]} A change card is still waiting for approval; nothing on it is saved.`
  return base
}
