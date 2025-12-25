import { useState } from 'react'
import { Check, Eye, Calendar, Info, AlertTriangle, Briefcase, Users, User } from 'lucide-react'
import type { GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'
import type { TaskContext } from '@/types/task'

interface CalendarDomainAssignmentProps {
  calendars: GoogleCalendarInfo[]
  onSave: (assignments: Map<string, TaskContext[]>) => void
  onBack: () => void
}

const DOMAINS: { value: TaskContext; label: string; color: string; icon: typeof Briefcase }[] = [
  { value: 'work', label: 'Work', color: 'bg-blue-500', icon: Briefcase },
  { value: 'family', label: 'Family', color: 'bg-amber-500', icon: Users },
  { value: 'personal', label: 'Personal', color: 'bg-purple-500', icon: User },
]

export function CalendarDomainAssignment({ calendars, onSave, onBack }: CalendarDomainAssignmentProps) {
  // Initialize with smart defaults
  const getSmartDefault = (calendar: GoogleCalendarInfo): TaskContext[] => {
    const email = calendar.email.toLowerCase()
    const name = calendar.summary.toLowerCase()

    // Work signals
    if (email.includes('company.com') || email.includes('@work') || name.includes('work')) {
      return ['work']
    }

    // Family signals
    if (name.includes('family') || name.includes('shared')) {
      return ['family']
    }

    // Default to personal
    return ['personal']
  }

  const [assignments, setAssignments] = useState<Map<string, TaskContext[]>>(
    new Map(calendars.map(cal => [cal.id, getSmartDefault(cal)]))
  )

  const toggleDomain = (calendarId: string, domain: TaskContext) => {
    setAssignments(prev => {
      const newAssignments = new Map(prev)
      const currentDomains = newAssignments.get(calendarId) || []

      if (currentDomains.includes(domain)) {
        // Remove domain
        newAssignments.set(
          calendarId,
          currentDomains.filter(d => d !== domain)
        )
      } else {
        // Add domain
        newAssignments.set(calendarId, [...currentDomains, domain])
      }

      return newAssignments
    })
  }

  // Validation: check each domain has at least one writable calendar
  const getDomainValidation = () => {
    const validation: Record<TaskContext, boolean> = {
      work: false,
      family: false,
      personal: false,
    }

    calendars.forEach(cal => {
      const isWritable = cal.accessRole === 'owner' || cal.accessRole === 'writer'
      const domains = assignments.get(cal.id) || []

      if (isWritable) {
        domains.forEach(domain => {
          validation[domain] = true
        })
      }
    })

    return validation
  }

  const domainValidation = getDomainValidation()
  const allDomainsValid = Object.values(domainValidation).every(v => v)

  const handleSave = () => {
    onSave(assignments)
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
        <h2 className="text-2xl font-display text-neutral-800">Match Calendars to Domains</h2>
        <p className="text-neutral-600 mt-2">
          Assign each calendar to a domain. Events will only appear when you're in that domain.
        </p>
      </div>

      {/* Domain Sections */}
      <div className="space-y-6">
        {DOMAINS.map(({ value: domain, label, icon: Icon }) => {
          const assignedCalendars = calendars.filter(cal =>
            (assignments.get(cal.id) || []).includes(domain)
          )
          const hasWritable = assignedCalendars.some(
            cal => cal.accessRole === 'owner' || cal.accessRole === 'writer'
          )

          return (
            <div key={domain} className="space-y-3">
              {/* Domain Header */}
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-neutral-600" />
                <h3 className="font-medium text-neutral-800">{label} Domain</h3>
              </div>

              {/* Calendars for this domain */}
              <div className="space-y-2">
                {calendars.map(calendar => {
                  const isAssigned = (assignments.get(calendar.id) || []).includes(domain)
                  const isWritable = calendar.accessRole === 'owner' || calendar.accessRole === 'writer'

                  return (
                    <label
                      key={calendar.id}
                      className={`card p-3 border cursor-pointer transition-all ${
                        isAssigned
                          ? 'border-primary-300 bg-primary-50/30'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={() => toggleDomain(calendar.id, domain)}
                          className="w-4 h-4 text-primary-600 rounded border-neutral-300"
                        />
                        {isWritable ? (
                          <Calendar className="w-4 h-4 text-success-600 flex-shrink-0" />
                        ) : (
                          <Eye className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-800 truncate">
                            {calendar.summary}
                          </p>
                          <p className="text-xs text-neutral-500 truncate">
                            {/* Only show email if it's different from summary and looks like an email */}
                            {calendar.email.includes('@') && calendar.email !== calendar.summary && !calendar.email.includes('group.calendar.google.com')
                              ? calendar.email
                              : isWritable ? 'Can create events' : 'View only'}
                          </p>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>

              {/* Validation Status */}
              <div className="text-sm flex items-center gap-2">
                {hasWritable ? (
                  <>
                    <Check className="w-4 h-4 text-success-600" />
                    <span className="text-success-600">{label} domain has writable calendar</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-warning-600" />
                    <span className="text-warning-600">{label} domain has no writable calendar</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Info Message */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-900">
          Calendars can appear in multiple domains. Events from assigned calendars will show in each domain.
        </p>
      </div>

      {/* Warning if domains missing writable calendars */}
      {!allDomainsValid && (
        <div className="p-4 bg-warning-50 rounded-lg border border-warning-200 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-warning-900">
            <p className="font-medium mb-1">Some domains have no writable calendar</p>
            <p className="text-warning-700">
              You won't be able to create new events in domains without a writable calendar.
              You can still view events from read-only calendars.
            </p>
          </div>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="btn-primary w-full"
      >
        Save & Finish
      </button>
    </div>
  )
}
