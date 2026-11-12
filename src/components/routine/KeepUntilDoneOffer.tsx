import { useState } from 'react'
import type { Routine } from '@/types/routine'
import { keepCandidates, keepMessage, offerKey } from '@/lib/routines/keepCandidates'

const SEEN = 'symphony-keep-offer-seen'
const readSeen = () => { try { return localStorage.getItem(SEEN) } catch { return null } }
const writeSeen = (key: string) => { try { localStorage.setItem(SEEN, key) } catch { /* private window */ } }

/**
 * One quiet line on Routines (Scott, 2026-11-12): the routines that come
 * round rarely enough to slip, and an offer to have Symphony pick the ones
 * that matter — it answers with one change card. Asked or put off, the line
 * goes until a new rare routine appears.
 */
export function KeepUntilDoneOffer({ routines, onAsk }: { routines: readonly Routine[]; onAsk: (message: string) => void }) {
  const candidates = keepCandidates(routines)
  const key = offerKey(candidates)
  const [seen, setSeen] = useState(readSeen)
  if (candidates.length === 0 || seen === key) return null
  const settle = () => { writeSeen(key); setSeen(key) }
  const n = candidates.length
  return (
    <section className="rp-keep-offer" aria-label="Routines that mustn't slip">
      <p>
        {n === 1 ? `“${candidates[0].name}” comes round` : `${n} routines come round`} monthly or less often.
        {' '}Symphony can pick the ones that mustn’t slip, and keep them on Today until they’re done.
      </p>
      <div className="rp-keep-offer-actions">
        <button type="button" className="canvas-walk" onClick={() => { settle(); onAsk(keepMessage(candidates)) }}>Ask Symphony</button>
        <button type="button" className="rp-keep-offer-later" onClick={settle}>Not now</button>
      </div>
    </section>
  )
}
