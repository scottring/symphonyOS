import { useState, useEffect } from 'react'
import { useGoogleCalendar, type GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'
import type { TaskContext } from '@/types/task'
import { CalendarListDiscovery } from './CalendarListDiscovery'
import { CalendarDomainAssignment } from './CalendarDomainAssignment'
import { supabase } from '@/lib/supabase'
import { Check, Lock, Briefcase, Users, User } from 'lucide-react'

type WizardStep = 'connect' | 'discovery' | 'assignment' | 'confirmation'

interface CalendarSetupWizardProps {
  onComplete?: () => void
}

export function CalendarSetupWizard({ onComplete }: CalendarSetupWizardProps) {
  const { isConnected, connect, fetchCalendarList } = useGoogleCalendar()
  const [step, setStep] = useState<WizardStep>('connect')
  const [calendars, setCalendars] = useState<GoogleCalendarInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAssignments, setSavedAssignments] = useState<Map<string, TaskContext[]> | null>(null)

  // Auto-advance to discovery when connected
  useEffect(() => {
    if (isConnected && step === 'connect') {
      loadCalendars()
    }
  }, [isConnected, step])

  const loadCalendars = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const calendarList = await fetchCalendarList()
      setCalendars(calendarList)
      setStep('discovery')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendars')
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnect = async () => {
    setIsLoading(true)
    try {
      await connect()
      // Connection will trigger useEffect above to load calendars
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setIsLoading(false)
    }
  }

  const handleSaveAssignments = async (assignments: Map<string, TaskContext[]>) => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Delete existing mappings
      await supabase
        .from('calendar_domain_mappings')
        .delete()
        .eq('user_id', user.id)

      // Insert new mappings
      const mappings: any[] = []
      assignments.forEach((domains, calendarId) => {
        const calendar = calendars.find(c => c.id === calendarId)
        if (!calendar) return

        domains.forEach(domain => {
          mappings.push({
            user_id: user.id,
            calendar_id: calendar.id,
            calendar_email: calendar.email,
            calendar_name: calendar.summary,
            domain,
            access_role: calendar.accessRole,
            is_default: false, // Will set defaults later
          })
        })
      })

      const { error: insertError } = await supabase
        .from('calendar_domain_mappings')
        .insert(mappings)

      if (insertError) throw insertError

      // Set first writable calendar as default for each domain
      for (const domain of ['work', 'family', 'personal'] as TaskContext[]) {
        const writableMapping = mappings.find(
          m => m.domain === domain && (m.access_role === 'owner' || m.access_role === 'writer')
        )

        if (writableMapping) {
          await supabase
            .from('calendar_domain_mappings')
            .update({ is_default: true })
            .eq('user_id', user.id)
            .eq('domain', domain)
            .eq('calendar_id', writableMapping.calendar_id)
            .single()
        }
      }

      setSavedAssignments(assignments)
      setStep('confirmation')
    } catch (err) {
      console.error('Failed to save assignments:', err)
      setError(err instanceof Error ? err.message : 'Failed to save calendar assignments')
    } finally {
      setIsLoading(false)
    }
  }

  const handleComplete = () => {
    if (onComplete) {
      onComplete()
    }
  }

  // Step 1: Connect
  if (step === 'connect') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-display text-neutral-800 mb-3">
            Connect Google Calendar
          </h1>
          <p className="text-neutral-600 max-w-md mx-auto">
            Symphony will access your Google Calendar to show events alongside your tasks.
          </p>
          <p className="text-neutral-600 mt-2 max-w-md mx-auto">
            You choose which calendars appear in which domains on the next screen.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg">
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={isLoading}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-neutral-200 rounded-xl
                     hover:bg-neutral-50 hover:border-neutral-300 hover:shadow-sm
                     transition-all touch-target w-full disabled:opacity-50"
        >
          <Lock className="w-5 h-5 text-neutral-600" />
          <span className="font-medium text-neutral-700">
            {isLoading ? 'Connecting...' : 'Sign in with Google'}
          </span>
        </button>

        <p className="text-sm text-neutral-500 text-center">
          Your calendar data stays private. Events only appear in the domains you assign them to.
        </p>
      </div>
    )
  }

  // Step 2: Calendar Discovery
  if (step === 'discovery') {
    return (
      <div className="max-w-2xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full mx-auto mb-4" />
            <p className="text-neutral-600">Loading your calendars...</p>
          </div>
        ) : (
          <CalendarListDiscovery
            calendars={calendars}
            onContinue={() => setStep('assignment')}
            onBack={() => setStep('connect')}
          />
        )}
      </div>
    )
  }

  // Step 3: Domain Assignment
  if (step === 'assignment') {
    return (
      <div className="max-w-3xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full mx-auto mb-4" />
            <p className="text-neutral-600">Saving your preferences...</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg mb-6">
                <p className="text-sm text-danger-700">{error}</p>
              </div>
            )}
            <CalendarDomainAssignment
              calendars={calendars}
              onSave={handleSaveAssignments}
              onBack={() => setStep('discovery')}
            />
          </>
        )}
      </div>
    )
  }

  // Step 4: Confirmation
  if (step === 'confirmation' && savedAssignments) {
    const getAssignedCalendars = (domain: TaskContext) => {
      return calendars.filter(cal =>
        (savedAssignments.get(cal.id) || []).includes(domain)
      )
    }

    const workCalendars = getAssignedCalendars('work')
    const familyCalendars = getAssignedCalendars('family')
    const personalCalendars = getAssignedCalendars('personal')

    const getDefaultCalendar = (cals: GoogleCalendarInfo[]) => {
      return cals.find(c => c.accessRole === 'owner' || c.accessRole === 'writer')
    }

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-success-600" />
          </div>
          <h1 className="text-3xl font-display text-neutral-800 mb-3">
            You're All Set!
          </h1>
          <p className="text-neutral-600">
            Your calendars are connected and organized by domain. Here's what you'll see:
          </p>
        </div>

        {/* Domain Summaries */}
        <div className="space-y-4">
          {/* Work */}
          <div className="card p-5 border border-neutral-200">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-5 h-5 text-blue-600" />
              <h3 className="font-medium text-neutral-800">Work Domain</h3>
            </div>
            <p className="text-sm text-neutral-600 mb-2">Shows events from:</p>
            <ul className="text-sm text-neutral-700 space-y-1 mb-3">
              {workCalendars.map(cal => (
                <li key={cal.id}>• {cal.summary}{cal.accessRole === 'reader' && ' (view only)'}</li>
              ))}
            </ul>
            {getDefaultCalendar(workCalendars) && (
              <p className="text-sm text-success-600">
                New events go to: {getDefaultCalendar(workCalendars)!.summary}
              </p>
            )}
          </div>

          {/* Family */}
          <div className="card p-5 border border-neutral-200">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-amber-600" />
              <h3 className="font-medium text-neutral-800">Family Domain</h3>
            </div>
            <p className="text-sm text-neutral-600 mb-2">Shows events from:</p>
            <ul className="text-sm text-neutral-700 space-y-1 mb-3">
              {familyCalendars.map(cal => (
                <li key={cal.id}>• {cal.summary}{cal.accessRole === 'reader' && ' (view only)'}</li>
              ))}
            </ul>
            {getDefaultCalendar(familyCalendars) && (
              <p className="text-sm text-success-600">
                New events go to: {getDefaultCalendar(familyCalendars)!.summary}
              </p>
            )}
          </div>

          {/* Personal */}
          <div className="card p-5 border border-neutral-200">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-purple-600" />
              <h3 className="font-medium text-neutral-800">Personal Domain</h3>
            </div>
            <p className="text-sm text-neutral-600 mb-2">Shows events from:</p>
            <ul className="text-sm text-neutral-700 space-y-1 mb-3">
              {personalCalendars.map(cal => (
                <li key={cal.id}>• {cal.summary}{cal.accessRole === 'reader' && ' (view only)'}</li>
              ))}
            </ul>
            {getDefaultCalendar(personalCalendars) && (
              <p className="text-sm text-success-600">
                New events go to: {getDefaultCalendar(personalCalendars)!.summary}
              </p>
            )}
          </div>
        </div>

        {/* Privacy Message */}
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-900">
            <span className="font-medium">Privacy protected:</span> Work events never appear in Family or Personal domains
          </p>
        </div>

        {/* Complete Button */}
        <button
          onClick={handleComplete}
          className="btn-primary w-full"
        >
          Go to Today View
        </button>

        <p className="text-sm text-neutral-500 text-center">
          You can change these settings anytime in Settings → Calendar & Domains
        </p>
      </div>
    )
  }

  return null
}
