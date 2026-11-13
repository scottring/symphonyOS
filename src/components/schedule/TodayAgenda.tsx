import { useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { useDraggable, useDroppable, useDndMonitor } from '@dnd-kit/core'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember, FamilyMemberColor } from '@/types/family'
import { FAMILY_COLORS } from '@/types/family'
import { SCALE_DROP_ID, refusalFor } from '@/lib/today/todayDrop'
import { dragPointerY } from '@/lib/today/dragPointer'
import { isPlanDrag, readPlanDrag, type PlanDragPayload } from '@/lib/planning/planDrag'
import { useTravelTime } from '@/hooks/useTravelTime'
import { formatTimeLong } from '@/lib/timeUtils'
import { displayTitle, marginClock } from '@/lib/today/displayTitle'
import { KindIcon } from './KindIcon'
import { sayClock } from '@/lib/today/daySentence'
import { agendaEntries, buildAgenda, nextQuarter, type AgendaEntry, type AgendaRow } from '@/lib/today/agenda'
import type { DayScaleHandle } from './TodayDayScale'
import type { ProposedRow, RowMark } from './todayPreview'
import { TaskCheckbox } from './TaskCheckbox'
import { TravelChip } from './TravelChip'
import { travelKey, useTravelChoice } from '@/lib/travelChoice'

/**
 * The day as a short list (Scott, 2026-11-11: board A, "switch to the short
 * list with show hours"). Each thing at its time down a margin, the open
 * stretches between them one plain line, a now line. The hour grid
 * (TodayDayScale) is the "Show hours" view of the same day.
 *
 * What it keeps from the grid: a task or routine ticks off by its own check;
 * a click opens the details; a row drags. A drop gives a time: on an open
 * stretch it is the stretch's start (the next quarter hour when that is now),
 * on a thing it is that thing's end — "after this". It answers the page's
 * drop resolver through the same handle the grid does (timeAt).
 */

function MiniAvatar({ member }: { member: FamilyMember }) {
  const c = FAMILY_COLORS[member.color as FamilyMemberColor] ?? FAMILY_COLORS.blue
  return (
    <span className={`today-scale-avatar ${c.bg} ${c.text}`} title={member.name} aria-hidden="true">
      {member.initials || member.name.slice(0, 1)}
    </span>
  )
}

/** "7 AM", "7:30 PM" in the margin (2026-11-13). */
const marginTime = marginClock

/** Two things on the day that overlap: the later one says so ("30 min
 *  overlap with the bathroom visit", Scott, 2026-11-13). Routines in the
 *  background and all-day things never count. */
export function overlapsOf(entries: readonly AgendaEntry[]): Map<string, { minutes: number; with: string }> {
  const out = new Map<string, { minutes: number; with: string }>()
  const real = entries
    .filter((e) => e.hasEnd && !e.item.allDay && !e.item.originalRoutine?.background && e.item.type !== 'routine')
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  for (let i = 1; i < real.length; i++) {
    const cur = real[i]
    const prev = real.slice(0, i).filter((p) => p.end.getTime() > cur.start.getTime()).at(-1)
    if (!prev) continue
    const minutes = Math.round((Math.min(prev.end.getTime(), cur.end.getTime()) - cur.start.getTime()) / 60_000)
    if (minutes >= 5) out.set(cur.item.id, { minutes, with: displayTitle(prev.item.title) })
  }
  return out
}

interface ItemRowProps {
  entry: AgendaEntry
  people: FamilyMember[]
  selected: boolean
  upNext: boolean
  past: boolean
  refused: boolean
  landing: boolean
  mark?: RowMark
  overlap?: { minutes: number; with: string }
  onSelect: (id: string) => void
  onToggleDone?: () => void
}

