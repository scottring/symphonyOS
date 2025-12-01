import { useEffect } from 'react'
import { useGoogleCalendar, type CalendarEvent } from '@/hooks/useGoogleCalendar'

function formatTime(dateStr: string, allDay: boolean): string {
  if (allDay) return 'All day'
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function EventItem({ event }: { event: CalendarEvent }) {
  return (
    <li className="flex items-start gap-3 bg-white rounded-lg shadow-card p-4">
      <div className="w-1 h-full min-h-[40px] bg-blue-500 rounded-full" />
      <div className="flex-1">
        <p className="text-neutral-800 font-medium">{event.title}</p>
        <p className="text-sm text-neutral-500">
          {event.start_time && formatTime(event.start_time, event.all_day ?? false)}
          {!event.all_day && event.end_time && ` - ${formatTime(event.end_time, event.all_day ?? false)}`}
        </p>
        {event.location && (
          <p className="text-sm text-neutral-400 mt-1">{event.location}</p>
        )}
      </div>
    </li>
  )
}

export function CalendarEventList() {
  const { isConnected, isLoading, events, fetchTodayEvents } = useGoogleCalendar()

  useEffect(() => {
    if (isConnected) {
      fetchTodayEvents()
    }
  }, [isConnected, fetchTodayEvents])

  if (isLoading) {
    return null
  }

  if (!isConnected) {
    return null
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-neutral-500 text-sm">No calendar events today</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-neutral-500 mb-2">Today's Events</h2>
      <ul className="space-y-2">
        {events.map((event) => (
          <EventItem key={event.google_event_id} event={event} />
        ))}
      </ul>
    </div>
  )
}
