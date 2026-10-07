import { useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { useDraggable, useDroppable, useDndMonitor } from '@dnd-kit/core'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember, FamilyMemberColor } from '@/types/family'
import { FAMILY_COLORS } from '@/types/family'
import { buildDayScale, timeAtOffset, type DayScale, type ScaleBlock } from '@/lib/today/dayScale'
import { SCALE_DROP_ID, refusalFor } from '@/lib/today/todayDrop'
import { dragPointerY } from '@/lib/today/dragPointer'
import { isPlanDrag, readPlanDrag, type PlanDragPayload } from '@/lib/planning/planDrag'
import { useTravelTime } from '@/hooks/useTravelTime'
import { effectiveStartTime, formatTimeLong } from '@/lib/timeUtils'

/**
 * The day, to scale (Scott, 2026-10-06, option B): Today's timed day as a
 * column of hours in the chosen place's colours: each thing where it falls,
 * free stretches named, a now line. It IS the schedule — the timed list it
 * replaced is gone, so nothing draws the day twice.
 *
 * A click opens the thing's details (tick it off, fine-tune its time there).
 * Everything moves by dragging; a drop lands on the quarter hour under the
 * pointer, and the list beside it ("For today") and the week column drop
 * onto it to give something a time.
 */

export interface DayScaleHandle {
  /** The time at a viewport y (where something was let go), on the viewed day. */
  timeAt: (viewportTop: number) => Date | null
}

const DEFAULT_MINUTES = 30

/** "9:00", "4:15" — the column's own a/p labels say which half of the day. */
function clock(d: Date): string {
  const h = d.getHours() % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

function driveMinutes(label: string): number {
  const h = /(\d+)\s*hr/.exec(label)
  const m = /(\d+)\s*min/.exec(label)
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)
}

function MiniAvatar({ member }: { member: FamilyMember }) {
  const c = FAMILY_COLORS[member.color as FamilyMemberColor] ?? FAMILY_COLORS.blue
  return (
    <span className={`today-scale-avatar ${c.bg} ${c.text}`} title={member.name} aria-hidden="true">
      {member.initials || member.name.slice(0, 1)}
    </span>
  )
}

interface BlockProps {
  item: TimelineItem
  start: Date
  end: Date
  /** It has an end of its own (not the half-hour a bare time is given). */
  hasEnd: boolean
  block: ScaleBlock
  pxPerHour: number
  people: FamilyMember[]
  selected: boolean
  upNext: boolean
  past: boolean
  refused: boolean
  onSelect: (id: string) => void
}

/** Every thing on the day is drawn one way (Scott, 2026-10-07: three styles
 *  side by side "looks stupid"): "9:00–10:15 · Boxing" and who carries it.
 *  No check here — a click opens its details, where it is ticked off or its
 *  time fine-tuned. */
function ScaleItem({ item, start, end, hasEnd, block, pxPerHour, people, selected, upNext, past, refused, onSelect }: BlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: refused })
  const isEvent = item.type === 'event'
  // How far away it is, drawn above it as the time it takes to get there.
  const travel = useTravelTime(item, { enabled: isEvent && !item.completed && !past })
  const driveH = travel ? Math.max(14, (driveMinutes(travel) / 60) * pxPerHour) : 0
  const time = hasEnd ? `${clock(start)}–${clock(end)}` : clock(start)
  const lanes = block.lanes
  const pos = {
    top: block.top,
    height: block.height,
    left: `calc(var(--scale-gutter) + (100% - var(--scale-gutter)) * ${block.lane / lanes})`,
    width: `calc((100% - var(--scale-gutter)) / ${lanes} - ${lanes > 1 ? 6 : 0}px)`,
  }
  const done = item.completed || !!item.skipped
  const label = `${item.title}, ${formatTimeLong(start)}${hasEnd ? ` to ${formatTimeLong(end)}` : ''}${done ? ', done' : ''}${upNext ? ', up next' : ''}`
  return (
    <>
      {travel && block.lane === 0 && block.top - driveH > 0 && (
        <div className="today-scale-drive" style={{ top: block.top - driveH, height: driveH, left: pos.left }} aria-hidden="true">
          {travel}
        </div>
      )}
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        // The drag handle is the whole block; the button inside is the
        // keyboard's way in, so the wrapper is not a tab stop of its own.
        tabIndex={-1}
        role={undefined}
        data-item-id={item.id}
        className={[
          'today-scale-item',
          done ? 'is-done' : '',
          past && !upNext ? 'is-past' : '',
          selected ? 'is-selected' : '',
          isDragging ? 'is-dragging' : '',
        ].filter(Boolean).join(' ')}
        style={pos}
      >
        <button type="button" className="today-scale-open" aria-label={label} onClick={() => onSelect(item.id)}>
          <span className="today-scale-line"><span className="tabular-nums">{time}</span> · <span>{item.title}</span></span>
        </button>
        {people.length > 0 && (
          <span className="today-scale-people">{people.slice(0, 3).map((m) => <MiniAvatar key={m.id} member={m} />)}</span>
        )}
      </div>
    </>
  )
}

