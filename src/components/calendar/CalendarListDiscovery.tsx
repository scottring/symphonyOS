import { Check, Eye } from 'lucide-react'
import type { GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'

interface CalendarListDiscoveryProps {
  calendars: GoogleCalendarInfo[]
  onContinue: () => void
  onBack: () => void
}

export function CalendarListDiscovery({ calendars, onContinue, onBack }: CalendarListDiscoveryProps) {
  const writableCalendars = calendars.filter(
    cal => cal.accessRole === 'owner' || cal.accessRole === 'writer'
  )
  const readOnlyCalendars = calendars.filter(
    cal => cal.accessRole === 'reader'
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="text-sm text-neutral-500 hover:text-neutral-700 mb-4 flex items-center gap-2"
        >
          ← Back
        </button>
        <h2 className="text-2xl font-display text-neutral-800">Your Calendars</h2>
        <p className="text-neutral-600 mt-2">
          We found {calendars.length} calendar{calendars.length !== 1 ? 's' : ''} in your Google account
        </p>
      </div>

      {/* Calendar List */}
      <div className="space-y-3">
        {/* Writable Calendars */}
        {writableCalendars.map((calendar) => (
          <div
            key={calendar.id}
            className="card p-4 border border-neutral-200 hover:border-neutral-300 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-success-100 flex items-center justify-center flex-shrink-0">
                <Check className="w-4 h-4 text-success-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-neutral-800 truncate">
                  {calendar.summary}
                </p>
                {calendar.email.includes('@') && calendar.email !== calendar.summary && !calendar.email.includes('group.calendar.google.com') && (
                  <p className="text-sm text-neutral-500 truncate">{calendar.email}</p>
                )}
                <p className="text-sm text-success-600 mt-1">
                  You can create events in this calendar
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Read-Only Calendars */}
        {readOnlyCalendars.map((calendar) => (
          <div
            key={calendar.id}
            className="card p-4 border border-neutral-200 hover:border-neutral-300 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
                <Eye className="w-4 h-4 text-neutral-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-neutral-800 truncate">
                  {calendar.summary}
                </p>
                {calendar.email.includes('@') && calendar.email !== calendar.summary && !calendar.email.includes('group.calendar.google.com') && (
                  <p className="text-sm text-neutral-500 truncate">{calendar.email}</p>
                )}
                <p className="text-sm text-neutral-500 mt-1">
                  View only • You can see but not create
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info Message */}
      <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
        <p className="text-sm text-neutral-600 leading-relaxed">
          <Check className="inline w-4 h-4 text-success-600 mr-1" />
          <span className="font-medium">Writable calendars</span> let you create new events.
          <br />
          <Eye className="inline w-4 h-4 text-neutral-500 mr-1 mt-2" />
          <span className="font-medium">View-only calendars</span> show events but you can't add new ones.
        </p>
      </div>

      {/* Continue Button */}
      <button
        onClick={onContinue}
        className="btn-primary w-full"
      >
        Continue
      </button>
    </div>
  )
}