function AgendaItemRow({ entry, people, selected, upNext, past, refused, landing, mark, overlap, onSelect, onToggleDone }: ItemRowProps) {
  const { item, start, end, hasEnd } = entry
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: refused })
  const isEvent = item.type === 'event'
  const [travelChoice, chooseTravel] = useTravelChoice(travelKey(item))
  const travel = useTravelTime(item, { enabled: isEvent && !item.completed && !past, mode: travelChoice })
  const done = item.completed || !!item.skipped
  const background = !!item.originalRoutine?.background
  const title = displayTitle(item.title)
  const label = `${title}, ${formatTimeLong(start)}${hasEnd ? ` to ${formatTimeLong(end)}` : ''}${done ? ', done' : ''}${upNext ? ', up next' : ''}`
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      role={undefined}
      data-item-id={item.id}
      data-kind={item.type}
      data-ag-row="item"
      data-ag-at={end.getTime()}
      className={[
        'ag-row',
        `is-${isEvent ? 'event' : item.type === 'task' ? 'task' : 'routine'}`,
        background ? 'is-background' : '',
        done ? 'is-done' : '',
        past && !upNext ? 'is-past' : '',
        selected ? 'is-selected' : '',
        isDragging ? 'is-dragging' : '',
        landing ? 'is-landing' : '',
        mark ? `is-preview is-${mark.tone}` : '',
        mark?.struck ? 'is-struck' : '',
      ].filter(Boolean).join(' ')}
    >
      <span className="ag-time tabular-nums">{marginTime(start)}</span>
      <span className="ag-spine">
        {onToggleDone ? (
          // Pressing the check is not picking the row up.
          <span className="ag-check" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
            <TaskCheckbox
              shape="circle"
              completed={item.completed}
              onToggleComplete={onToggleDone}
              onToggleWaiting={() => {}}
              label={item.completed ? `Mark ${item.title} incomplete` : `Mark ${item.title} complete`}
            />
          </span>
        ) : <span className="ag-dot" aria-hidden="true" />}
      </span>
      <div className="ag-body">
        <span className="ag-icon" aria-hidden="true"><KindIcon title={item.title} /></span>
        <div className="ag-main">
          <button type="button" className="ag-open" aria-label={label} onClick={() => onSelect(item.id)}>
            <span className="ag-title">{title}</span>
            {(hasEnd || mark?.note || overlap) && (
              <span className="ag-sub">
                {hasEnd && <span>Until {sayClock(end)}</span>}
                {overlap && <span className="ag-overlap">{overlap.minutes} min overlap with {overlap.with}</span>}
                {mark?.note && <span className="wc-proposed-note">{mark.note}</span>}
              </span>
            )}
          </button>
          {/* How you're getting there, one hover away (2026-11-11). */}
          <TravelChip label={travel} choice={travelChoice} onChoose={chooseTravel} className="ag-travel" />
        </div>
        {people.length > 0 && (
          <span className="ag-people">{people.slice(0, 3).map((m) => <MiniAvatar key={m.id} member={m} />)}</span>
        )}
      </div>
    </li>
  )
}