export function TodayDayScale({
  items,
  viewedDate,
  now,
  isMobile,
  selectedItemId,
  upNextId,
  peopleOf,
  isReadOnlyEvent,
  onSelect,
  onPlanDrop,
  fromHour = null,
  handleRef,
}: {
  /** The day's timed rows (a group's children ride with their parent). */
  items: TimelineItem[]
  viewedDate: Date
  /** The clock on today; null on any other day (no now line, no past). */
  now: Date | null
  isMobile: boolean
  selectedItemId: string | null
  upNextId?: string
  peopleOf: (item: TimelineItem) => FamilyMember[]
  isReadOnlyEvent: (item: TimelineItem) => boolean
  /** Opens the thing's details pane, as a row's click does. */
  onSelect: (id: string) => void
  /** A row dragged in from the week column (native drag), with the time it
   *  was dropped at. */
  onPlanDrop?: (payload: PlanDragPayload, when: Date) => void
  /** "Hide earlier hours": the column opens at this hour. */
  fromHour?: number | null
  handleRef?: Ref<DayScaleHandle>
}) {
  // When each thing runs. An all-day "Dinner: …" event sits at its meal's
  // hour (effectiveStartTime), for the half hour a bare time gets.
  const timed = useMemo(() => items.flatMap((item) => {
    const start = item.isSubtask ? null : effectiveStartTime(item)
    if (!start) return []
    const own = item.allDay ? null : item.endTime
    const hasEnd = !!own && own.getTime() > start.getTime()
    return [{ item, start, end: hasEnd ? own! : new Date(start.getTime() + DEFAULT_MINUTES * 60_000), hasEnd }]
  }), [items])
  const scale: DayScale = useMemo(
    () => buildDayScale(
      timed.map((t) => ({ id: t.item.id, start: t.start, end: t.hasEnd ? t.end : null })),
      { now, pxPerHour: isMobile ? 40 : 48, fromHour },
    ),
    [timed, now, isMobile, fromHour],
  )
  const trackRef = useRef<HTMLDivElement | null>(null)
  const { setNodeRef, isOver } = useDroppable({ id: SCALE_DROP_ID })
  const setTrack = (el: HTMLDivElement | null) => { trackRef.current = el; setNodeRef(el) }

  const timeAt = (viewportTop: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    return rect ? timeAtOffset(scale, viewportTop - rect.top, viewedDate) : null
  }
  useImperativeHandle(handleRef, () => ({ timeAt }))

  // While something is dragged over the column, a line says where it lands.
  const [landing, setLanding] = useState<{ top: number; label: string } | null>(null)
  useDndMonitor({
    onDragMove(e) {
      const y = dragPointerY(e)
      const rect = trackRef.current?.getBoundingClientRect()
      if (e.over?.id !== SCALE_DROP_ID || y == null || !rect) { setLanding(null); return }
      const when = timeAtOffset(scale, y - rect.top, viewedDate)
      const h = when.getHours() + when.getMinutes() / 60
      setLanding({ top: (h - scale.startHour) * scale.pxPerHour, label: formatTimeLong(when) })
    },
    onDragEnd() { setLanding(null) },
    onDragCancel() { setLanding(null) },
  })

  // The week column's rows travel by native drag (they live outside this
  // page's dnd-kit context): the same landing line, read from the pointer.
  const landAt = (clientY: number) => {
    const when = timeAt(clientY)
    if (!when) return null
    const h = when.getHours() + when.getMinutes() / 60
    setLanding({ top: (h - scale.startHour) * scale.pxPerHour, label: formatTimeLong(when) })
    return when
  }
  const planDrop = onPlanDrop ? {
    onDragOver: (e: React.DragEvent) => {
      if (!isPlanDrag(e.dataTransfer)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      landAt(e.clientY)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLanding(null)
    },
    onDrop: (e: React.DragEvent) => {
      const payload = readPlanDrag(e.dataTransfer)
      setLanding(null)
      if (!payload) return
      e.preventDefault()
      e.stopPropagation()
      const when = timeAt(e.clientY)
      if (when) onPlanDrop(payload, when)
    },
  } : {}

  const byId = useMemo(() => new Map(timed.map((t) => [t.item.id, t])), [timed])

  const nowMs = now?.getTime() ?? null
  const nowLabel = now ? `now ${clock(now)}` : null

  return (
    <div
      ref={setTrack}
      className={`today-scale${isOver ? ' is-over' : ''}`}
      style={{ height: scale.height }}
      data-testid="today-day-scale"
      {...planDrop}
    >
      {scale.ticks.map((t) => (
        <div key={t.label} className="today-scale-hour" style={{ top: t.top }} aria-hidden="true"><span>{t.label}</span></div>
      ))}
      {scale.free.map((f) => (
        <div key={f.top} className="today-scale-free" style={{ top: f.top, height: f.height }}>{f.label}</div>
      ))}
      {scale.blocks.map((b) => {
        const entry = byId.get(b.id)
        if (!entry) return null
        const { item, start, end, hasEnd } = entry
        const past = nowMs !== null && end.getTime() <= nowMs
        return (
          <ScaleItem
            key={b.id}
            item={item}
            start={start}
            end={end}
            hasEnd={hasEnd}
            block={b}
            pxPerHour={scale.pxPerHour}
            people={peopleOf(item)}
            selected={selectedItemId === item.id}
            upNext={upNextId === item.id}
            past={past}
            refused={!!refusalFor(item, isReadOnlyEvent)}
            onSelect={onSelect}
          />
        )
      })}
      {scale.now !== null && (
        <div className="today-scale-now" style={{ top: scale.now }} aria-hidden="true"><span>{nowLabel}</span></div>
      )}
      {landing && (
        <div className="today-scale-landing" style={{ top: landing.top }} aria-hidden="true"><span>{landing.label}</span></div>
      )}
    </div>
  )
}
