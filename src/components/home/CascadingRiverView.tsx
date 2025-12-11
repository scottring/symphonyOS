import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { EventNote } from '@/hooks/useEventNotes'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'
import { DateNavigator } from '@/components/schedule/DateNavigator'

// =============================================================================
// TYPES
// =============================================================================

interface CascadingRiverViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  onToggleTask: (taskId: string) => void
  onUpdateTask?: (id: string, updates: Partial<Task>) => void
  onPushTask?: (id: string, date: Date) => void
  onDeleteTask?: (id: string) => void
  viewedDate: Date
  onDateChange: (date: Date) => void
  contactsMap?: Map<string, Contact>
  projectsMap?: Map<string, Project>
  eventNotesMap?: Map<string, EventNote>
  familyMembers: FamilyMember[]
  selectedAssignees: string[]
  onAssignTask?: (taskId: string, memberId: string | null) => void
  onAssignEvent?: (eventId: string, memberId: string | null) => void
  onAssignRoutine?: (routineId: string, memberId: string | null) => void
  onCompleteRoutine?: (routineId: string, completed: boolean) => void
  onSkipRoutine?: (routineId: string) => void
  onPushRoutine?: (routineId: string, date: Date) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  onSkipEvent?: (eventId: string) => void
  onPushEvent?: (eventId: string, date: Date) => void
}

interface TimelineEvent {
  id: string
  prefixedId: string // 'task-xxx', 'event-xxx', 'routine-xxx'
  title: string
  startTime: Date
  endTime?: Date
  isAllDay: boolean
  type: 'task' | 'event' | 'routine'
  assignedTo?: string | null
  completed?: boolean
  projectId?: string | null
  contactId?: string | null
}

interface ConvergenceZone {
  startMinutes: number
  endMinutes: number
  memberIds: string[]
  events: TimelineEvent[]
}

// =============================================================================
// CONSTANTS
// =============================================================================

const HOUR_HEIGHT = 80 // pixels per hour - taller for more breathing room
const START_HOUR = 6 // 6 AM
const END_HOUR = 22 // 10 PM
const TOTAL_HOURS = END_HOUR - START_HOUR
const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT

