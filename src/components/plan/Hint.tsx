// src/components/plan/Hint.tsx
//
// A first-time hint: shown once, dismissed for good with "Got it" (guided
// planning, Phase 4). Never blocks anything it sits beside.

import { useState } from 'react'
import { readHintSeen, markHintSeen } from '@/lib/planning/hints'

export function Hint({ name, uid, children }: {
  /** The hint's key, e.g. 'month-goals' — part of the storage key. */
  name: string
  uid?: string | null
  children: React.ReactNode
}) {
  const [seen, setSeen] = useState(() => readHintSeen(name, uid ?? null))
  if (seen) return null
  return (
    <p role="note" className="rounded-md bg-sage-50 px-3 py-2 text-[12.5px] text-neutral-700">
      {children}{' '}
      <button
        type="button"
        aria-label="Got it"
        className="font-semibold text-primary-700 hover:underline"
        onClick={() => { markHintSeen(name, uid ?? null); setSeen(true) }}
      >
        Got it
      </button>
    </p>
  )
}
