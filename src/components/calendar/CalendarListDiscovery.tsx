import { useEffect, useState } from 'react'
import { Check, Eye, EyeOff, Briefcase, Users, User } from 'lucide-react'
import type { GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'
import type { TaskContext } from '@/types/task'
import { supabase } from '@/lib/supabase'

interface CalendarDomainMapping {
  calendar_id: string
  domain: TaskContext
}

const DOMAIN_BADGES: Record<TaskContext, { label: string; bg: string; text: string; Icon: typeof Briefcase }> = {
  work: { label: 'Work', bg: 'bg-blue-100', text: 'text-blue-700', Icon: Briefcase },
  family: { label: 'Family', bg: 'bg-amber-100', text: 'text-amber-700', Icon: Users },
  personal: { label: 'Personal', bg: 'bg-purple-100', text: 'text-purple-700', Icon: User },
}

interface CalendarListDiscoveryProps {
  calendars: GoogleCalendarInfo[]
  onContinue: () => void
  onBack: () => void
}

export function CalendarListDiscovery({ calendars, onContinue, onBack }: CalendarListDiscoveryProps) {
  const [mappings, setMappings] = useState<CalendarDomainMapping[]>([])
  const [loadingMappings, setLoadingMappings] = useState(true)

  useEffect(() => {
    async function loadMappings() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingMappings(false); return }

      const { data } = await supabase
        .from('calendar_domain_mappings')
        .select('calendar_id, domain')
        .eq('user_id', user.id)

      setMappings(data || [])
      setLoadingMappings(false)
    }
    loadMappings()
  }, [])

  const getMappedDomains = (calendarId: string): TaskContext[] => {
    return mappings
      .filter(m => m.calendar_id === calendarId)
      .map(m => m.domain)
  }

  const hasMappings = mappings.length > 0

  const writableCalendars = calendars.filter(
    cal => cal.accessRole === 'owner' || cal.accessRole === 'writer'
  )
  const readOnlyCalendars = calendars.filter(
    cal => cal.accessRole === 'reader'
  )

  const renderCalendarCard = (calendar: GoogleCalendarInfo, isWritable: boolean) => {
    const domains = getMappedDomains(calendar.id)
    const isMapped = domains.length > 0
    const isHidden = hasMappings && !isMapped

    return (
      <div
        key={calendar.id}
        className={`card p-4 border transition-colors ${
          isHidden
            ? 'border-neutral-100 bg-neutral-50 opacity-60'
            : 'border-neutral-200 hover:border-neutral-300'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isHidden
              ? 'bg-neutral-100'
              : isWritable
                ? 'bg-success-100'
                : 'bg-neutral-100'
          }`}>
            {isHidden ? (
              <EyeOff className="w-4 h-4 text-neutral-400" />
            ) : isWritable ? (
              <Check className="w-4 h-4 text-success-600" />
            ) : (
              <Eye className="w-4 h-4 text-neutral-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-medium truncate ${isHidden ? 'text-neutral-400' : 'text-neutral-800'}`}>
              {calendar.summary}
            </p>
            {calendar.email.includes('@') && calendar.email !== calendar.summary && !calendar.email.includes('group.calendar.google.com') && (
              <p className="text-sm text-neutral-500 truncate">{calendar.email}</p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {isHidden ? (
                <span className="text-sm text-neutral-400">
                  Not assigned — hidden from your view
                </span>
              ) : !loadingMappings && isMapped ? (
                domains.map(domain => {
                  const badge = DOMAIN_BADGES[domain]
                  const { Icon } = badge
                  return (
                    <span
                      key={domain}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
                    >
                      <Icon className="w-3 h-3" />
                      {badge.label}
                    </span>
                  )
                })
              ) : !loadingMappings && !hasMappings ? (
                <span className="text-sm text-success-600">
                  {isWritable ? 'You can create events in this calendar' : 'View only'}
                </span>
              ) : (
                <span className="text-sm text-warning-600">
                  Not assigned to any domain
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

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

      {/* Unmapped warning */}
      {!loadingMappings && hasMappings && (() => {
        const unmappedCount = calendars.filter(c => getMappedDomains(c.id).length === 0).length
        if (unmappedCount === 0) return null
        return (
          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-sm text-neutral-600">
            {unmappedCount} calendar{unmappedCount !== 1 ? 's' : ''} not assigned to a domain — events from {unmappedCount !== 1 ? 'these calendars' : 'this calendar'} won't appear in your schedule. Click <strong>Continue</strong> to configure.
          </div>
        )
      })()}

      {/* Calendar List */}
      <div className="space-y-3">
        {writableCalendars.map(cal => renderCalendarCard(cal, true))}
        {readOnlyCalendars.map(cal => renderCalendarCard(cal, false))}
      </div>

      {/* Info Message */}
      <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
        <p className="text-sm text-neutral-600 leading-relaxed">
          <Check className="inline w-4 h-4 text-success-600 mr-1" />
          <span className="font-medium">Writable calendars</span> let you create new events.
          <br />
          <Eye className="inline w-4 h-4 text-neutral-500 mr-1 mt-2" />
          <span className="font-medium">View-only calendars</span> show events but you can't add new ones.
          {hasMappings && (
            <>
              <br />
              <EyeOff className="inline w-4 h-4 text-neutral-400 mr-1 mt-2" />
              <span className="font-medium">Unassigned calendars</span> are hidden from your schedule.
            </>
          )}
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
