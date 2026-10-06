import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { useDraggable, useDroppable, useDndMonitor } from '@dnd-kit/core'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember, FamilyMemberColor } from '@/types/family'
import { FAMILY_COLORS } from '@/types/family'
import { buildDayScale, timeAtOffset, type DayScale, type ScaleBlock } from '@/lib/today/dayScale'
import { SCALE_DROP_ID, refusalFor } from '@/lib/today/todayDrop'
import { useTravelTime } from '@/hooks/useTravelTime'
import { effectiveStartTime, formatTimeLong } from '@/lib/timeUtils'

/**
 * The day, to scale (Scott, 2026-10-06, option B): Today's timed day as a
 * column of hours. Calendar events in blue, timed work as a line with its
 * check, free stretches named in green, a now line. It IS the schedule — the
 * timed list it replaced is gone, so nothing draws the day twice.
 *
 * A click lifts the thing's own row out of the day into a small card — the
 * same row the list drew, with its check, people, steps and ⋯ menu — the way
 * a calendar opens an event; the row opens the details as it always has.
 * Everything moves by dragging, and the list beside it ("For today") drops
 * onto it to give a task a time.
 */

export interface DayScaleHandle {
  /** The time at a viewport y (the top of something dropped), on the viewed day. */
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
  open: boolean
  upNext: boolean
  past: boolean
  refused: boolean
  onSelect: (id: string) => void
  onToggle?: () => void
}

function ScaleItem({ item, start, end, hasEnd, block, pxPerHour, people, selected, open, upNext, past, refused, onSelect, onToggle }: BlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: refused })
  const isEvent = item.type === 'event'
  // How far away it is, drawn above it as the time it takes to get there.
  const travel = useTravelTime(item, { enabled: isEvent && !item.completed && !past })
  const driveH = travel ? Math.max(14, (driveMinutes(travel) / 60) * pxPerHour) : 0
  const time = hasEnd && !block.compact ? `${clock(start)} – ${clock(end)}` : clock(start)
  const lanes = block.lanes
  const pos = {
    top: block.top,
    height: block.height,
    left: `calc(var(--scale-gutter) + (100% - var(--scale-gutter)) * ${block.lane / lanes})`,
    width: `calc((100% - var(--scale-gutter)) / ${lanes} - ${lanes > 1 ? 6 : 0}px)`,
  }
  const done = item.completed || !!item.skipped
  const kind = isEvent ? 'event' : 'work'
  const label = `${item.title}, ${formatTimeLong(start)}${hasEnd ? ` to ${formatTimeLong(end)}` : ''}${upNext ? ', up next' : ''}`
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
        // The drag handle is the whole block; the buttons inside stay the
        // keyboard's way in, so the wrapper is not a tab stop of its own.
        tabIndex={-1}
        role={undefined}
        data-kind={kind}
        data-item-id={item.id}
        className={[
          'today-scale-item',
          block.compact ? 'is-compact' : '',
          done ? 'is-done' : '',
          past && !upNext ? 'is-past' : '',
          upNext ? 'is-next' : '',
          selected ? 'is-selected' : '',
          isDragging ? 'is-dragging' : '',
        ].filter(Boolean).join(' ')}
        style={pos}
      >
        {onToggle && (
          <button
            type="button"
            className={`today-scale-check${item.type === 'task' ? '' : ' is-routine'}`}
            aria-label={`${done ? 'Not done' : 'Done'}: ${item.title}`}
            aria-pressed={item.completed}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onToggle}
          />
        )}
        <button type="button" className="today-scale-open" aria-label={label} aria-expanded={open} onClick={() => onSelect(item.id)}>
          {block.compact ? (
            <span className="today-scale-line"><span className="tabular-nums">{time}</span> · <span>{item.title}</span></span>
          ) : (
            <>
              <strong className="today-scale-title">{item.title}</strong>
              <span className="today-scale-time tabular-nums">{time}</span>
            </>
          )}
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
  onToggleTask,
  onCompleteRoutine,
  renderRow,
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
  onToggleTask: (taskId: string) => void
  onCompleteRoutine?: (routineEntityId: string, completed: boolean) => void
  /** The item's own Today row, lifted into a card when its block is clicked. */
  renderRow: (item: TimelineItem) => ReactNode
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
      { now, pxPerHour: isMobile ? 40 : 48 },
    ),
    [timed, now, isMobile],
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
      const top = e.active.rect.current.translated?.top
      const rect = trackRef.current?.getBoundingClientRect()
      if (e.over?.id !== SCALE_DROP_ID || top == null || !rect) { setLanding(null); return }
      const when = timeAtOffset(scale, top - rect.top, viewedDate)
      const h = when.getHours() + when.getMinutes() / 60
      setLanding({ top: (h - scale.startHour) * scale.pxPerHour, label: formatTimeLong(when) })
    },
    onDragEnd() { setLanding(null) },
    onDragCancel() { setLanding(null) },
  })

  const byId = useMemo(() => new Map(timed.map((t) => [t.item.id, t])), [timed])

  // The lifted row: one at a time; Escape or a click elsewhere puts it back.
  const [openId, setOpenId] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null) }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (cardRef.current?.contains(t)) return
      // A click on a block toggles through its own handler.
      if (t?.closest?.('.today-scale-item')) return
      // Menus and pickers a row opens render in portals: leave the card up.
      if (t?.closest?.('[role="menu"], [role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper]')) return
      setOpenId(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [openId])
  const openItem = openId ? byId.get(openId)?.item : undefined
  const openBlock = openId ? scale.blocks.find((b) => b.id === openId) : undefined
  // Below its block; above it when the block sits low in the day.
  const cardBelow = !openBlock || openBlock.top + openBlock.height < scale.height * 0.6
  const nowMs = now?.getTime() ?? null
  const nowLabel = now ? `now ${clock(now)}` : null

  return (
    <div
      ref={setTrack}
      className={`today-scale${isOver ? ' is-over' : ''}`}
      style={{ height: scale.height }}
      data-testid="today-day-scale"
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
        const isTask = item.type === 'task'
        const isRoutine = item.type === 'routine'
        const toggle = item.isFree
          ? undefined
          : isTask
            ? () => onToggleTask(item.id.replace('task-', ''))
            : isRoutine && onCompleteRoutine
              ? () => onCompleteRoutine(item.id.replace(/^routine-/, ''), !item.completed)
              : undefined
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
            open={openId === item.id}
            upNext={upNextId === item.id}
            past={past}
            refused={!!refusalFor(item, isReadOnlyEvent)}
            onSelect={(id) => setOpenId((cur) => (cur === id ? null : id))}
            onToggle={toggle}
          />
        )
      })}
      {scale.now !== null && (
        <div className="today-scale-now" style={{ top: scale.now }} aria-hidden="true"><span>{nowLabel}</span></div>
      )}
      {openItem && openBlock && (
        <div
          ref={cardRef}
          className="today-scale-card"
          role="group"
          aria-label={openItem.title}
          style={cardBelow
            ? { top: openBlock.top + openBlock.height + 6 }
            : { bottom: scale.height - openBlock.top + 6 }}
        >
          {renderRow(openItem)}
        </div>
      )}
      {landing && (
        <div className="today-scale-landing" style={{ top: landing.top }} aria-hidden="true"><span>{landing.label}</span></div>
      )}
    </div>
  )
}
