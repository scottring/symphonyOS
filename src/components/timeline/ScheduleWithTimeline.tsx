import { useState, useRef, useCallback } from 'react'
import { WhenPicker } from '@/components/triage'
import { TimelineCompanion } from './TimelineCompanion'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

interface ScheduleWithTimelineProps {
  // WhenPicker props
  value?: Date
  isAllDay?: boolean
  onChange: (date: Date | undefined, isAllDay: boolean) => void

  // Timeline data
  familyMembers: FamilyMember[]
  tasks: Task[]
  events: CalendarEvent[]
}

// Transform calendar events for TimelineCompanion
interface TimelineCalendarEvent {
  id: string
  title: string
  start: Date
  end?: Date
  familyMemberId?: string
}

function transformCalendarEvents(events: CalendarEvent[]): TimelineCalendarEvent[] {
  return events.map(event => {
    // Handle both snake_case and camelCase from the API
    const startStr = event.start_time || event.startTime
    const endStr = event.end_time || event.endTime

    return {
      id: event.id,
      title: event.title,
      start: startStr ? new Date(startStr) : new Date(),
      end: endStr ? new Date(endStr) : undefined,
      familyMemberId: undefined, // Calendar events don't have family member assignment yet
    }
  })
}

export function ScheduleWithTimeline({
  value,
  isAllDay,
  onChange,
  familyMembers,
  tasks,
  events,
}: ScheduleWithTimelineProps) {
  const [showTimeline, setShowTimeline] = useState(false)
  const [hoveredTime, setHoveredTime] = useState<Date | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<number | null>(null)

  // Show timeline on hover after a short delay
  const handleMouseEnter = useCallback(() => {
    // Cancel any pending hide
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    // Show after 300ms hover
    hoverTimeoutRef.current = window.setTimeout(() => {
      if (containerRef.current) {
        setAnchorRect(containerRef.current.getBoundingClientRect())
      }
      // Default to today if no value set
      setHoveredTime(value || new Date())
      setShowTimeline(true)
    }, 300)
  }, [value])

  const handleMouseLeave = useCallback(() => {
    // Cancel any pending show
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    // Hide after 200ms
    hoverTimeoutRef.current = window.setTimeout(() => {
      setShowTimeline(false)
      setHoveredTime(null)
    }, 200)
  }, [])

  const handleTimeSelect = useCallback((time: Date) => {
    onChange(time, false)
    setShowTimeline(false)
    setHoveredTime(null)
  }, [onChange])

  const handleTimelineClose = useCallback(() => {
    setShowTimeline(false)
    setHoveredTime(null)
  }, [])

  // Keep timeline open when mouse enters it
  const handleTimelineMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <WhenPicker
        value={value}
        isAllDay={isAllDay}
        onChange={onChange}
      />

      {showTimeline && hoveredTime && familyMembers.length > 0 && (
        <div
          onMouseEnter={handleTimelineMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <TimelineCompanion
            familyMembers={familyMembers}
            tasks={tasks}
            events={transformCalendarEvents(events)}
            focusTime={hoveredTime}
            timeWindow={4}
            anchorRect={anchorRect}
            onSelectTime={handleTimeSelect}
            onClose={handleTimelineClose}
          />
        </div>
      )}
    </div>
  )
}
