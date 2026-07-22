import { useState } from 'react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { GripVertical } from 'lucide-react'
import { minutesOf, resolveMembers, type RhythmCard } from './rhythmModel'
import { formatRange, formatClock } from './format'
import { ARC_START, ARC_END, setDragPayload, readDragPayload, acceptsDrag, timeFromAxisX, type DragPayload } from './dragTypes'
import { resolveDrop, type DropIntent } from './dropRules'
import { GroupNamePopover } from './GroupNamePopover'

export interface DailyArcProps {
  cards: RhythmCard[]
  anytime: Routine[]
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean
  nowMinutes: number
  onOpenCollection: (id: string) => void
  onOpenRoutine: (r: Routine) => void
  /** Drag-and-drop: when present, pills/headers become draggable and the
   *  axis + collection blocks become drop targets. */
  onDropIntent?: (intent: DropIntent) => void
  /** On-canvas group naming (popover under auto-group titles). */
  foldTargets?: { id: string; name: string }[]
  onNameGroup?: (card: RhythmCard, name: string) => void
  onFoldInto?: (targetId: string, ids: string[]) => void
}

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

/** Payload for a pill inside a card: collection steps travel as steps,
 *  cluster members and singles travel as loose routines. */
function pillPayload(card: RhythmCard, r: Routine): DragPayload {
  return card.kind === 'collection' ? { kind: 'step', id: r.id } : { kind: 'routine', id: r.id }
}

function headerPayload(card: RhythmCard): DragPayload {
  if (card.kind === 'collection') return { kind: 'collection', id: card.id }
  if (card.kind === 'cluster') return { kind: 'group', ids: card.routines.map(r => r.id) }
  return { kind: 'routine', id: card.routines[0].id }
}

