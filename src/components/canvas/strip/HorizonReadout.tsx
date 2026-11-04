// src/components/canvas/strip/HorizonReadout.tsx
//
// What a typed sentence was read as (what, who, when, where) and where it
// will land, shown before it saves. TypedAdd's reading, shared with the
// sheets' write line.

import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import type { HorizonLanding } from '@/lib/planning/horizonInput'
import type { HorizonRead } from './useHorizonRead'
import './horizonStrip.css'

const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase()

export function HorizonReadout({ read, periodWord }: { read: HorizonRead; periodWord: string }) {
  const { members: familyMembers } = useFamilyMembers()
  const names = (ids: string[]) => ids.map((id) => familyMembers.find((m) => m.id === id)?.name.split(/\s+/)[0]).filter(Boolean).join(', ')
  const where = (l: HorizonLanding) => l.kind === 'period'
    ? `Goes on ${periodWord}${periodWord === 'this week' ? ', no day yet' : ''}`
    : l.inPeriod ? `Goes on ${day(l.date)}`
      : `Goes on ${day(l.date)}. That’s outside ${periodWord}, so it waits on that day.`
  return (
    <div className="ta-read" aria-live="polite">
      <dl className="ta-facts">
        <div><dt>What</dt><dd>{read.parse.title}</dd></div>
        {read.parse.people.length > 0 && <div><dt>Who</dt><dd>{names(read.parse.people)}</dd></div>}
        {read.parse.date && <div><dt>When</dt><dd>{day(read.parse.date)}{read.parse.hasTime ? ` · ${time(read.parse.date)}` : ''}</dd></div>}
        {read.parse.location && <div><dt>Where</dt><dd>{read.parse.location}</dd></div>}
      </dl>
      <p className={`ta-where${read.landing.kind === 'day' && !read.landing.inPeriod ? ' is-away' : ''}`}>{where(read.landing)}</p>
    </div>
  )
}