// Stream colors - more saturated versions of family colors for the paths
const STREAM_COLORS: Record<string, { stroke: string; glow: string; fill: string }> = {
  blue: { stroke: 'hsl(210, 70%, 50%)', glow: 'hsl(210, 70%, 50%)', fill: 'hsl(210, 70%, 95%)' },
  purple: { stroke: 'hsl(270, 60%, 55%)', glow: 'hsl(270, 60%, 55%)', fill: 'hsl(270, 60%, 95%)' },
  green: { stroke: 'hsl(152, 50%, 38%)', glow: 'hsl(152, 50%, 38%)', fill: 'hsl(152, 50%, 95%)' },
  orange: { stroke: 'hsl(28, 80%, 50%)', glow: 'hsl(28, 80%, 50%)', fill: 'hsl(28, 80%, 95%)' },
  pink: { stroke: 'hsl(340, 65%, 55%)', glow: 'hsl(340, 65%, 55%)', fill: 'hsl(340, 65%, 95%)' },
  teal: { stroke: 'hsl(175, 55%, 40%)', glow: 'hsl(175, 55%, 40%)', fill: 'hsl(175, 55%, 95%)' },
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function getMinutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function minutesToY(minutes: number): number {
  const startMinutes = START_HOUR * 60
  return ((minutes - startMinutes) / 60) * HOUR_HEIGHT
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const period = hours >= 12 ? 'pm' : 'am'
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  return mins === 0 ? `${displayHour}${period}` : `${displayHour}:${mins.toString().padStart(2, '0')}${period}`
}

function getTimeSection(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

// =============================================================================
// STREAM PATH GENERATOR
// =============================================================================

interface StreamConfig {
  memberId: string
  color: string
  baseX: number
  events: TimelineEvent[]
  convergenceZones: ConvergenceZone[]
}

function generateStreamPath(
  config: StreamConfig,
  _allConfigs: StreamConfig[],
  width: number
): string {
  const { baseX, convergenceZones } = config
  const convergenceX = width / 2

  let path = `M ${baseX} 0`
  let currentY = 0

  const sortedZones = [...convergenceZones]
    .filter(z => z.memberIds.includes(config.memberId))
    .sort((a, b) => a.startMinutes - b.startMinutes)

  for (const zone of sortedZones) {
    const zoneStartY = minutesToY(zone.startMinutes)
    const zoneEndY = minutesToY(zone.endMinutes)

    const approachStartY = Math.max(currentY, zoneStartY - 50)

    if (approachStartY > currentY) {
      path += ` L ${baseX} ${approachStartY}`
    }

    const cpY1 = approachStartY + (zoneStartY - approachStartY) * 0.5
    path += ` C ${baseX} ${cpY1}, ${convergenceX} ${cpY1}, ${convergenceX} ${zoneStartY}`

    path += ` L ${convergenceX} ${zoneEndY}`

    const exitY = zoneEndY + 50
    const cpY2 = zoneEndY + (exitY - zoneEndY) * 0.5
    path += ` C ${convergenceX} ${cpY2}, ${baseX} ${cpY2}, ${baseX} ${exitY}`

    currentY = exitY
  }

  if (currentY < TIMELINE_HEIGHT) {
    path += ` L ${baseX} ${TIMELINE_HEIGHT}`
  }

  return path
}

// =============================================================================
// TIME MARKERS
// =============================================================================

interface TimeMarkersProps {
  currentMinutes: number
  width: number
}

function TimeMarkers({ currentMinutes, width }: TimeMarkersProps) {
  const markers: { hour: number; label: string; section: 'morning' | 'afternoon' | 'evening' }[] = []

  for (let hour = START_HOUR; hour <= END_HOUR; hour += 2) {
    markers.push({
      hour,
      label: formatTime(hour * 60),
      section: getTimeSection(hour),
    })
  }

  const currentY = minutesToY(currentMinutes)
  const isCurrentTimeVisible = currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60

  return (
    <>
      {markers.map(({ hour, label, section }, i) => {
        const y = minutesToY(hour * 60)
        const isFirst = i === 0
        const prevSection = i > 0 ? markers[i - 1].section : null
        const showSectionLabel = prevSection !== section

        return (
          <g key={hour}>
            {showSectionLabel && !isFirst && (
              <text
                x={12}
                y={y - 24}
                className="fill-neutral-400 uppercase tracking-widest"
                style={{ fontSize: '10px', fontWeight: 600 }}
              >
                {section}
              </text>
            )}

            <text
              x={12}
              y={y + 4}
              className="fill-neutral-500"
              style={{ fontSize: '13px', fontFamily: 'var(--font-family-display)', fontStyle: 'italic' }}
            >
              {label}
            </text>

            <line
              x1={70}
              y1={y}
              x2={width - 20}
              y2={y}
              stroke="hsl(38, 25%, 90%)"
              strokeWidth={1}
              strokeDasharray={hour % 4 === 0 ? "none" : "4 4"}
            />
          </g>
        )
      })}

      {isCurrentTimeVisible && (
        <g className="current-time-indicator">
          <line
            x1={60}
            y1={currentY}
            x2={width - 20}
            y2={currentY}
            stroke="hsl(152, 50%, 45%)"
            strokeWidth={2}
            style={{ filter: 'drop-shadow(0 0 6px hsl(152, 50%, 45%))' }}
          />

          <rect
            x={8}
            y={currentY - 12}
            width={48}
            height={24}
            rx={12}
            fill="hsl(152, 50%, 32%)"
          />
          <text
            x={32}
            y={currentY + 4}
            textAnchor="middle"
            className="fill-white"
            style={{ fontSize: '11px', fontWeight: 600 }}
          >
            {formatTime(currentMinutes)}
          </text>

          <circle
            cx={64}
            cy={currentY}
            r={6}
            fill="hsl(152, 50%, 32%)"
            style={{ filter: 'drop-shadow(0 0 8px hsl(152, 50%, 45%))' }}
          />
        </g>
      )}
    </>
  )
}

// =============================================================================
// EVENT CARD (Interactive)
// =============================================================================

interface EventCardProps {
  event: TimelineEvent
  memberColor: string
  x: number
  y: number
  isConverged: boolean
  isSelected: boolean
  onSelect: () => void
  onToggleComplete: () => void
  projectName?: string
  contactName?: string
}

function EventCard({
  event,
  memberColor,
  x,
  y,
  isConverged,
  isSelected,
  onSelect,
  onToggleComplete,
  projectName,
  contactName,
}: EventCardProps) {
  const colors = STREAM_COLORS[memberColor] || STREAM_COLORS.blue

  return (
    <g transform={`translate(${x}, ${y})`}>
      <foreignObject x={0} y={-20} width={260} height={56}>
        <div
          onClick={onSelect}
          className={`
            px-3 py-2 rounded-xl border backdrop-blur-sm transition-all duration-200
            cursor-pointer group
            ${isSelected ? 'ring-2 ring-primary-400 ring-offset-2' : ''}
            ${event.completed ? 'opacity-60' : ''}
            ${isConverged ? 'bg-primary-50/95 border-primary-200' : 'bg-white/95 border-neutral-200'}
          `}
          style={{
            boxShadow: isConverged
              ? `0 4px 12px ${colors.glow}25, 0 0 0 1px ${colors.glow}15`
              : '0 2px 8px hsl(32, 20%, 20%, 0.1)',
          }}
        >
          <div className="flex items-start gap-2">
            {/* Checkbox */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleComplete()
              }}
              className={`
                mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center
                transition-all duration-200
                ${event.completed
                  ? 'bg-primary-500 border-primary-500'
                  : 'border-neutral-300 hover:border-primary-400'
                }
              `}
            >
              {event.completed && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${event.completed ? 'line-through text-neutral-500' : 'text-neutral-800'}`}>
                {event.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {event.startTime && !event.isAllDay && (
                  <span className="text-xs text-neutral-500" style={{ fontFamily: 'var(--font-family-display)', fontStyle: 'italic' }}>
                    {formatTime(getMinutesFromMidnight(event.startTime))}
                  </span>
                )}
                {projectName && (
                  <span className="text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-md truncate max-w-[100px]">
                    {projectName}
                  </span>
                )}
                {contactName && (
                  <span className="text-xs text-neutral-500 truncate">@{contactName}</span>
                )}
              </div>
            </div>

            {/* Type indicator */}
            <div className={`
              w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
              ${event.type === 'routine' ? 'bg-amber-100 text-amber-600' :
                event.type === 'event' ? 'bg-blue-100 text-blue-600' :
                'bg-neutral-100 text-neutral-500'}
            `}>
              {event.type === 'routine' ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : event.type === 'event' ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )}
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  )
}

// =============================================================================
// CONVERGENCE ZONE DISPLAY
// =============================================================================

interface ConvergenceZoneDisplayProps {
  zone: ConvergenceZone
  members: FamilyMember[]
  centerX: number
}

function ConvergenceZoneDisplay({ zone, members, centerX }: ConvergenceZoneDisplayProps) {
  const startY = minutesToY(zone.startMinutes)
  const endY = minutesToY(zone.endMinutes)
  const height = endY - startY

  return (
    <g className="convergence-zone">
      <defs>
        <radialGradient id={`convergence-glow-${zone.startMinutes}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(152, 45%, 50%)" stopOpacity={0.2} />
          <stop offset="70%" stopColor="hsl(152, 45%, 50%)" stopOpacity={0.05} />
          <stop offset="100%" stopColor="hsl(152, 45%, 50%)" stopOpacity={0} />
        </radialGradient>
      </defs>

      <ellipse
        cx={centerX}
        cy={startY + height / 2}
        rx={80}
        ry={height / 2 + 30}
        fill={`url(#convergence-glow-${zone.startMinutes})`}
      />

      {/* Stacked avatars at convergence */}
      <foreignObject x={centerX - 50} y={startY + height / 2 - 18} width={100} height={36}>
        <div className="flex items-center justify-center -space-x-2">
          {zone.memberIds.slice(0, 4).map((memberId, i) => {
            const member = members.find(m => m.id === memberId)
            if (!member) return null
            const colorKey = (member.color || 'blue') as FamilyMemberColor
            const colors = FAMILY_COLORS[colorKey] || FAMILY_COLORS.blue

            return (
              <div
                key={memberId}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold
                           border-2 border-white shadow-md ${colors.bg} ${colors.text}`}
                style={{ zIndex: 10 - i }}
              >
                {member.initials || member.name.charAt(0)}
              </div>
            )
          })}
          {zone.memberIds.length > 4 && (
            <div className="w-8 h-8 rounded-full bg-neutral-200 border-2 border-white flex items-center justify-center text-xs font-medium text-neutral-600">
              +{zone.memberIds.length - 4}
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CascadingRiverView({
  tasks,
  events,
  routines,
  dateInstances,
  selectedItemId,
  onSelectItem,
  onToggleTask,
  viewedDate,
  onDateChange,
  contactsMap,
  projectsMap,
  eventNotesMap,
  familyMembers,
  selectedAssignees,
  onCompleteRoutine,
  onCompleteEvent,
}: CascadingRiverViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgWidth, setSvgWidth] = useState(800)
  const [isAnimating, setIsAnimating] = useState(true)

  // Track container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setSvgWidth(containerRef.current.clientWidth)
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Animation on mount/selection change
  useEffect(() => {
    setIsAnimating(true)
    const timer = setTimeout(() => setIsAnimating(false), 1200)
    return () => clearTimeout(timer)
  }, [selectedAssignees])

  const currentMinutes = getMinutesFromMidnight(new Date())

  // Build instance status maps
  const routineStatusMap = useMemo(() => {
    const map = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'routine') {
        map.set(instance.entity_id, instance)
      }
    }
    return map
  }, [dateInstances])

  const eventStatusMap = useMemo(() => {
    const map = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'calendar_event') {
        map.set(instance.entity_id, instance)
      }
    }
    return map
  }, [dateInstances])

  // Process all items into timeline events
  const timelineEvents = useMemo(() => {
    const result: TimelineEvent[] = []
    const startOfDay = new Date(viewedDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(viewedDate)
    endOfDay.setHours(23, 59, 59, 999)

    // Tasks
    for (const task of tasks) {
      if (!task.assignedTo || !selectedAssignees.includes(task.assignedTo)) continue
      if (!task.scheduledFor) continue

      const taskDate = new Date(task.scheduledFor)
      if (taskDate < startOfDay || taskDate > endOfDay) continue
      if (task.isAllDay) continue

      result.push({
        id: task.id,
        prefixedId: `task-${task.id}`,
        title: task.title,
        startTime: taskDate,
        isAllDay: false,
        type: 'task',
        assignedTo: task.assignedTo,
        completed: task.completed,
        projectId: task.projectId,
        contactId: task.contactId,
      })
    }

    // Calendar events
    for (const event of events) {
      const startStr = event.start_time || event.startTime
      const isAllDay = event.all_day || event.allDay
      if (!startStr || isAllDay) continue

      const startDate = new Date(startStr)
      if (startDate < startOfDay || startDate > endOfDay) continue

      const eventId = event.google_event_id || event.id
      const eventNote = eventNotesMap?.get(eventId)
      const assignedTo = eventNote?.assignedTo

      if (!assignedTo || !selectedAssignees.includes(assignedTo)) continue

      const instance = eventStatusMap.get(eventId)
      const endStr = event.end_time || event.endTime

      result.push({
        id: eventId,
        prefixedId: `event-${eventId}`,
        title: event.title,
        startTime: startDate,
        endTime: endStr ? new Date(endStr) : undefined,
        isAllDay: false,
        type: 'event',
        assignedTo,
        completed: instance?.status === 'completed',
      })
    }

    // Routines
    for (const routine of routines) {
      if (!routine.assigned_to || !selectedAssignees.includes(routine.assigned_to)) continue
      if (routine.show_on_timeline === false) continue
      if (!routine.time_of_day) continue

      const [hours, minutes] = routine.time_of_day.split(':').map(Number)
      const routineTime = new Date(viewedDate)
      routineTime.setHours(hours, minutes, 0, 0)

      const instance = routineStatusMap.get(routine.id)

      result.push({
        id: routine.id,
        prefixedId: `routine-${routine.id}`,
        title: routine.name,
        startTime: routineTime,
        isAllDay: false,
        type: 'routine',
        assignedTo: routine.assigned_to,
        completed: instance?.status === 'completed',
      })
    }

    return result.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  }, [tasks, events, routines, viewedDate, selectedAssignees, eventNotesMap, routineStatusMap, eventStatusMap])

  // Detect convergence zones
  const convergenceZones = useMemo(() => {
    const zones: ConvergenceZone[] = []
    const buckets = new Map<number, TimelineEvent[]>()

    for (const event of timelineEvents) {
      const bucket = Math.floor(getMinutesFromMidnight(event.startTime) / 30) * 30
      if (!buckets.has(bucket)) {
        buckets.set(bucket, [])
      }
      buckets.get(bucket)!.push(event)
    }

    for (const [bucket, bucketEvents] of buckets) {
      const memberIds = new Set<string>()

      for (const event of bucketEvents) {
        if (event.assignedTo && selectedAssignees.includes(event.assignedTo)) {
          memberIds.add(event.assignedTo)
        }
      }

      if (memberIds.size >= 2) {
        zones.push({
          startMinutes: bucket,
          endMinutes: bucket + 30,
          memberIds: Array.from(memberIds),
          events: bucketEvents,
        })
      }
    }

    return zones
  }, [timelineEvents, selectedAssignees])

  // Selected members
  const selectedMembers = useMemo(() => {
    return familyMembers.filter(m => selectedAssignees.includes(m.id))
  }, [familyMembers, selectedAssignees])

  // Stream configurations
  const streamConfigs = useMemo(() => {
    const usableWidth = svgWidth - 120
    const spacing = usableWidth / (selectedMembers.length + 1)

    return selectedMembers.map((member, i): StreamConfig => ({
      memberId: member.id,
      color: member.color || 'blue',
      baseX: 80 + spacing * (i + 1),
      events: timelineEvents.filter(e => e.assignedTo === member.id),
      convergenceZones,
    }))
  }, [selectedMembers, timelineEvents, convergenceZones, svgWidth])

  // Handle toggle complete
  const handleToggleComplete = useCallback((event: TimelineEvent) => {
    if (event.type === 'task') {
      onToggleTask(event.id)
    } else if (event.type === 'routine' && onCompleteRoutine) {
      onCompleteRoutine(event.id, !event.completed)
    } else if (event.type === 'event' && onCompleteEvent) {
      onCompleteEvent(event.id, !event.completed)
    }
  }, [onToggleTask, onCompleteRoutine, onCompleteEvent])

  // Check if today
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      viewedDate.getFullYear() === today.getFullYear() &&
      viewedDate.getMonth() === today.getMonth() &&
      viewedDate.getDate() === today.getDate()
    )
  }, [viewedDate])

  const formatDate = () => {
    return viewedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  // Card placement: position cards next to their stream
  const getCardX = (event: TimelineEvent): number => {
    const config = streamConfigs.find(c => c.memberId === event.assignedTo)
    if (!config) return 100
    // Place card to the right of the stream line
    return config.baseX + 20
  }

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl font-semibold text-neutral-900">
            {isToday ? `Today is ${formatDate()}` : formatDate()}
          </h2>
          <DateNavigator date={viewedDate} onDateChange={onDateChange} showTodayButton={!isToday} />
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Viewing {selectedMembers.map(m => m.name).join(' & ')}
        </p>
      </div>

      {/* Timeline */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <svg
          ref={svgRef}
          className="w-full"
          style={{ height: TIMELINE_HEIGHT + 60, minWidth: 600 }}
          viewBox={`0 0 ${svgWidth} ${TIMELINE_HEIGHT + 60}`}
          preserveAspectRatio="xMidYMin meet"
        >
          {/* Gradient definitions */}
          <defs>
            {streamConfigs.map(config => {
              const colors = STREAM_COLORS[config.color] || STREAM_COLORS.blue
              return (
                <linearGradient key={`grad-${config.memberId}`} id={`stream-grad-${config.memberId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={colors.stroke} stopOpacity={0.1} />
                  <stop offset="50%" stopColor={colors.stroke} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={colors.stroke} stopOpacity={0.1} />
                </linearGradient>
              )
            })}
          </defs>

          <g transform="translate(0, 30)">
            {/* Time markers */}
            <TimeMarkers currentMinutes={currentMinutes} width={svgWidth} />

            {/* Convergence zones */}
            {convergenceZones.map(zone => (
              <ConvergenceZoneDisplay
                key={`zone-${zone.startMinutes}`}
                zone={zone}
                members={familyMembers}
                centerX={svgWidth / 2}
              />
            ))}

            {/* Stream paths */}
            {streamConfigs.map((config, i) => {
              const colors = STREAM_COLORS[config.color] || STREAM_COLORS.blue
              const path = generateStreamPath(config, streamConfigs, svgWidth)
              const member = selectedMembers.find(m => m.id === config.memberId)
              const memberColors = FAMILY_COLORS[(config.color as FamilyMemberColor) || 'blue'] || FAMILY_COLORS.blue

              return (
                <g key={config.memberId}>
                  {/* Glow path */}
                  <path
                    d={path}
                    fill="none"
                    stroke={colors.glow}
                    strokeWidth={12}
                    strokeOpacity={0.12}
                    strokeLinecap="round"
                    style={{ filter: 'blur(6px)' }}
                  />

                  {/* Main stream path */}
                  <path
                    d={path}
                    fill="none"
                    stroke={colors.stroke}
                    strokeWidth={4}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                    style={{
                      strokeDasharray: isAnimating ? TIMELINE_HEIGHT * 2 : 0,
                      strokeDashoffset: isAnimating ? TIMELINE_HEIGHT * 2 : 0,
                      animation: isAnimating ? `stream-draw 1s ease-out ${i * 0.12}s forwards` : 'none',
                    }}
                  />

                  {/* Member avatar at top */}
                  <foreignObject x={config.baseX - 20} y={-12} width={40} height={40}>
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                                 border-3 border-white shadow-lg ${memberColors.bg} ${memberColors.text}`}
                      style={{
                        opacity: isAnimating ? 0 : 1,
                        animation: isAnimating ? `fade-in-scale 0.4s ease-out ${0.6 + i * 0.1}s forwards` : 'none',
                      }}
                    >
                      {member?.initials || member?.name.charAt(0)}
                    </div>
                  </foreignObject>
                </g>
              )
            })}

            {/* Event cards */}
            {timelineEvents.map(event => {
              const y = minutesToY(getMinutesFromMidnight(event.startTime))
              const x = getCardX(event)
              const member = familyMembers.find(m => m.id === event.assignedTo)
              const memberColor = member?.color || 'blue'
              const isConverged = convergenceZones.some(
                z => z.events.some(e => e.id === event.id) && z.memberIds.length >= 2
              )

              return (
                <EventCard
                  key={event.prefixedId}
                  event={event}
                  memberColor={memberColor}
                  x={x}
                  y={y}
                  isConverged={isConverged}
                  isSelected={selectedItemId === event.prefixedId}
                  onSelect={() => onSelectItem(event.prefixedId)}
                  onToggleComplete={() => handleToggleComplete(event)}
                  projectName={event.projectId ? projectsMap?.get(event.projectId)?.name : undefined}
                  contactName={event.contactId ? contactsMap?.get(event.contactId)?.name : undefined}
                />
              )
            })}
          </g>
        </svg>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes stream-draw {
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes fade-in-scale {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  )
}