function ArcCard({ card, familyMembers, matches, onOpenCollection, onOpenRoutine, onDropIntent, foldTargets, onNameGroup, onFoldInto }: {
  card: RhythmCard
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean
  onOpenCollection: (id: string) => void
  onOpenRoutine: (r: Routine) => void
  onDropIntent?: (intent: DropIntent) => void
  foldTargets?: { id: string; name: string }[]
  onNameGroup?: (card: RhythmCard, name: string) => void
  onFoldInto?: (targetId: string, ids: string[]) => void
}) {
  const [dropHover, setDropHover] = useState(false)
  const [naming, setNaming] = useState(false)
  const draggable = !!onDropIntent
  const canName = card.kind === 'cluster' && !!onNameGroup && !!onFoldInto

  const membersOf = (r: Routine): FamilyMember[] => resolveMembers(r, familyMembers)
  const cardMatches =
    card.routines.some(matches) || (card.name != null && matches({ name: card.name } as Routine))

  const isDropTarget = card.kind === 'collection' && !!onDropIntent
  const dropHandlers = isDropTarget ? {
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrag(e, ['step', 'routine', 'group'])) return
      e.preventDefault()
      setDropHover(true)
    },
    onDragLeave: () => setDropHover(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDropHover(false)
      const payload = readDragPayload(e)
      if (!payload) return
      const intent = resolveDrop(payload, { kind: 'collection-block', collectionId: card.id })
      if (intent) onDropIntent!(intent)
    },
  } : {}

  return (
    <div
      data-testid={`arc-card-${card.id}`}
      {...dropHandlers}
      className={`relative min-w-0 rounded-2xl border bg-white p-4 shadow-sm transition-all
                  ${dropHover ? 'border-amber-400 ring-2 ring-amber-300' : 'border-neutral-100'}
                  ${cardMatches ? '' : 'opacity-30'}`}
    >
      <div
        className="relative flex items-baseline justify-between gap-2 mb-2"
        draggable={draggable}
        onDragStart={draggable ? (e => setDragPayload(e, headerPayload(card))) : undefined}
        style={draggable ? { cursor: 'grab' } : undefined}
      >
        <span className="flex items-baseline gap-1 min-w-0">
          {draggable && <GripVertical className="w-3 h-3 self-center flex-shrink-0 text-neutral-300" />}
          {card.kind === 'collection' ? (
            <button
              onClick={() => onOpenCollection(card.id)}
              className="font-display font-semibold text-neutral-800 hover:text-amber-700 transition-colors text-left min-w-0 break-words"
            >
              {card.name}
            </button>
          ) : canName ? (
            <button
              onClick={() => setNaming(v => !v)}
              title="Name this rhythm"
              className="font-display font-semibold text-neutral-600 hover:text-amber-700 transition-colors text-left min-w-0 break-words"
            >
              {card.name ?? card.suggestedName ?? formatRange(card.startTime, card.endTime)}
            </button>
          ) : (
            <span className="font-display font-semibold text-neutral-600 min-w-0 break-words">
              {card.name ?? card.suggestedName ?? formatRange(card.startTime, card.endTime)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {card.routine && (
            <span className="flex -space-x-1.5">
              {membersOf(card.routine).map(m => (
                <AssigneeAvatar key={m.id} member={m} size="sm" className="ring-1 ring-white" />
              ))}
            </span>
          )}
          <span className="text-[11px] text-neutral-400">{formatRange(card.startTime, card.endTime)}</span>
        </span>
        {naming && canName && (
          <GroupNamePopover
            card={card}
            foldTargets={foldTargets ?? []}
            onName={onNameGroup!}
            onFoldInto={onFoldInto!}
            onClose={() => setNaming(false)}
          />
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {card.routines.map(r => (
          <li key={r.id}>
            <button
              onClick={() => onOpenRoutine(r)}
              draggable={draggable}
              onDragStart={draggable ? (e => setDragPayload(e, pillPayload(card, r))) : undefined}
              className={`w-full flex items-center justify-between gap-2 text-left text-sm rounded-lg px-2 py-1
                          hover:bg-neutral-50 transition-colors ${matches(r) ? 'text-neutral-700' : 'opacity-30'}
                          ${draggable ? 'cursor-grab' : ''}`}
            >
              <span className="flex items-center gap-1 flex-1 min-w-0">
                {draggable && <GripVertical className="w-3 h-3 flex-shrink-0 text-neutral-300" />}
                <span className="min-w-0 break-words">{r.name}</span>
              </span>
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
        {dropHover && (
          <li className="rounded-lg border border-dashed border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-700">
            drop to add as step
          </li>
        )}
      </ul>
    </div>
  )
}

export function DailyArc({ cards, anytime, familyMembers, matches, nowMinutes, onOpenCollection, onOpenRoutine, onDropIntent, foldTargets, onNameGroup, onFoldInto }: DailyArcProps) {
  const [caret, setCaret] = useState<{ leftPct: number; time: string } | null>(null)
  if (cards.length === 0 && anytime.length === 0) return null

  const axisHandlers = onDropIntent ? {
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrag(e, ['step', 'routine', 'collection', 'group'])) return
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const time = timeFromAxisX(e.clientX, rect)
      const leftPct = rect.width > 0 ? Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * 100 : 0
      setCaret({ leftPct, time })
    },
    onDragLeave: () => setCaret(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setCaret(null)
      const payload = readDragPayload(e)
      if (!payload) return
      const rect = e.currentTarget.getBoundingClientRect()
      const intent = resolveDrop(payload, { kind: 'axis', time: timeFromAxisX(e.clientX, rect) })
      if (intent) onDropIntent(intent)
    },
  } : {}

  const cardExtras = { onDropIntent, foldTargets, onNameGroup, onFoldInto }

  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Every day</h2>

      {/* Center timeline with staggered cards: the thick dawn→dusk ruler runs
          through the middle; cards alternate above/below and each card starts
          at the horizontal midpoint of the one before it (2-col spans on an
          N+1 column grid). Stems/dots anchor at each card's true start time.
          With drag enabled, the ruler doubles as a drop target: hover shows a
          caret + time; dropping retimes/promotes at that time. */}
      {cards.length > 0 && (
        <div className="overflow-x-auto pt-6 pb-2">
          <div
            className="grid gap-x-3 grid-rows-[auto_4rem_auto]"
            style={{ gridTemplateColumns: `repeat(${cards.length + 1}, 165px)` }}
          >
            {/* The day ruler, spanning all columns */}
            <div
              data-testid="arc-axis"
              {...axisHandlers}
              className="col-span-full row-start-2 self-center relative h-8 rounded-full border border-[var(--color-border,#eadfcc)]
                         bg-gradient-to-r from-amber-100 via-emerald-50 to-stone-300/60"
            >
              {RULER_MARKS.map(m => (
                <span key={m.label} className="absolute top-1.5 text-[11px] text-neutral-500 -translate-x-1/2 pointer-events-none"
                      style={{ left: `${pct(m.minutes)}%` }}>
                  {m.label}
                </span>
              ))}
              <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-orange-600 pointer-events-none" style={{ left: `${pct(nowMinutes)}%` }} />
              <span className="absolute -top-6 text-[10px] font-bold text-orange-600 -translate-x-1/2 pointer-events-none"
                    style={{ left: `${pct(nowMinutes)}%` }}>
                NOW
              </span>
              {caret && (
                <>
                  <div className="absolute -top-2 -bottom-2 w-0.5 bg-amber-500 pointer-events-none" style={{ left: `${caret.leftPct}%` }} />
                  <span className="absolute -top-6 rounded bg-amber-500 px-1 text-[10px] font-bold text-white -translate-x-1/2 pointer-events-none"
                        style={{ left: `${caret.leftPct}%` }}>
                    {caret.time}
                  </span>
                </>
              )}
              {/* Stems + dots anchored at each card's true start time */}
              {cards.map((card, i) => {
                const start = minutesOf(card.startTime)
                if (start == null) return null
                const above = i % 2 === 0
                return (
                  <div
                    key={card.id}
                    className={`absolute flex flex-col items-center pointer-events-none -translate-x-1/2
                                ${above ? '-top-4' : '-bottom-4'}`}
                    style={{ left: `${pct(start)}%` }}
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
                )
              })}
            </div>

            {/* Card cells — each spans 2 columns starting at column i+1, so a
                card's left edge sits at the midpoint of the previous one */}
            {cards.map((card, i) => (
              <div
                key={card.id}
                className={i % 2 === 0 ? 'self-end row-start-1 min-w-0' : 'self-start row-start-3 min-w-0'}
                style={{ gridColumn: `${i + 1} / span 2` }}
              >
                <ArcCard
                  card={card}
                  familyMembers={familyMembers}
                  matches={matches}
                  onOpenCollection={onOpenCollection}
                  onOpenRoutine={onOpenRoutine}
                  {...cardExtras}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anytime row — pills drag onto the ruler to receive a time */}
      {anytime.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <span className="text-xs italic text-neutral-400">anytime today —</span>
          {anytime.map(r => (
            <button
              key={r.id}
              onClick={() => onOpenRoutine(r)}
              draggable={!!onDropIntent}
              onDragStart={onDropIntent ? (e => setDragPayload(e, { kind: 'routine', id: r.id })) : undefined}
              className={`rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600
                          hover:border-amber-300 transition-colors ${matches(r) ? '' : 'opacity-30'}
                          ${onDropIntent ? 'cursor-grab' : ''}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
