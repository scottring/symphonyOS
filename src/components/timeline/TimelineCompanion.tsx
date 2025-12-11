import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'

// ============================================================================
// TYPES
// ============================================================================

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end?: Date
  familyMemberId?: string
}

interface TimelineCompanionProps {
  // Data
  familyMembers: FamilyMember[]
  tasks: Task[]
  events: CalendarEvent[]

  // View configuration
  focusTime: Date
  timeWindow?: number // Hours to show (default: 4)
  selectedMembers?: string[] // Which members to display (default: all)

  // Position (for popup placement)
  anchorRect?: DOMRect

  // Interaction
  onSelectTime?: (time: Date) => void
  onClose?: () => void
}

interface TimelineEvent {
  id: string
  title: string
  start: Date
  end: Date
  memberId: string
  type: 'task' | 'event'
}

interface ConvergencePoint {
  time: Date
  memberIds: string[]
  events: TimelineEvent[]
}

// ============================================================================
// COLOR MAPPING (matches FAMILY_COLORS but with HSL for blending)
// ============================================================================

const MEMBER_COLORS: Record<string, { h: number; s: number; l: number; className: string }> = {
  blue: { h: 217, s: 91, l: 60, className: 'blue' },
  purple: { h: 270, s: 67, l: 60, className: 'purple' },
  green: { h: 142, s: 71, l: 45, className: 'green' },
  orange: { h: 25, s: 95, l: 53, className: 'orange' },
  pink: { h: 330, s: 81, l: 60, className: 'pink' },
  teal: { h: 174, s: 72, l: 40, className: 'teal' },
}

