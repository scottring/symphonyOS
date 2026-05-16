import { useCallback, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import { type FamilyMemberColor } from '@/types/family'
import { inferMealTime } from '@/lib/timeUtils'

// All-day events whose title implies a meal (e.g. "Dinner: salmon")
// should display at the inferred mealtime, not as "All day".
function effectiveStart(item: TimelineItem): { time: Date | null; allDay: boolean } {
  if (item.allDay && item.startTime) {
    const inferred = inferMealTime(item.title)
    if (inferred) {
      const d = new Date(item.startTime)
      d.setHours(inferred.hour, inferred.minute, 0, 0)
      return { time: d, allDay: false }
    }
  }
  return { time: item.startTime ?? null, allDay: !!item.allDay }
}

interface WallSwimlaneProps {
  familyMembers: FamilyMember[]
  taskItems: TimelineItem[]      // today scheduled + overdue
  routineItems: TimelineItem[]   // non-daily routines for today
  calendarEvents: TimelineItem[] // today's events as TimelineItems
  onComplete: (item: TimelineItem) => void
  onItemTap?: (item: TimelineItem) => void
}

// ============================================================================
// Owner resolution
// ============================================================================

function resolveOwners(item: TimelineItem, members: FamilyMember[]): string[] {
  if (item.type === 'task' || item.type === 'routine') {
    return item.assignedTo ? [item.assignedTo] : []
  }
  if (item.type === 'event') {
    const calName = (item.calendarName || '').toLowerCase()
    const title = item.title.toLowerCase()
    const matches: string[] = []
    for (const m of members) {
      const first = m.name.toLowerCase().split(/\s+/)[0]
      if (!first) continue
      const re = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
      if (re.test(calName) || re.test(title)) matches.push(m.id)
    }
    return matches
  }
  return []
}

// ============================================================================
// Sorting
// ============================================================================

function sortItems(a: TimelineItem, b: TimelineItem): number {
  // Completed sink to bottom
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  const aEff = effectiveStart(a)
  const bEff = effectiveStart(b)
  // All-day events pinned to top (meal-inferred items count as timed)
  const aAll = aEff.allDay ? 1 : 0
  const bAll = bEff.allDay ? 1 : 0
  if (aAll !== bAll) return bAll - aAll
  // Untimed items below timed
  const aT = aEff.time ? aEff.time.getTime() : Infinity
  const bT = bEff.time ? bEff.time.getTime() : Infinity
  if (aT !== bT) return aT - bT
  return a.title.localeCompare(b.title)
}

// ============================================================================
// Icons & formatters
// ============================================================================

function formatTime(item: TimelineItem): string | null {
  const eff = effectiveStart(item)
  if (eff.allDay) return 'All day'
  if (!eff.time) return null
  const h = eff.time.getHours()
  const m = eff.time.getMinutes()
  const period = h >= 12 ? 'p' : 'a'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${period}` : `${hour}:${m.toString().padStart(2, '0')}${period}`
}

function getIcon(item: TimelineItem): string {
  if (item.type === 'event') return '📅'
  if (item.type === 'routine') return '🔁'
  const lower = item.title.toLowerCase()
  if (lower.includes('grocery') || lower.includes('shop')) return '🛒'
  if (lower.includes('call') || lower.includes('phone')) return '📞'
  if (lower.includes('email')) return '📧'
  if (lower.includes('pick up') || lower.includes('pickup')) return '🚗'
  if (lower.includes('doctor') || lower.includes('dentist') || lower.includes('appointment')) return '🏥'
  if (lower.includes('school')) return '🎒'
  if (lower.includes('soccer') || lower.includes('practice')) return '⚽'
  if (lower.includes('piano') || lower.includes('lesson')) return '🎹'
  if (lower.includes('birthday') || lower.includes('party')) return '🎂'
  if (lower.includes('cook') || lower.includes('dinner') || lower.includes('meal')) return '🍽️'
  if (lower.includes('clean') || lower.includes('tidy')) return '🧹'
  if (lower.includes('fix') || lower.includes('repair')) return '🔧'
  if (lower.includes('pay') || lower.includes('bill')) return '💳'
  if (lower.includes('buy') || lower.includes('order') || lower.includes('return')) return '📦'
  if (lower.includes('walk') || lower.includes('jax') || lower.includes('dog')) return '🐕'
  if (lower.includes('med') || lower.includes('prescription')) return '💊'
  return '📌'
}

const COLOR_HEX: Record<FamilyMemberColor, string> = {
  blue: '#60A5FA',
  purple: '#C084FC',
  green: '#6DC4A7',
  orange: '#FB923C',
  pink: '#F472B6',
  teal: '#5EEAD4',
}

function memberAccent(member: FamilyMember | null): string {
  if (!member) return '#94A3B8' // slate for shared
  const c = (member.color as FamilyMemberColor)
  return COLOR_HEX[c] ?? '#94A3B8'
}

// ============================================================================
// Item card
// ============================================================================

interface SwimlaneItemProps {
  item: TimelineItem
  onComplete: (item: TimelineItem) => void
  onItemTap?: (item: TimelineItem) => void
}

function SwimlaneItem({ item, onComplete, onItemTap }: SwimlaneItemProps) {
  const [pressing, setPressing] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const downAt = useRef(0)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (item.type === 'event') {
      // Events aren't completable — just allow tap
      downAt.current = Date.now()
      return
    }
    downAt.current = Date.now()
    setPressing(true)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (rect.left + rect.width / 2) / window.innerWidth
    const y = (rect.top + rect.height / 2) / window.innerHeight
    timeoutRef.current = setTimeout(() => {
      setPressing(false)
      confetti({ particleCount: 60, spread: 55, origin: { x, y }, colors: ['#6DC4A7', '#F9C35C', '#F26E63', '#FFFFFF'] })
      setTimeout(() => onComplete(item), 250)
    }, 700)
  }, [item, onComplete])

  const handlePointerUp = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    setPressing(false)
    const elapsed = Date.now() - downAt.current
    if (elapsed < 300 && onItemTap) onItemTap(item)
  }, [item, onItemTap])

  const handleCancel = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    setPressing(false)
  }, [])

  const time = formatTime(item)
  const isDone = item.completed

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handleCancel}
      onPointerCancel={handleCancel}
      className={`
        relative flex items-center gap-2 rounded-lg px-2.5 py-2
        select-none cursor-pointer transition-all overflow-hidden
        ${pressing ? 'bg-white/15 scale-[0.98]' : 'bg-white/[0.05] hover:bg-white/[0.09]'}
        ${isDone ? 'opacity-40' : ''}
      `}
      style={{ touchAction: 'none' }}
    >
      {!isDone && item.type !== 'event' && (
        <div
          className={`
            absolute inset-0 rounded-lg bg-white/10 origin-left pointer-events-none
            ${pressing ? 'scale-x-100 duration-700 ease-linear' : 'scale-x-0 duration-150 ease-out'}
          `}
          style={{ transition: 'transform' }}
        />
      )}
      <span className="text-[0.95rem] flex-shrink-0 relative z-10">{getIcon(item)}</span>
      <span
        className={`
          flex-1 min-w-0 text-[0.75rem] font-bold leading-tight relative z-10
          ${isDone ? 'text-white/40 line-through' : 'text-white/85'}
        `}
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {item.title}
      </span>
      {time && !isDone && (
        <span className="text-[0.55rem] font-black text-white/40 uppercase tracking-wider flex-shrink-0 relative z-10 tabular-nums">
          {time}
        </span>
      )}
      {isDone && <span className="text-[0.7rem] relative z-10">✅</span>}
    </div>
  )
}

// ============================================================================
// Column
// ============================================================================

interface ColumnProps {
  member: FamilyMember | null // null = Shared column
  items: TimelineItem[]
  onComplete: (item: TimelineItem) => void
  onItemTap?: (item: TimelineItem) => void
}

function Column({ member, items, onComplete, onItemTap }: ColumnProps) {
  const accent = memberAccent(member)
  const name = member?.name.split(/\s+/)[0] || 'Shared'
  const initials = member?.initials || '∗'
  const incomplete = items.filter(i => !i.completed).length

  return (
    <div className="flex flex-col min-h-0 flex-1 min-w-[150px]">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[0.65rem] font-black text-white flex-shrink-0"
          style={{ backgroundColor: accent + '40', border: `1.5px solid ${accent}` }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="font-black uppercase tracking-wider text-[0.75rem] truncate"
            style={{ color: accent }}
          >
            {name}
          </div>
        </div>
        {items.length > 0 && (
          <div className="text-[0.6rem] font-bold text-white/30 tabular-nums">
            {incomplete}/{items.length}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center opacity-30">
          <span className="text-[1.4rem]">·</span>
        </div>
      ) : (
        <div
          className="flex-1 flex flex-col gap-1.5 overflow-y-auto pr-1"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {items.map(item => (
            <SwimlaneItem
              key={`${item.id}-${member?.id ?? 'shared'}`}
              item={item}
              onComplete={onComplete}
              onItemTap={onItemTap}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main
// ============================================================================

export function WallSwimlane({
  familyMembers,
  taskItems,
  routineItems,
  calendarEvents,
  onComplete,
  onItemTap,
}: WallSwimlaneProps) {
  // Order columns: members by display_order, Shared at the end
  const orderedMembers = useMemo(
    () => [...familyMembers].sort((a, b) => a.display_order - b.display_order),
    [familyMembers],
  )

  const allItems = useMemo(
    () => [...taskItems, ...routineItems, ...calendarEvents],
    [taskItems, routineItems, calendarEvents],
  )

  const columns = useMemo(() => {
    const byMember = new Map<string, TimelineItem[]>()
    for (const m of orderedMembers) byMember.set(m.id, [])
    const shared: TimelineItem[] = []

    for (const item of allItems) {
      const owners = resolveOwners(item, orderedMembers)
      if (owners.length === 0) {
        shared.push(item)
      } else {
        for (const ownerId of owners) {
          const list = byMember.get(ownerId)
          if (list) list.push(item)
        }
      }
    }

    for (const list of byMember.values()) list.sort(sortItems)
    shared.sort(sortItems)

    return { byMember, shared }
  }, [allItems, orderedMembers])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-baseline justify-between mb-4 flex-shrink-0">
        <h2 className="font-display text-white text-[1.6rem] tracking-tight leading-none">
          Today
        </h2>
        <span className="text-white/30 font-black uppercase tracking-widest text-[0.6rem]">
          By person
        </span>
      </div>

      <div className="flex-1 flex gap-3 min-h-0 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {orderedMembers.map(m => (
          <Column
            key={m.id}
            member={m}
            items={columns.byMember.get(m.id) || []}
            onComplete={onComplete}
            onItemTap={onItemTap}
          />
        ))}
        <Column
          key="shared"
          member={null}
          items={columns.shared}
          onComplete={onComplete}
          onItemTap={onItemTap}
        />
      </div>
    </div>
  )
}