export function TodayAgenda({
  items,
  viewedDate,
  now,
  selectedItemId,
  upNextId,
  peopleOf,
  isReadOnlyEvent,
  onSelect,
  onToggleDone,
  onPlanDrop,
  handleRef,
  markOf,
  proposed = [],
  showOpenTime = true,
}: {
  /** Everything on the day with a time: the grid's rows and the routines the
   *  grid shows as quiet bands, each its own row here. */
  items: TimelineItem[]
  viewedDate: Date
  /** The clock on today; null on any other day. */
  now: Date | null
  selectedItemId: string | null
  upNextId?: string
  peopleOf: (item: TimelineItem) => FamilyMember[]
  isReadOnlyEvent: (item: TimelineItem) => boolean
  onSelect: (id: string) => void
  onToggleDone?: (item: TimelineItem) => void
  /** A row dragged in from the week's sheet (native drag), with its time. */
  onPlanDrop?: (payload: PlanDragPayload, when: Date) => void
  handleRef?: Ref<DayScaleHandle>
  markOf?: (item: TimelineItem) => RowMark | undefined
  proposed?: readonly ProposedRow[]
  showOpenTime?: boolean
}) {
  const entries = useMemo(() => agendaEntries(items), [items])
  const overlaps = useMemo(() => overlapsOf(entries), [entries])
  const rows: AgendaRow[] = useMemo(() => buildAgenda(entries, {
    day: viewedDate,
    now,
    proposals: proposed.flatMap((p) => (p.time ? [{ key: p.key, title: p.title, note: p.note, time: p.time }] : [])),
    showOpen: showOpenTime,
  }), [entries, viewedDate, now, proposed, showOpenTime])

  const listRef = useRef<HTMLOListElement | null>(null)
  const { setNodeRef, isOver } = useDroppable({ id: SCALE_DROP_ID })
  const setList = (el: HTMLOListElement | null) => { listRef.current = el; setNodeRef(el) }

  // Where a drop at this height lands: the row under the pointer (or the
  // nearest one above it). An open stretch gives its start; a thing, its end.
  const targetAt = (clientY: number): { key: string; when: Date } | null => {
    const list = listRef.current
    if (!list) return null
    const rect = list.getBoundingClientRect()
    if (clientY < rect.top - 8 || clientY > rect.bottom + 8) return null
    const candidates = [...list.querySelectorAll<HTMLElement>('[data-ag-at]')]
    let hit: HTMLElement | null = null
    for (const el of candidates) {
      if (el.getBoundingClientRect().top <= clientY) hit = el
    }
    hit ??= candidates[0] ?? null
    if (!hit) return null
    const when = nextQuarter(new Date(Number(hit.dataset.agAt)))
    return { key: hit.dataset.agKey ?? hit.dataset.itemId ?? '', when }
  }
  useImperativeHandle(handleRef, () => ({ timeAt: (y: number) => targetAt(y)?.when ?? null }))

  const [landing, setLanding] = useState<{ key: string; label: string } | null>(null)
  const land = (clientY: number | null) => {
    const t = clientY == null ? null : targetAt(clientY)
    setLanding(t ? { key: t.key, label: formatTimeLong(t.when) } : null)
    return t
  }
  useDndMonitor({
    onDragMove(e) {
      if (e.over?.id !== SCALE_DROP_ID) { setLanding(null); return }
      land(dragPointerY(e))
    },
    onDragEnd() { setLanding(null) },
    onDragCancel() { setLanding(null) },
  })
  const planDrop = onPlanDrop ? {
    onDragOver: (e: React.DragEvent) => {
      if (!isPlanDrag(e.dataTransfer)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      land(e.clientY)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLanding(null)
    },
    onDrop: (e: React.DragEvent) => {
      const payload = readPlanDrag(e.dataTransfer)
      const t = targetAt(e.clientY)
      setLanding(null)
      if (!payload || !t) return
      e.preventDefault()
      e.stopPropagation()
      onPlanDrop(payload, t.when)
    },
  } : {}

  const nowMs = now?.getTime() ?? null

  return (
    <ol ref={setList} className={`today-agenda${isOver ? ' is-over' : ''}`} aria-label="The day" data-testid="today-agenda" {...planDrop}>
      {rows.map((row) => {
        if (row.kind === 'now') {
          return (
            <li key="now" className="ag-now" aria-label={`Now, ${formatTimeLong(row.at)}`}>
              <span className="ag-time tabular-nums">{marginTime(row.at)}</span>
              <span className="ag-spine"><span className="ag-dot" aria-hidden="true" /></span>
              <span className="ag-nowline" aria-hidden="true">Now<i /></span>
            </li>
          )
        }
        if (row.kind === 'open') {
          const isLanding = landing?.key === row.key
          return (
            <li key={row.key} className={`ag-open-row${isLanding ? ' is-landing' : ''}`} data-ag-at={row.start.getTime()} data-ag-key={row.key}>
              <span className="ag-time" aria-hidden="true" />
              <span className="ag-spine" aria-hidden="true" />
              <p className="ag-free">{isLanding ? `Starts at ${landing!.label}` : row.label}</p>
            </li>
          )
        }
        if (row.kind === 'proposed') {
          return (
            <li key={row.key} className="ag-row is-proposed" data-testid="proposed-row">
              <span className="ag-time tabular-nums">{marginTime(row.proposal.time)}</span>
              <span className="ag-spine"><span className="ag-dot" aria-hidden="true" /></span>
              <div className="ag-body">
                <span className="ag-open">
                  <span className="ag-title">{row.proposal.title}</span>
                  {row.proposal.note && <span className="ag-sub"><span className="wc-proposed-note">{row.proposal.note}</span></span>}
                  <span className="sr-only"> (proposed, not saved yet)</span>
                </span>
              </div>
            </li>
          )
        }
        const { entry } = row
        const { item } = entry
        return (
          <AgendaItemRow
            key={row.key}
            entry={entry}
            people={peopleOf(item)}
            selected={selectedItemId === item.id}
            upNext={upNextId === item.id}
            past={nowMs !== null && entry.end.getTime() <= nowMs}
            refused={!!refusalFor(item, isReadOnlyEvent)}
            landing={landing?.key === item.id}
            mark={markOf?.(item)}
            overlap={overlaps.get(item.id)}
            onSelect={onSelect}
            onToggleDone={onToggleDone && (item.type === 'task' || item.type === 'routine') ? () => onToggleDone(item) : undefined}
          />
        )
      })}
    </ol>
  )
}