function getMemberColor(color: string) {
  return MEMBER_COLORS[color] || MEMBER_COLORS.blue
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatHour(date: Date): string {
  const hour = date.getHours()
  if (hour === 0) return '12a'
  if (hour === 12) return '12p'
  return hour < 12 ? `${hour}a` : `${hour - 12}p`
}

function getTimePosition(time: Date, startTime: Date, endTime: Date): number {
  const totalMs = endTime.getTime() - startTime.getTime()
  const elapsedMs = time.getTime() - startTime.getTime()
  return Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100))
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TimelineCompanion({
  familyMembers,
  tasks,
  events,
  focusTime,
  timeWindow = 4,
  selectedMembers,
  anchorRect,
  onSelectTime,
  onClose,
}: TimelineCompanionProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [activeMembers, setActiveMembers] = useState<string[]>(
    selectedMembers || familyMembers.map(m => m.id)
  )

  // Calculate time window
  const { startTime, endTime, hours } = useMemo(() => {
    const halfWindow = Math.floor(timeWindow / 2)
    const start = new Date(focusTime)
    start.setHours(focusTime.getHours() - halfWindow, 0, 0, 0)
    const end = new Date(focusTime)
    end.setHours(focusTime.getHours() + halfWindow, 0, 0, 0)

    const hoursList: Date[] = []
    const current = new Date(start)
    while (current <= end) {
      hoursList.push(new Date(current))
      current.setHours(current.getHours() + 1)
    }

    return { startTime: start, endTime: end, hours: hoursList }
  }, [focusTime, timeWindow])

  // Transform tasks and events into timeline events
  const timelineEvents = useMemo((): TimelineEvent[] => {
    const result: TimelineEvent[] = []

    // Add tasks with scheduled times
    tasks.forEach(task => {
      if (task.scheduledFor) {
        const taskStart = new Date(task.scheduledFor)
        const taskEnd = new Date(taskStart)
        taskEnd.setHours(taskEnd.getHours() + 1) // Assume 1 hour duration

        // Only include if within time window
        if (taskStart >= startTime && taskStart <= endTime) {
          result.push({
            id: task.id,
            title: task.title,
            start: taskStart,
            end: taskEnd,
            memberId: task.assignedTo || familyMembers[0]?.id || '',
            type: 'task',
          })
        }
      }
    })

    // Add calendar events
    events.forEach(event => {
      const eventStart = new Date(event.start)
      const eventEnd = event.end ? new Date(event.end) : new Date(eventStart.getTime() + 3600000)

      if (eventStart >= startTime && eventStart <= endTime) {
        result.push({
          id: event.id,
          title: event.title,
          start: eventStart,
          end: eventEnd,
          memberId: event.familyMemberId || familyMembers[0]?.id || '',
          type: 'event',
        })
      }
    })

    return result
  }, [tasks, events, startTime, endTime, familyMembers])

  // Find convergence points (times where multiple members have events)
  const convergencePoints = useMemo((): ConvergencePoint[] => {
    const timeSlots = new Map<number, TimelineEvent[]>()

    // Group events by hour
    timelineEvents.forEach(event => {
      const hourKey = new Date(event.start).setMinutes(0, 0, 0)
      const existing = timeSlots.get(hourKey) || []
      existing.push(event)
      timeSlots.set(hourKey, existing)
    })

    // Find slots with multiple unique members
    const convergences: ConvergencePoint[] = []
    timeSlots.forEach((slotEvents, timeKey) => {
      const uniqueMembers = [...new Set(slotEvents.map(e => e.memberId))]
      const activeMemberIds = uniqueMembers.filter(id => activeMembers.includes(id))

      if (activeMemberIds.length >= 2) {
        convergences.push({
          time: new Date(timeKey),
          memberIds: activeMemberIds,
          events: slotEvents.filter(e => activeMembers.includes(e.memberId)),
        })
      }
    })

    return convergences
  }, [timelineEvents, activeMembers])

  // Trigger entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  // Close on escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose?.()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Get visible family members
  const visibleMembers = familyMembers.filter(m => activeMembers.includes(m.id))

  // Calculate popup position
  const popupStyle = useMemo(() => {
    if (!anchorRect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }

    // Position to the right of the anchor, or left if not enough space
    const viewportWidth = window.innerWidth
    const popupWidth = 380

    let left = anchorRect.right + 12
    if (left + popupWidth > viewportWidth - 20) {
      left = anchorRect.left - popupWidth - 12
    }

    return {
      top: Math.max(20, anchorRect.top - 100),
      left: Math.max(20, left),
    }
  }, [anchorRect])

  // Handle time slot click
  const handleTimeClick = (hour: Date) => {
    onSelectTime?.(hour)
  }

  // Generate convergence pool gradient
  const getConvergenceGradient = (memberIds: string[]) => {
    const colors = memberIds
      .map(id => familyMembers.find(m => m.id === id)?.color)
      .filter(Boolean)
      .map(c => getMemberColor(c!))

    if (colors.length === 0) return 'transparent'
    if (colors.length === 1) {
      const c = colors[0]
      return `radial-gradient(ellipse at center, hsla(${c.h}, ${c.s}%, ${c.l}%, 0.25) 0%, transparent 70%)`
    }

    // Blend multiple colors
    const avgH = colors.reduce((sum, c) => sum + c.h, 0) / colors.length
    const avgS = colors.reduce((sum, c) => sum + c.s, 0) / colors.length
    const avgL = colors.reduce((sum, c) => sum + c.l, 0) / colors.length

    return `radial-gradient(ellipse at center,
      hsla(${avgH}, ${avgS}%, ${avgL}%, 0.3) 0%,
      hsla(${avgH}, ${avgS}%, ${avgL}%, 0.15) 40%,
      transparent 70%)`
  }

  const formatDate = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateOnly = new Date(date)
    dateOnly.setHours(0, 0, 0, 0)

    if (dateOnly.getTime() === today.getTime()) return 'Today'
    if (dateOnly.getTime() === tomorrow.getTime()) return 'Tomorrow'
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      style={{ pointerEvents: 'none' }}
    >
      {/* Subtle backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, hsl(32 20% 20% / 0.1) 100%)',
          pointerEvents: 'auto',
        }}
        onClick={() => onClose?.()}
      />

      {/* Popup */}
      <div
        ref={popupRef}
        className={`absolute bg-bg-overlay rounded-3xl shadow-xl overflow-hidden
          transition-all duration-300 ease-out
          ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 translate-y-2'}`}
        style={{
          ...popupStyle,
          width: 380,
          maxHeight: 480,
          pointerEvents: 'auto',
          boxShadow: '0 8px 40px hsl(32 30% 20% / 0.18), 0 0 0 1px hsl(38 25% 88% / 0.5)',
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-b from-neutral-50/80 to-transparent">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-neutral-800">
                {formatDate(focusTime)}
              </h3>
              <p className="text-sm text-neutral-500 mt-0.5">
                {formatHour(startTime)} - {formatHour(endTime)}
              </p>
            </div>

            {/* Family filter */}
            <div className="relative">
              <button
                onClick={() => setFilterOpen(!filterOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-50
                  hover:bg-neutral-100 transition-colors text-sm text-neutral-600"
              >
                <div className="flex -space-x-1">
                  {visibleMembers.slice(0, 3).map(member => (
                    <div
                      key={member.id}
                      className={`w-5 h-5 rounded-full border-2 border-white flex items-center justify-center
                        text-[10px] font-medium text-white bg-${getMemberColor(member.color).className}-500`}
                      style={{
                        backgroundColor: `hsl(${getMemberColor(member.color).h}, ${getMemberColor(member.color).s}%, ${getMemberColor(member.color).l}%)`
                      }}
                    >
                      {member.initials[0]}
                    </div>
                  ))}
                </div>
                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Filter dropdown */}
              {filterOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-neutral-100 py-2 z-10">
                  {familyMembers.map(member => {
                    const isActive = activeMembers.includes(member.id)
                    const color = getMemberColor(member.color)
                    return (
                      <button
                        key={member.id}
                        onClick={() => {
                          if (isActive && activeMembers.length > 1) {
                            setActiveMembers(prev => prev.filter(id => id !== member.id))
                          } else if (!isActive) {
                            setActiveMembers(prev => [...prev, member.id])
                          }
                        }}
                        className="w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors"
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white
                            ${isActive ? '' : 'opacity-40'}`}
                          style={{ backgroundColor: `hsl(${color.h}, ${color.s}%, ${color.l}%)` }}
                        >
                          {member.initials}
                        </div>
                        <span className={`text-sm ${isActive ? 'text-neutral-700' : 'text-neutral-400'}`}>
                          {member.name}
                        </span>
                        {isActive && (
                          <svg className="w-4 h-4 ml-auto text-primary-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="relative px-5 py-4 overflow-y-auto" style={{ maxHeight: 380 }}>
          {/* Hour grid with member lanes */}
          <div className="relative">
            {/* Time column labels */}
            <div className="absolute left-0 top-0 w-10 flex flex-col" style={{ height: hours.length * 64 }}>
              {hours.map((hour, idx) => (
                <div
                  key={idx}
                  className="h-16 flex items-start justify-end pr-3 pt-0.5"
                >
                  <span className="font-display text-xs text-neutral-400 tabular-nums">
                    {formatHour(hour)}
                  </span>
                </div>
              ))}
            </div>

            {/* Main timeline area */}
            <div className="ml-12 relative" style={{ height: hours.length * 64 }}>
              {/* Hour lines */}
              {hours.map((_, idx) => (
                <div
                  key={idx}
                  className="absolute left-0 right-0 border-t border-neutral-100"
                  style={{ top: idx * 64 }}
                />
              ))}

              {/* Convergence pools (background layer) */}
              {convergencePoints.map((cp, idx) => {
                const topPos = getTimePosition(cp.time, startTime, endTime)
                return (
                  <div
                    key={`conv-${idx}`}
                    className="absolute left-0 right-0 pointer-events-none animate-convergence-bloom"
                    style={{
                      top: `${topPos}%`,
                      height: 64,
                      background: getConvergenceGradient(cp.memberIds),
                      animationDelay: `${300 + idx * 100}ms`,
                    }}
                  >
                    {/* Ripple effect */}
                    <div
                      className="absolute inset-0 animate-convergence-ripple"
                      style={{
                        background: getConvergenceGradient(cp.memberIds),
                        opacity: 0.5,
                      }}
                    />
                  </div>
                )
              })}

              {/* Member lanes */}
              <div className="relative flex gap-2 h-full">
                {visibleMembers.map((member, memberIdx) => {
                  const color = getMemberColor(member.color)
                  const memberEvents = timelineEvents.filter(
                    e => e.memberId === member.id && activeMembers.includes(member.id)
                  )

                  return (
                    <div
                      key={member.id}
                      className="flex-1 relative animate-stream-flow"
                      style={{
                        animationDelay: `${memberIdx * 80}ms`,
                        minWidth: 60,
                      }}
                    >
                      {/* Stream background */}
                      <div
                        className="absolute inset-0 rounded-2xl opacity-[0.08]"
                        style={{
                          background: `linear-gradient(180deg,
                            hsl(${color.h}, ${color.s}%, ${color.l}%) 0%,
                            hsl(${color.h}, ${color.s - 10}%, ${color.l + 10}%) 50%,
                            hsl(${color.h}, ${color.s}%, ${color.l}%) 100%)`,
                        }}
                      />

                      {/* Member avatar at top */}
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10">
                        <div
                          className="w-7 h-7 rounded-full border-2 border-white shadow-sm
                            flex items-center justify-center text-xs font-semibold text-white"
                          style={{ backgroundColor: `hsl(${color.h}, ${color.s}%, ${color.l}%)` }}
                        >
                          {member.initials}
                        </div>
                      </div>

                      {/* Events in this lane */}
                      {memberEvents.map((event, eventIdx) => {
                        const topPos = getTimePosition(event.start, startTime, endTime)
                        const duration = (event.end.getTime() - event.start.getTime()) / 3600000
                        const height = Math.max(duration * 64, 28)

                        return (
                          <div
                            key={event.id}
                            className="absolute left-1 right-1 px-2 py-1.5 rounded-xl
                              bg-white/90 backdrop-blur-sm shadow-sm border border-neutral-100
                              animate-event-slide-in cursor-pointer
                              hover:shadow-md hover:border-neutral-200 transition-all"
                            style={{
                              top: `calc(${topPos}% + 20px)`,
                              height,
                              animationDelay: `${200 + memberIdx * 80 + eventIdx * 50}ms`,
                              borderLeftWidth: 3,
                              borderLeftColor: `hsl(${color.h}, ${color.s}%, ${color.l}%)`,
                            }}
                            onClick={() => handleTimeClick(event.start)}
                          >
                            <p className="text-xs font-medium text-neutral-700 truncate leading-tight">
                              {event.title}
                            </p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">
                              {formatHour(event.start)}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>

              {/* Current time indicator */}
              {(() => {
                const now = new Date()
                if (now >= startTime && now <= endTime) {
                  const topPos = getTimePosition(now, startTime, endTime)
                  return (
                    <div
                      className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
                      style={{ top: `${topPos}%` }}
                    >
                      <div className="w-2 h-2 rounded-full bg-danger-500 animate-pulse-soft" />
                      <div className="flex-1 h-px bg-danger-400/60" />
                    </div>
                  )
                }
                return null
              })()}

              {/* Clickable time slots */}
              {hours.map((hour, idx) => (
                <button
                  key={`slot-${idx}`}
                  className="absolute left-0 right-0 h-16 opacity-0 hover:opacity-100
                    transition-opacity cursor-pointer group"
                  style={{ top: idx * 64 }}
                  onClick={() => handleTimeClick(hour)}
                >
                  <div className="absolute inset-x-1 inset-y-1 rounded-xl
                    bg-primary-500/5 border border-primary-200/50 border-dashed
                    flex items-center justify-center">
                    <span className="text-xs font-medium text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      Schedule at {formatHour(hour)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Empty state */}
          {timelineEvents.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center px-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-neutral-100
                  flex items-center justify-center">
                  <svg className="w-6 h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm text-neutral-500">This time slot is open</p>
                <p className="text-xs text-neutral-400 mt-1">Click any time to schedule</p>
              </div>
            </div>
          )}
        </div>

        {/* Convergence legend (if any convergences) */}
        {convergencePoints.length > 0 && (
          <div className="px-5 py-3 border-t border-neutral-100 bg-gradient-to-t from-neutral-50/50 to-transparent">
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-primary-200 to-sage-200" />
              <span>{convergencePoints.length} moment{convergencePoints.length !== 1 ? 's' : ''} together</span>
            </div>
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes stream-flow {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes event-slide-in {
          from {
            opacity: 0;
            transform: translateX(-8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes convergence-bloom {
          from {
            opacity: 0;
            transform: scaleY(0.5);
          }
          to {
            opacity: 1;
            transform: scaleY(1);
          }
        }

        @keyframes convergence-ripple {
          0% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.2;
          }
          100% {
            transform: scale(1);
            opacity: 0.5;
          }
        }

        .animate-stream-flow {
          animation: stream-flow 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }

        .animate-event-slide-in {
          animation: event-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }

        .animate-convergence-bloom {
          animation: convergence-bloom 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
        }

        .animate-convergence-ripple {
          animation: convergence-ripple 3s ease-in-out infinite;
        }
      `}</style>
    </div>,
    document.body
  )
}
