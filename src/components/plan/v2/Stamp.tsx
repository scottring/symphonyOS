// src/components/plan/v2/Stamp.tsx
//
// The seal a planning card wears once it is decided: an official-looking ink
// stamp with its words around the rim (Scott, 2026-09-28: "like the back side
// of an Apple Watch"). Done is the big, happy one; carried, someday and dropped
// each have their own ink so a stack of cards reads at a glance.

import { useId, type ReactElement } from 'react'

export type StampKind = 'done' | 'carried' | 'someday' | 'dropped'

const WORD: Record<StampKind, string> = { done: 'DONE', carried: 'CARRIED', someday: 'SOMEDAY', dropped: 'DROPPED' }
const ICON: Record<StampKind, ReactElement> = {
  done: <path d="M58 82l15 15 30-34" strokeWidth={8} />,
  carried: <path d="M54 80h46M86 64l16 16-16 16" strokeWidth={7} />,
  someday: <path d="M92 60a24 24 0 1 0 8 36 19 19 0 1 1-8-36z" strokeWidth={5} />,
  dropped: <path d="M60 60l40 40M100 60l-40 40" strokeWidth={7} />,
}

export function Stamp({ kind, context, on, fresh }: { kind: StampKind; context: string; on?: Date | null; fresh?: boolean }) {
  const id = useId().replace(/:/g, '')
  const word = WORD[kind]
  const rim = `${word} · ${context} · SYMPHONY · ${word} · ${context} · `.toUpperCase()
  const date = (on ?? new Date()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
  return (
    <svg className={`pv2-stamp pv2-stamp-${kind}${fresh ? ' is-fresh' : ''}`} viewBox="0 0 160 160" role="img" aria-label={`${word.toLowerCase()} — ${context}`}>
      <defs>
        <path id={`rim${id}`} d="M80,80 m-61,0 a61,61 0 1,1 122,0 a61,61 0 1,1 -122,0" />
        <filter id={`ink${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves={2} seed={3} result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale={2.4} />
        </filter>
      </defs>
      <g filter={`url(#ink${id})`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="80" cy="80" r="75" strokeWidth={3.2} />
        <circle cx="80" cy="80" r="70.5" strokeWidth={1} />
        <circle cx="80" cy="80" r="50" strokeWidth={1.6} />
        <circle cx="80" cy="80" r="46" strokeWidth={1} strokeDasharray="1.5 3.5" />
        {ICON[kind]}
      </g>
      <g filter={`url(#ink${id})`} fill="currentColor">
        <text fontFamily="Jost, 'DM Sans', sans-serif" fontWeight={500} fontSize={10.5} letterSpacing={1.5}>
          <textPath href={`#rim${id}`} textLength={376} lengthAdjust="spacing">{rim}</textPath>
        </text>
        <text x="80" y="118" textAnchor="middle" fontFamily="Jost, sans-serif" fontWeight={500} fontSize={9} letterSpacing={2}>{date}</text>
      </g>
    </svg>
  )
}
