import { Fragment, useState } from 'react'
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


  const renderCard = (card: RhythmCard) => (
    <div
      data-testid={`arc-card-${card.id}`}
      className={`min-w-0 rounded-2xl border bg-white p-4 transition-all
                  ${card.kind === 'cluster' ? 'border-dashed border-amber-300' : 'border-neutral-100 shadow-sm'}
                  ${cardMatches(card) ? '' : 'opacity-30'}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        {card.kind === 'collection' ? (
          <button
            onClick={() => onOpenCollection(card.id)}
            className="font-display font-semibold text-neutral-800 hover:text-amber-700 transition-colors text-left min-w-0 break-words"
          >
            {card.name}
          </button>
        ) : (
          <span className="font-display font-semibold text-neutral-600 min-w-0 break-words">
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
              <span className="flex-1 min-w-0 break-words">{r.name}</span>
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
  )

  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Every day</h2>

      {/* Center timeline with staggered cards: the thick dawn→dusk ruler runs
          through the middle; cards alternate above/below and each card starts
          at the horizontal midpoint of the one before it (2-col spans on an
          N+1 column grid), anchored to the ruler by a stem + dot. */}
      {cards.length > 0 && (
        <div className="overflow-x-auto pt-6 pb-2">
          <div
            className="grid gap-x-3 grid-rows-[auto_4rem_auto]"
            style={{ gridTemplateColumns: `repeat(${cards.length + 1}, 165px)` }}
          >
            {/* The day ruler, spanning all columns */}
            <div className="col-span-full row-start-2 self-center relative h-8 rounded-full border border-[var(--color-border,#eadfcc)]
                            bg-gradient-to-r from-amber-100 via-emerald-50 to-stone-300/60">
              {RULER_MARKS.map(m => (
                <span key={m.label} className="absolute top-1.5 text-[11px] text-neutral-500 -translate-x-1/2"
                      style={{ left: `${pct(m.minutes)}%` }}>
                  {m.label}
                </span>
              ))}
              <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-orange-600" style={{ left: `${pct(nowMinutes)}%` }} />
              <span className="absolute -top-6 text-[10px] font-bold text-orange-600 -translate-x-1/2"
                    style={{ left: `${pct(nowMinutes)}%` }}>
                NOW
              </span>
            </div>

            {cards.map((card, i) => {
              const above = i % 2 === 0
              return (
                <Fragment key={card.id}>
                  {/* Card cell — spans 2 columns starting at column i+1, so each
                      card's left edge sits at the midpoint of the previous one */}
                  <div
                    className={above ? 'self-end row-start-1 min-w-0' : 'self-start row-start-3 min-w-0'}
                    style={{ gridColumn: `${i + 1} / span 2` }}
                  >
                    {renderCard(card)}
                  </div>
                  {/* Stem + dot anchoring the card to the ruler */}
                  <div
                    className={`row-start-2 justify-self-center z-10 flex flex-col items-center pointer-events-none
                                ${above ? 'self-start' : 'self-end'}`}
                    style={{ gridColumn: `${i + 1} / span 2` }}
                  >
                    {above ? (
                      <>
                        <span className="w-px h-4 bg-amber-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
                      </>
                    ) : (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
                        <span className="w-px h-4 bg-amber-400" />
                      </>
                    )}
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>
      )}

      {/* Anytime row */}
      {anytime.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-4">
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
