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
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'

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
  // Reschedule handlers for drag-and-drop
  onRescheduleTask?: (taskId: string, newTime: Date) => void
  onRescheduleRoutine?: (routineId: string, newTime: Date) => void
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
  assignedToAll?: string[] // For shared items (multiple assignees)
  completed?: boolean
  projectId?: string | null
  contactId?: string | null
  isDraggable: boolean // Tasks and routines are draggable, events are not
  isShared?: boolean // True if assigned to multiple people
}

interface ConvergenceZone {
  startMinutes: number
  endMinutes: number
  memberIds: string[]
  events: TimelineEvent[]
}

interface FreeTimeZone {
  startMinutes: number
  endMinutes: number
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
// EVENT CARD CONTENT (Shared between regular and draggable)
// =============================================================================

interface EventCardContentProps {
  event: TimelineEvent
  memberColor: string
  isConverged: boolean
  isSelected: boolean
  isDragging?: boolean
  onSelect: () => void
  onToggleComplete: () => void
  projectName?: string
  contactName?: string
}

function EventCardContent({
  event,
  memberColor,
  isConverged,
  isSelected,
  isDragging,
  onSelect,
  onToggleComplete,
  projectName,
  contactName,
}: EventCardContentProps) {
  const colors = STREAM_COLORS[memberColor] || STREAM_COLORS.blue

  return (
    <div
      onClick={onSelect}
      className={`
        px-3 py-2 rounded-xl border backdrop-blur-sm transition-all duration-200
        ${event.isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} group
        ${isSelected ? 'ring-2 ring-primary-400 ring-offset-2' : ''}
        ${event.completed ? 'opacity-60' : ''}
        ${isConverged ? 'bg-primary-50/95 border-primary-200' : 'bg-white/95 border-neutral-200'}
        ${isDragging ? 'shadow-2xl scale-105 ring-2 ring-primary-400' : ''}
      `}
      style={{
        boxShadow: isDragging
          ? '0 20px 40px rgba(0,0,0,0.2)'
          : isConverged
          ? `0 4px 12px ${colors.glow}25, 0 0 0 1px ${colors.glow}15`
          : '0 2px 8px hsl(32, 20%, 20%, 0.1)',
      }}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle indicator for draggable items */}
        {event.isDraggable && (
          <div className="flex flex-col gap-0.5 mr-1 opacity-30 group-hover:opacity-60 transition-opacity">
            <div className="w-1 h-1 rounded-full bg-neutral-400" />
            <div className="w-1 h-1 rounded-full bg-neutral-400" />
            <div className="w-1 h-1 rounded-full bg-neutral-400" />
          </div>
        )}

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

        {/* Shared indicator (chain icon) */}
        {event.isShared && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-100 text-purple-600"
            title={`Shared with ${(event.assignedToAll?.length || 0)} people`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
        )}

        {/* Type indicator */}
        <div className={`
          w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
          ${event.type === 'routine' ? 'bg-amber-100 text-amber-600' :
            event.type === 'event' ? 'bg-blue-100 text-blue-600' :
            'bg-neutral-100 text-neutral-500'}
        `}>
          {event.type === 'routine' ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : event.type === 'event' ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// DRAGGABLE EVENT CARD
// =============================================================================

interface DraggableEventCardProps {
  event: TimelineEvent
  memberColor: string
  isConverged: boolean
  isSelected: boolean
  onSelect: () => void
  onToggleComplete: () => void
  projectName?: string
  contactName?: string
}

function DraggableEventCard({
  event,
  memberColor,
  isConverged,
  isSelected,
  onSelect,
  onToggleComplete,
  projectName,
  contactName,
}: DraggableEventCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.prefixedId,
    data: { event },
    disabled: !event.isDraggable,
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 1000 : undefined,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(event.isDraggable ? { ...listeners, ...attributes } : {})}
    >
      <EventCardContent
        event={event}
        memberColor={memberColor}
        isConverged={isConverged}
        isSelected={isSelected}
        isDragging={isDragging}
        onSelect={onSelect}
        onToggleComplete={onToggleComplete}
        projectName={projectName}
        contactName={contactName}
      />
    </div>
  )
}

// =============================================================================
// COLUMN DROP ZONE (for reassigning items between members)
// =============================================================================

interface ColumnDropZoneProps {
  memberId: string
  memberName: string
  memberColor: string
  left: number
  width: number
  height: number
  isDragging: boolean
}

function ColumnDropZone({ memberId, memberName, memberColor, left, width, height, isDragging }: ColumnDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${memberId}`,
    data: { memberId, type: 'column' },
  })

  const colors = STREAM_COLORS[memberColor] || STREAM_COLORS.blue

  if (!isDragging) return null

  return (
    <div
      ref={setNodeRef}
      className={`
        absolute top-[30px] transition-all duration-200 rounded-xl
      `}
      style={{
        left,
        width,
        height: height - 30,
        backgroundColor: isOver ? colors.fill : 'transparent',
        outline: isOver ? `2px solid ${colors.stroke}` : 'none',
        outlineOffset: isOver ? '2px' : '0',
      }}
    >
      {isOver && (
        <div className="absolute inset-x-0 top-4 flex justify-center">
          <span
            className="text-sm font-semibold px-3 py-1.5 rounded-full shadow-lg"
            style={{
              backgroundColor: colors.stroke,
              color: 'white',
            }}
          >
            Assign to {memberName}
          </span>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// TIME SLOT DROP ZONE (for rescheduling within a column)
// =============================================================================

const SLOT_HEIGHT = HOUR_HEIGHT / 4 // 15-minute slots = 1/4 of hour height

interface TimeSlotDropZoneProps {
  minutes: number // Minutes from midnight (e.g., 540 = 9:00 AM)
  memberId: string
  left: number
  width: number
  top: number
  isDragging: boolean
}

function TimeSlotDropZone({ minutes, memberId, left, width, top, isDragging }: TimeSlotDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `timeslot-${memberId}-${minutes}`,
    data: { minutes, memberId, type: 'timeslot' },
  })

  if (!isDragging) return null

  return (
    <div
      ref={setNodeRef}
      className={`
        absolute transition-all duration-150
        ${isOver
          ? 'bg-primary-100/80 border-2 border-dashed border-primary-400'
          : 'border border-dashed border-transparent hover:border-neutral-200'
        }
        rounded-lg
      `}
      style={{
        left: left + 4,
        width: width - 8,
        top: top + 30,
        height: SLOT_HEIGHT,
      }}
    >
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-primary-600 bg-white/90 px-2 py-1 rounded-full shadow-sm">
            {formatTime(minutes)}
          </span>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// FREE TIME ZONE DISPLAY
// =============================================================================

interface FreeTimeZoneDisplayProps {
  zone: FreeTimeZone
  width: number
}

function FreeTimeZoneDisplay({ zone, width }: FreeTimeZoneDisplayProps) {
  const startY = minutesToY(zone.startMinutes)
  const endY = minutesToY(zone.endMinutes)
  const height = endY - startY

  // Only show label for zones that are at least 1 hour (60 minutes)
  const showLabel = zone.endMinutes - zone.startMinutes >= 60

  return (
    <g className="free-time-zone">
      {/* Subtle background stripe */}
      <rect
        x={70}
        y={startY}
        width={width - 90}
        height={height}
        fill="hsl(152, 40%, 96%)"
        rx={4}
      />

      {/* Dashed border on sides */}
      <line
        x1={70}
        y1={startY}
        x2={70}
        y2={endY}
        stroke="hsl(152, 35%, 80%)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <line
        x1={width - 20}
        y1={startY}
        x2={width - 20}
        y2={endY}
        stroke="hsl(152, 35%, 80%)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* "All free" label - only for larger zones */}
      {showLabel && (
        <foreignObject x={width - 90} y={startY + height / 2 - 12} width={70} height={24}>
          <div className="flex items-center justify-end h-full">
            <span className="text-[10px] font-medium text-primary-500/70 bg-primary-50/80 px-2 py-0.5 rounded-full">
              All free
            </span>
          </div>
        </foreignObject>
      )}
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
  onUpdateTask,
  viewedDate,
  onDateChange,
  contactsMap,
  projectsMap,
  eventNotesMap,
  familyMembers,
  selectedAssignees,
  onAssignTask,
  onAssignRoutine,
  onCompleteRoutine,
  onCompleteEvent,
  onPushRoutine,
  onRescheduleTask,
  onRescheduleRoutine,
}: CascadingRiverViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgWidth, setSvgWidth] = useState(800)
  const [isAnimating, setIsAnimating] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  // DnD sensors - require a small movement to start dragging (prevents accidental drags)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

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

    // Tasks - draggable
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
        isDraggable: true, // Tasks can be dragged to reschedule
      })
    }

    // Calendar events - NOT draggable (from Google Calendar)
    // Create duplicate entries for shared events (one per assigned member)
    for (const event of events) {
      const startStr = event.start_time || event.startTime
      const isAllDay = event.all_day || event.allDay
      if (!startStr) continue // Skip if no start time

      const startDate = new Date(startStr)
      if (startDate < startOfDay || startDate > endOfDay) continue

      const eventId = event.google_event_id || event.id
      const eventNote = eventNotesMap?.get(eventId)
      const assignedTo = eventNote?.assignedTo
      const assignedToAll = eventNote?.assignedToAll || []

      const instance = eventStatusMap.get(eventId)
      const endStr = event.end_time || event.endTime

      // Determine all members this event should show for
      const relevantMembers: string[] = []

      // Single assignment
      if (assignedTo && selectedAssignees.includes(assignedTo)) {
        relevantMembers.push(assignedTo)
      }

      // Multi-assignment (shared event)
      for (const memberId of assignedToAll) {
        if (selectedAssignees.includes(memberId) && !relevantMembers.includes(memberId)) {
          relevantMembers.push(memberId)
        }
      }

      const isShared = relevantMembers.length > 1 || assignedToAll.length > 1
      const isUnassigned = relevantMembers.length === 0

      // Create an entry for each relevant member (or one unassigned entry)
      if (isUnassigned) {
        // Unassigned events show once in center
        result.push({
          id: eventId,
          prefixedId: `event-${eventId}`,
          title: event.title,
          startTime: startDate,
          endTime: endStr ? new Date(endStr) : undefined,
          isAllDay: isAllDay || false,
          type: 'event',
          assignedTo: null,
          assignedToAll: [],
          completed: instance?.status === 'completed',
          isDraggable: false,
          isShared: false,
        })
      } else {
        // Create duplicate for each assigned member
        for (const memberId of relevantMembers) {
          result.push({
            id: eventId,
            prefixedId: `event-${eventId}-${memberId}`, // Unique ID per member
            title: event.title,
            startTime: startDate,
            endTime: endStr ? new Date(endStr) : undefined,
            isAllDay: isAllDay || false,
            type: 'event',
            assignedTo: memberId,
            assignedToAll: relevantMembers,
            completed: instance?.status === 'completed',
            isDraggable: false,
            isShared,
          })
        }
      }
    }

    // Routines - draggable
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
        isDraggable: true, // Routines can be dragged to reschedule (for today only)
      })
    }

    return result.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  }, [tasks, events, routines, viewedDate, selectedAssignees, eventNotesMap, routineStatusMap, eventStatusMap])

  // Detect convergence zones - only for SHARED events (same event assigned to multiple people)
  // This creates the subway map effect where lines merge when family members are truly together
  const convergenceZones = useMemo(() => {
    const zones: ConvergenceZone[] = []

    // Group events by their ID to find shared events
    const eventGroups = new Map<string, { event: TimelineEvent; memberIds: Set<string> }>()

    for (const event of timelineEvents) {
      if (!event.assignedTo) continue

      // For shared events, multiple timeline entries will have the same base event ID
      // We need to check assignedToAll from eventNotesMap
      const eventId = event.id

      if (!eventGroups.has(eventId)) {
        eventGroups.set(eventId, { event, memberIds: new Set() })
      }
      eventGroups.get(eventId)!.memberIds.add(event.assignedTo)
    }

    // Also check eventNotesMap for multi-assignment (assignedToAll)
    if (eventNotesMap) {
      for (const [eventId, note] of eventNotesMap) {
        if (note.assignedToAll && note.assignedToAll.length >= 2) {
          // Find the corresponding timeline event
          const timelineEvent = timelineEvents.find(e => e.id === eventId)
          if (timelineEvent) {
            const relevantMembers = note.assignedToAll.filter(id => selectedAssignees.includes(id))
            if (relevantMembers.length >= 2) {
              const bucket = Math.floor(getMinutesFromMidnight(timelineEvent.startTime) / 30) * 30
              zones.push({
                startMinutes: bucket,
                endMinutes: bucket + 30,
                memberIds: relevantMembers,
                events: [timelineEvent],
              })
            }
          }
        }
      }
    }

    return zones
  }, [timelineEvents, selectedAssignees, eventNotesMap])

  // Detect "all free" time zones - periods when all selected members have no events
  const freeTimeZones = useMemo(() => {
    if (selectedAssignees.length < 2) return [] // Need 2+ people to show "all free"

    const zones: FreeTimeZone[] = []
    const BUCKET_SIZE = 30 // 30-minute buckets

    // Build a map of which members are busy at each time bucket
    const busyBuckets = new Map<number, Set<string>>()

    for (const event of timelineEvents) {
      if (!event.assignedTo) continue

      const startBucket = Math.floor(getMinutesFromMidnight(event.startTime) / BUCKET_SIZE) * BUCKET_SIZE
      // If event has end time, mark all buckets until end as busy
      const endMinutes = event.endTime
        ? getMinutesFromMidnight(event.endTime)
        : startBucket + BUCKET_SIZE // Default to single bucket

      for (let bucket = startBucket; bucket < endMinutes; bucket += BUCKET_SIZE) {
        if (!busyBuckets.has(bucket)) {
          busyBuckets.set(bucket, new Set())
        }
        busyBuckets.get(bucket)!.add(event.assignedTo)
      }
    }

    // Find buckets where NO selected members are busy
    let currentZoneStart: number | null = null

    for (let bucket = START_HOUR * 60; bucket < END_HOUR * 60; bucket += BUCKET_SIZE) {
      const busyMembers = busyBuckets.get(bucket) || new Set()
      const allFree = selectedAssignees.every(id => !busyMembers.has(id))

      if (allFree) {
        if (currentZoneStart === null) {
          currentZoneStart = bucket
        }
      } else {
        if (currentZoneStart !== null) {
          // End the current free zone
          zones.push({
            startMinutes: currentZoneStart,
            endMinutes: bucket,
          })
          currentZoneStart = null
        }
      }
    }

    // Close any open zone at end of day
    if (currentZoneStart !== null) {
      zones.push({
        startMinutes: currentZoneStart,
        endMinutes: END_HOUR * 60,
      })
    }

    return zones
  }, [timelineEvents, selectedAssignees])

  // Selected members
  const selectedMembers = useMemo(() => {
    return familyMembers.filter(m => selectedAssignees.includes(m.id))
  }, [familyMembers, selectedAssignees])

  // Stream/column configurations with boundaries for drag-drop
  const streamConfigs = useMemo(() => {
    const leftMargin = 80
    const rightMargin = 20
    const usableWidth = svgWidth - leftMargin - rightMargin
    const columnWidth = usableWidth / Math.max(selectedMembers.length, 1)

    return selectedMembers.map((member, i): StreamConfig & { columnLeft: number; columnWidth: number } => ({
      memberId: member.id,
      color: member.color || 'blue',
      baseX: leftMargin + columnWidth * i + columnWidth / 2, // Center of column
      columnLeft: leftMargin + columnWidth * i,
      columnWidth,
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

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])


  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const draggedItem = timelineEvents.find(e => e.prefixedId === active.id)
    if (!draggedItem || !draggedItem.isDraggable) return

    const overData = over.data.current as { type?: string; memberId?: string; minutes?: number } | undefined

    // Handle column drop (reassignment)
    if (overData?.type === 'column' && overData.memberId) {
      const newMemberId = overData.memberId

      // Only reassign if dropping on a different member
      if (newMemberId !== draggedItem.assignedTo) {
        if (draggedItem.type === 'task' && onAssignTask) {
          onAssignTask(draggedItem.id, newMemberId)
        } else if (draggedItem.type === 'routine' && onAssignRoutine) {
          onAssignRoutine(draggedItem.id, newMemberId)
        }
      }
      return
    }

    // Handle time slot drop (rescheduling + optional reassignment)
    if (overData?.type === 'timeslot' && overData.minutes !== undefined) {
      const minutes = overData.minutes
      const newTime = new Date(viewedDate)
      newTime.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)

      // Check if also reassigning (dropped in different member's column)
      const newMemberId = overData.memberId
      const isReassigning = newMemberId && newMemberId !== draggedItem.assignedTo

      if (draggedItem.type === 'task') {
        // Reassign if needed
        if (isReassigning && onAssignTask) {
          onAssignTask(draggedItem.id, newMemberId)
        }
        // Reschedule
        if (onRescheduleTask) {
          onRescheduleTask(draggedItem.id, newTime)
        } else if (onUpdateTask) {
          onUpdateTask(draggedItem.id, { scheduledFor: newTime })
        }
      } else if (draggedItem.type === 'routine') {
        // Reassign if needed
        if (isReassigning && onAssignRoutine) {
          onAssignRoutine(draggedItem.id, newMemberId)
        }
        // Reschedule
        if (onRescheduleRoutine) {
          onRescheduleRoutine(draggedItem.id, newTime)
        } else if (onPushRoutine) {
          onPushRoutine(draggedItem.id, newTime)
        }
      }
    }
  }, [timelineEvents, viewedDate, onRescheduleTask, onRescheduleRoutine, onUpdateTask, onPushRoutine, onAssignTask, onAssignRoutine])

  // Get the currently dragged item for overlay
  const activeItem = useMemo(() => {
    if (!activeId) return null
    return timelineEvents.find(e => e.prefixedId === activeId) || null
  }, [activeId, timelineEvents])

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

  // Card placement: fit cards within their column with padding
  const CARD_PADDING = 8 // Padding on each side of card within column

  const getCardLayout = (event: TimelineEvent): { x: number; width: number } => {
    // Unassigned events (calendar events without assignment) go in the center
    if (!event.assignedTo) {
      const centerWidth = Math.min(200, svgWidth / 3)
      return {
        x: svgWidth / 2 - centerWidth / 2,
        width: centerWidth,
      }
    }
    const config = streamConfigs.find(c => c.memberId === event.assignedTo)
    if (!config) {
      return { x: svgWidth / 2 - 100, width: 200 }
    }
    // Card fills the column with padding
    return {
      x: config.columnLeft + CARD_PADDING,
      width: config.columnWidth - CARD_PADDING * 2,
    }
  }

  // Calculate duration in pixels for multi-hour events
  const getEventDuration = (event: TimelineEvent): number | null => {
    if (!event.endTime || event.isAllDay) return null
    const startMinutes = getMinutesFromMidnight(event.startTime)
    const endMinutes = getMinutesFromMidnight(event.endTime)
    const durationMinutes = endMinutes - startMinutes
    if (durationMinutes <= 30) return null // Don't show line for short events
    return (durationMinutes / 60) * HOUR_HEIGHT
  }

  // Generate time slot drop zones for dragging (15-minute increments)
  const timeSlots = useMemo(() => {
    const slots: { minutes: number; y: number }[] = []
    for (let hour = START_HOUR; hour < END_HOUR; hour++) {
      for (let quarter = 0; quarter < 4; quarter++) {
        const minutes = hour * 60 + quarter * 15
        slots.push({ minutes, y: minutesToY(minutes) })
      }
    }
    return slots
  }, [])

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
            {activeId && <span className="ml-2 text-primary-600 font-medium">• Drag to reschedule</span>}
          </p>
        </div>

        {/* Timeline */}
        <div ref={containerRef} className="flex-1 overflow-auto relative">
          {/* Column drop zones for reassignment */}
          {streamConfigs.map(config => {
            const member = selectedMembers.find(m => m.id === config.memberId)
            return (
              <ColumnDropZone
                key={`col-${config.memberId}`}
                memberId={config.memberId}
                memberName={member?.name || ''}
                memberColor={config.color}
                left={config.columnLeft}
                width={config.columnWidth}
                height={TIMELINE_HEIGHT + 60}
                isDragging={!!activeId}
              />
            )
          })}

          {/* Time slot drop zones per column (15-minute increments) */}
          {streamConfigs.map(config =>
            timeSlots.map(slot => (
              <TimeSlotDropZone
                key={`slot-${config.memberId}-${slot.minutes}`}
                minutes={slot.minutes}
                memberId={config.memberId}
                left={config.columnLeft}
                width={config.columnWidth}
                top={slot.y}
                isDragging={!!activeId}
              />
            ))
          )}

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

              {/* Free time zones - rendered first (below everything else) */}
              {freeTimeZones.map(zone => (
                <FreeTimeZoneDisplay
                  key={`free-${zone.startMinutes}`}
                  zone={zone}
                  width={svgWidth}
                />
              ))}

              {/* Convergence zones - for shared events */}
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

                    {/* Column divider line */}
                    {i > 0 && (
                      <line
                        x1={config.columnLeft}
                        y1={-20}
                        x2={config.columnLeft}
                        y2={TIMELINE_HEIGHT}
                        stroke="hsl(38, 20%, 92%)"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                      />
                    )}

                    {/* Member header with avatar and name */}
                    <foreignObject x={config.columnLeft} y={-28} width={config.columnWidth} height={45}>
                      <div
                        className="flex flex-col items-center justify-center h-full"
                        style={{
                          opacity: isAnimating ? 0 : 1,
                          animation: isAnimating ? `fade-in-scale 0.4s ease-out ${0.6 + i * 0.1}s forwards` : 'none',
                        }}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold
                                     border-2 border-white shadow-md ${memberColors.bg} ${memberColors.text}`}
                        >
                          {member?.initials || member?.name.charAt(0)}
                        </div>
                        <span className="text-xs font-medium text-neutral-600 mt-0.5 truncate max-w-full px-1">
                          {member?.name}
                        </span>
                      </div>
                    </foreignObject>
                  </g>
                )
              })}

              {/* Event cards with duration bars - rendered inside foreignObjects */}
              {timelineEvents.map(event => {
                const y = minutesToY(getMinutesFromMidnight(event.startTime))
                const layout = getCardLayout(event)
                const member = familyMembers.find(m => m.id === event.assignedTo)
                const memberColor = member?.color || 'blue'
                const streamConfig = streamConfigs.find(c => c.memberId === event.assignedTo)
                const isConverged = convergenceZones.some(
                  z => z.events.some(e => e.id === event.id) && z.memberIds.length >= 2
                )
                const isBeingDragged = activeId === event.prefixedId
                const durationHeight = getEventDuration(event)
                const colors = STREAM_COLORS[memberColor] || STREAM_COLORS.blue

                return (
                  <g key={event.prefixedId} style={{ opacity: isBeingDragged ? 0.3 : 1 }}>
                    {/* Duration indicator - shows time span for multi-hour events */}
                    {durationHeight && streamConfig && (
                      <>
                        {/* Vertical line with arrow */}
                        <line
                          x1={streamConfig.baseX}
                          y1={y + 20}
                          x2={streamConfig.baseX}
                          y2={y + durationHeight - 8}
                          stroke={colors.stroke}
                          strokeWidth={2}
                          opacity={0.6}
                          strokeDasharray={event.type === 'event' ? 'none' : '4 2'}
                        />
                        {/* Arrow head pointing down */}
                        <path
                          d={`M ${streamConfig.baseX - 5} ${y + durationHeight - 12}
                              L ${streamConfig.baseX} ${y + durationHeight - 4}
                              L ${streamConfig.baseX + 5} ${y + durationHeight - 12}`}
                          fill="none"
                          stroke={colors.stroke}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.7}
                        />
                        {/* Horizontal end-time bar */}
                        <line
                          x1={streamConfig.baseX - 12}
                          y1={y + durationHeight}
                          x2={streamConfig.baseX + 12}
                          y2={y + durationHeight}
                          stroke={colors.stroke}
                          strokeWidth={2}
                          strokeLinecap="round"
                          opacity={0.7}
                        />
                        {/* End time label */}
                        {event.endTime && (
                          <text
                            x={streamConfig.baseX + 18}
                            y={y + durationHeight + 4}
                            className="fill-neutral-400"
                            style={{ fontSize: '10px', fontFamily: 'var(--font-family-display)', fontStyle: 'italic' }}
                          >
                            {formatTime(getMinutesFromMidnight(event.endTime))}
                          </text>
                        )}
                      </>
                    )}

                    {/* Event card */}
                    <foreignObject
                      x={layout.x}
                      y={y - 20}
                      width={layout.width}
                      height={56}
                    >
                      <DraggableEventCard
                        event={event}
                        memberColor={memberColor}
                        isConverged={isConverged}
                        isSelected={selectedItemId === event.prefixedId}
                        onSelect={() => onSelectItem(event.prefixedId)}
                        onToggleComplete={() => handleToggleComplete(event)}
                        projectName={event.projectId ? projectsMap?.get(event.projectId)?.name : undefined}
                        contactName={event.contactId ? contactsMap?.get(event.contactId)?.name : undefined}
                      />
                    </foreignObject>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>

        {/* Drag overlay - shows the dragged item following the cursor */}
        <DragOverlay>
          {activeItem && (
            <div style={{ width: 200 }}>
              <EventCardContent
                event={activeItem}
                memberColor={familyMembers.find(m => m.id === activeItem.assignedTo)?.color || 'blue'}
                isConverged={false}
                isSelected={false}
                isDragging={true}
                onSelect={() => {}}
                onToggleComplete={() => {}}
                projectName={activeItem.projectId ? projectsMap?.get(activeItem.projectId)?.name : undefined}
                contactName={activeItem.contactId ? contactsMap?.get(activeItem.contactId)?.name : undefined}
              />
            </div>
          )}
        </DragOverlay>

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
    </DndContext>
  )
}
