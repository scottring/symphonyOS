import { useEffect, useState } from 'react'
import { useGoogleCalendar, type GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'
import { CalendarSetupWizard } from '@/components/calendar/CalendarSetupWizard'

/**
 * Resolve which Google account a connection belongs to from its calendar list.
 * Google's primary calendar id IS the account's email, so prefer the calendar
 * flagged primary; fall back to the first calendar if none is flagged.
 */
export function pickAccountEmail(
  calendars: { email?: string; primary?: boolean }[],
): string | null {
  const primary = calendars.find((c) => c.primary)
  return (primary ?? calendars[0])?.email ?? null
}

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
)

const ConnectedBadge = () => (
  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  </div>
)

const DisconnectedBadge = () => (
  <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  </div>
)

export function CalendarSettings() {
  const {
    isConnected,
    connectedProviders,
    needsReconnect,
    reconnectProviders,
    isLoading,
    error,
    connect,
    disconnect,
    fetchCalendarList,
    defaultCalendarId,
    setDefaultCalendarId,
  } = useGoogleCalendar()

  const [disconnecting, setDisconnecting] = useState<'google' | 'microsoft' | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [calendars, setCalendars] = useState<GoogleCalendarInfo[]>([])
  const [defaultSaveState, setDefaultSaveState] = useState<'idle' | 'saving' | 'error'>('idle')

  // One list across providers; each card shows only its own calendars.
  useEffect(() => {
    if (!isConnected || needsReconnect) {
      setCalendars([])
      return
    }
    let cancelled = false
    fetchCalendarList().then((cals) => {
      if (cancelled) return
      setCalendars(cals)
    })
    return () => {
      cancelled = true
    }
  }, [isConnected, needsReconnect, fetchCalendarList])

  const googleConnected = connectedProviders.includes('google') && !reconnectProviders.includes('google') && !needsReconnect
  const googleNeedsReconnect = reconnectProviders.includes('google') || (needsReconnect && connectedProviders.includes('google'))
  const outlookConnected = connectedProviders.includes('microsoft') && !reconnectProviders.includes('microsoft') && !needsReconnect
  const outlookNeedsReconnect = reconnectProviders.includes('microsoft') || (needsReconnect && connectedProviders.includes('microsoft'))

  // Older callers and mocks omit `provider`; they are Google.
  const googleCalendars = calendars.filter((c) => (c.provider ?? 'google') === 'google')
  const outlookCalendars = calendars.filter((c) => c.provider === 'microsoft')
  const accountEmail = pickAccountEmail(googleCalendars)

  // Only calendars Google will actually let this account write to.
  const writableCalendars = googleCalendars.filter(
    (c) => c.accessRole === 'owner' || c.accessRole === 'writer',
  )

  const handleDefaultChange = async (value: string) => {
    setDefaultSaveState('saving')
    try {
      // '' = Google primary (stored as NULL)
      await setDefaultCalendarId(value || null)
      setDefaultSaveState('idle')
    } catch {
      setDefaultSaveState('error')
    }
  }

  const handleDisconnect = async (provider: 'google' | 'microsoft') => {
    const label = provider === 'microsoft' ? 'Outlook Calendar' : 'Google Calendar'
    if (!confirm(`Disconnect ${label}? Its events will no longer appear in Symphony.`)) {
      return
    }
    setDisconnecting(provider)
    try {
      await disconnect(provider)
    } catch (err) {
      console.error('Failed to disconnect:', err)
    } finally {
      setDisconnecting(null)
    }
  }

  const handleConnectOutlook = async () => {
    setConnecting(true)
    try {
      await connect('microsoft')
    } catch (err) {
      console.error('Failed to connect Outlook:', err)
      setConnecting(false)
    }
  }

  // Show setup wizard when connecting or reconnecting
  if (showSetupWizard) {
    return (
      <CalendarSetupWizard
        onComplete={() => {
          setShowSetupWizard(false)
          // Calendar will auto-refresh via useGoogleCalendar hook
        }}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-neutral-700 mb-2">Google Calendar</h2>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-neutral-200 rounded w-2/3" />
            <div className="h-20 bg-neutral-100 rounded" />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section data-testid="google-card">
        <h2 className="text-lg font-semibold text-neutral-700 mb-2">Google Calendar</h2>
        <p className="text-sm text-neutral-500 mb-6">
          Connect your Google Calendar to see events alongside your tasks and routines.
        </p>

        {/* Connection Status Card */}
        <div className="p-4 bg-white rounded-lg border border-neutral-100">
          {googleConnected ? (
            <>
              {/* Connected state */}
              <div className="flex items-center gap-3 mb-4">
                <ConnectedBadge />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-800">Connected</p>
                  <p className="text-sm text-neutral-500 truncate">
                    {accountEmail ?? 'Your Google Calendar events are synced'}
                  </p>
                </div>
              </div>

              {/* Google Calendar Logo */}
              <div className="flex items-center gap-2 p-3 bg-neutral-50 rounded-lg mb-4">
                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 3H6C4.34 3 3 4.34 3 6v12c0 1.66 1.34 3 3 3h12c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3z" fill="#4285F4"/>
                  <path d="M18 3H6c-.83 0-1.58.34-2.12.88L12 12l8.12-8.12A2.99 2.99 0 0018 3z" fill="#4285F4"/>
                  <path d="M3.88 3.88L12 12l8.12-8.12A2.99 2.99 0 0018 3H6c-.83 0-1.58.34-2.12.88z" fill="#EA4335"/>
                  <path d="M12 12L3.88 3.88A2.99 2.99 0 003 6v12c0 .83.34 1.58.88 2.12L12 12z" fill="#FBBC04"/>
                  <path d="M12 12l8.12 8.12c.54-.54.88-1.29.88-2.12V6c0-.83-.34-1.58-.88-2.12L12 12z" fill="#34A853"/>
                  <path d="M3.88 20.12A2.99 2.99 0 006 21h12c.83 0 1.58-.34 2.12-.88L12 12l-8.12 8.12z" fill="#188038"/>
                </svg>
                <span className="text-sm text-neutral-600">Google Calendar</span>
              </div>

              {/* Default write calendar — where Symphony-created events land.
                  Read-only calendars are excluded: Google refuses writes to
                  them ("You need to have writer access") no matter what. */}
              {writableCalendars.length > 0 && (
                <div className="mb-4">
                  <label htmlFor="default-calendar" className="block text-sm font-medium text-neutral-700 mb-1">
                    Create events on
                  </label>
                  <select
                    id="default-calendar"
                    value={defaultCalendarId ?? ''}
                    onChange={(e) => handleDefaultChange(e.target.value)}
                    disabled={defaultSaveState === 'saving'}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
                  >
                    <option value="">Primary ({accountEmail ?? 'your account'})</option>
                    {writableCalendars.filter((c) => !c.primary).map((c) => (
                      <option key={c.id} value={c.id}>{c.summary}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-neutral-400">
                    {defaultSaveState === 'error'
                      ? 'Could not save — try again.'
                      : 'New events from Symphony go here. Calendars you can only view are not listed.'}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSetupWizard(true)}
                  className="flex-1 py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
                >
                  Configure Domains
                </button>
                <button
                  data-action="disconnect"
                  onClick={() => handleDisconnect('google')}
                  disabled={disconnecting === 'google'}
                  className="flex-1 py-2 px-4 border border-neutral-200 rounded-lg text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
                >
                  {disconnecting === 'google' ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Not connected state */}
              <div className="flex items-center gap-3 mb-4">
                <DisconnectedBadge />
                <div className="flex-1">
                  <p className="font-medium text-neutral-800">
                    {googleNeedsReconnect ? 'Reconnection Required' : 'Not Connected'}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {googleNeedsReconnect
                      ? 'Your calendar connection expired. Please reconnect.'
                      : 'Connect to see your calendar events'}
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                // First connection ever: the wizard walks connect → domains.
                // With Outlook already connected the wizard would skip its
                // connect step (isConnected is true), so go straight to Google.
                onClick={() => (isConnected ? void connect('google') : setShowSetupWizard(true))}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border border-neutral-200 rounded-lg text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {googleNeedsReconnect ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
              </button>
            </>
          )}
        </div>
      </section>

      <section data-testid="outlook-card">
        <h2 className="text-lg font-semibold text-neutral-700 mb-2">Outlook Calendar</h2>
        <p className="text-sm text-neutral-500 mb-6">
          Connect an Outlook or Microsoft 365 calendar. Its events show alongside everything else; editing stays in Outlook.
        </p>

        <div className="p-4 bg-white rounded-lg border border-neutral-100">
          {outlookConnected ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <ConnectedBadge />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-800">Connected</p>
                  <p className="text-sm text-neutral-500">View only</p>
                </div>
              </div>

              {outlookCalendars.length > 0 && (
                <ul className="mb-4 p-3 bg-neutral-50 rounded-lg space-y-1">
                  {outlookCalendars.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm text-neutral-600">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: c.backgroundColor ?? '#0078d4' }}
                        aria-hidden
                      />
                      <span className="truncate">{c.summary}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSetupWizard(true)}
                  className="flex-1 py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
                >
                  Configure Domains
                </button>
                <button
                  data-action="disconnect"
                  onClick={() => handleDisconnect('microsoft')}
                  disabled={disconnecting === 'microsoft'}
                  className="flex-1 py-2 px-4 border border-neutral-200 rounded-lg text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
                >
                  {disconnecting === 'microsoft' ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <DisconnectedBadge />
                <div className="flex-1">
                  <p className="font-medium text-neutral-800">
                    {outlookNeedsReconnect ? 'Reconnection Required' : 'Not Connected'}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {outlookNeedsReconnect
                      ? 'Your Outlook connection expired. Please reconnect.'
                      : 'Connect to see Outlook events'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleConnectOutlook}
                disabled={connecting}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border border-neutral-200 rounded-lg text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <rect x="2" y="2" width="9" height="9" fill="#F25022" />
                  <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
                  <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
                  <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
                </svg>
                {connecting
                  ? 'Opening Microsoft sign-in…'
                  : outlookNeedsReconnect
                    ? 'Reconnect Outlook Calendar'
                    : 'Connect Outlook Calendar'}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Info about calendar sync */}
      <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
        <h3 className="text-sm font-medium text-neutral-700 mb-2">What gets synced?</h3>
        <ul className="text-sm text-neutral-500 space-y-1">
          <li className="flex items-start gap-2">
            <CheckIcon />
            <span>Your calendar events appear on your daily schedule</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon />
            <span>Create calendar events from Symphony (Google only)</span>
          </li>
          <li className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-neutral-400">Edits only touch events on calendars you can write to — view-only calendars and Outlook stay untouched</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
