import { useState } from 'react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { Sparkles } from 'lucide-react'
import type { RhythmCard } from './rhythmModel'
import { formatRange, formatClock } from './format'

export interface DailyArcProps {
  cards: RhythmCard[]
  anytime: Routine[]
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean
  nowMinutes: number
  onOpenCollection: (id: string) => void
  onOpenRoutine: (r: Routine) => void
  onNameCluster: (card: RhythmCard, name: string) => void
}

const ARC_START = 6 * 60   // 6:00
const ARC_END = 21.5 * 60  // 21:30

function pct(minutes: number): number {
  const clamped = Math.min(Math.max(minutes, ARC_START), ARC_END)
  return ((clamped - ARC_START) / (ARC_END - ARC_START)) * 100
}

const RULER_MARKS: { label: string; minutes: number }[] = [
  { label: '6 am', minutes: 6 * 60 },
  { label: '9 am', minutes: 9 * 60 },
  { label: 'noon', minutes: 12 * 60 },
  { label: '4 pm', minutes: 16 * 60 },
  { label: '7 pm', minutes: 19 * 60 },
  { label: '9 pm', minutes: 21 * 60 },
]

function NameNudge({ card, onNameCluster }: { card: RhythmCard; onNameCluster: DailyArcProps['onNameCluster'] }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(card.suggestedName ?? '')
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 w-full text-left flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5
                   text-xs text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        These travel together — name this rhythm?
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={name}
      onChange={e => setName(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && name.trim()) onNameCluster(card, name.trim())
        if (e.key === 'Escape') setEditing(false)
      }}
      className="mt-2 w-full rounded-lg border border-amber-300 px-2.5 py-1.5 text-sm focus:outline-none
                 focus:ring-2 focus:ring-amber-400"
      placeholder="Name this rhythm"
    />
  )
}

export function DailyArc({ cards, anytime, familyMembers, matches, nowMinutes, onOpenCollection, onOpenRoutine, onNameCluster }: DailyArcProps) {
  if (cards.length === 0 && anytime.length === 0) return null

  const membersOf = (r: Routine): FamilyMember[] => {
    const ids = r.assigned_to_all?.length ? r.assigned_to_all : r.assigned_to ? [r.assigned_to] : []
    return ids.map(id => familyMembers.find(m => m.id === id)).filter((m): m is FamilyMember => !!m)
  }

  const cardMatches = (c: RhythmCard) =>
    c.routines.some(matches) || (c.name != null && matches({ name: c.name } as Routine))

  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Every day</h2>

      {/* Time ruler */}
      <div className="relative h-8 rounded-full border border-[var(--color-border,#eadfcc)] mb-4
                      bg-gradient-to-r from-amber-100 via-emerald-50 to-stone-300/60">
        {RULER_MARKS.map(m => (
          <span key={m.label} className="absolute top-1.5 text-[11px] text-neutral-500 -translate-x-1/2"
                style={{ left: `${pct(m.minutes)}%` }}>
            {m.label}
          </span>
        ))}
        <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-orange-600" style={{ left: `${pct(nowMinutes)}%` }} />
        <span className="absolute -top-5 text-[10px] font-bold text-orange-600 -translate-x-1/2"
              style={{ left: `${pct(nowMinutes)}%` }}>
          NOW
        </span>
      </div>

      {/* Rhythm cards */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-start">
        {cards.map(card => (
          <div
            key={card.id}
            data-testid={`arc-card-${card.id}`}
            className={`flex-1 min-w-0 rounded-2xl border bg-white p-4 transition-all
                        ${card.kind === 'cluster' ? 'border-dashed border-amber-300' : 'border-neutral-100 shadow-sm'}
                        ${cardMatches(card) ? '' : 'opacity-30'}`}
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              {card.kind === 'collection' ? (
                <button
                  onClick={() => onOpenCollection(card.id)}
                  className="font-display font-semibold text-neutral-800 hover:text-amber-700 transition-colors truncate"
                >
                  {card.name}
                </button>
              ) : (
                <span className="font-display font-semibold text-neutral-600 truncate">
                  {card.name ?? 'Unnamed cluster'}
                </span>
              )}
              <span className="text-[11px] text-neutral-400 flex-shrink-0">{formatRange(card.startTime, card.endTime)}</span>
            </div>

            <ul className="flex flex-col gap-1">
              {card.routines.map(r => (
                <li key={r.id}>
                  <button
                    onClick={() => onOpenRoutine(r)}
                    className={`w-full flex items-center justify-between gap-2 text-left text-sm rounded-lg px-2 py-1
                                hover:bg-neutral-50 transition-colors ${matches(r) ? 'text-neutral-700' : 'opacity-30'}`}
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {r.time_of_day && card.kind !== 'single' && (
                        <span className="text-[10px] text-neutral-400">{formatClock(r.time_of_day)}</span>
                      )}
                      <span className="flex -space-x-1.5">
                        {membersOf(r).map(m => (
                          <AssigneeAvatar key={m.id} member={m} size="sm" className="ring-1 ring-white" />
                        ))}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {card.suggestedName && <NameNudge card={card} onNameCluster={onNameCluster} />}
          </div>
        ))}
      </div>

      {/* Anytime row */}
      {anytime.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <span className="text-xs italic text-neutral-400">anytime today —</span>
          {anytime.map(r => (
            <button
              key={r.id}
              onClick={() => onOpenRoutine(r)}
              className={`rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600
                          hover:border-amber-300 transition-colors ${matches(r) ? '' : 'opacity-30'}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
