import { useEffect, useState } from 'react'
import { useGoogleCalendar, type CalendarAccount, type CalendarProvider, type GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'
import { homeAccount } from '@/lib/calendar/homeAccount'
import { CalendarSetupWizard } from '@/components/calendar/CalendarSetupWizard'
import { SectionHeading } from '@/components/layout/SectionHeading'

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

const GoogleCalendarLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

const MicrosoftLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <rect x="2" y="2" width="9" height="9" fill="#F25022" />
    <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
    <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
    <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
  </svg>
)

/** The calendars that belong to this account. Calendars without an account
 *  tag (older responses) belong to the provider's only account. */
export function calendarsForAccount(
  calendars: GoogleCalendarInfo[],
  account: CalendarAccount,
  accountsOfProvider: number,
): GoogleCalendarInfo[] {
  return calendars.filter((c) => {
    if ((c.provider ?? 'google') !== account.provider) return false
    if (c.connectionId) return c.connectionId === account.id
    return accountsOfProvider === 1
  })
}

export function CalendarSettings() {
  const {
    isConnected,
    accounts,
    reconnectAccountIds,
    needsReconnect,
    reconnectProviders,
    isLoading,
    error,
    connect,
    disconnect,
    makePrimary,
    fetchCalendarList,
    defaultCalendarId,
    setDefaultCalendarId,
  } = useGoogleCalendar()

  const [busy, setBusy] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<CalendarProvider | null>(null)
  const [showSetupWizard, setShowSetupWizard] = useState(() => new URLSearchParams(window.location.search).get('connected') === '1')
  const [calendars, setCalendars] = useState<GoogleCalendarInfo[]>([])
  const [defaultSaveState, setDefaultSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [actionError, setActionError] = useState<string | null>(null)

  // One list across every account; each card shows only its own calendars.
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
  }, [isConnected, needsReconnect, fetchCalendarList, accounts.length])

  const googleAccounts = accounts.filter((a) => a.provider === 'google')
  const outlookAccounts = accounts.filter((a) => a.provider === 'microsoft')
  const outlookOffered = import.meta.env.VITE_MICROSOFT_CALENDAR_ENABLED === '1' || outlookAccounts.length > 0

  const accountNeedsReconnect = (account: CalendarAccount) =>
    needsReconnect ||
    reconnectAccountIds.includes(account.id) ||
    // Older answers name only the provider: true when it has a single account.
    (reconnectProviders.includes(account.provider) && accounts.filter((a) => a.provider === account.provider).length === 1)

  const calendarsOf = (account: CalendarAccount) =>
    calendarsForAccount(calendars, account, accounts.filter((a) => a.provider === account.provider).length)

  const nameOf = (account: CalendarAccount) =>
    account.accountEmail ?? pickAccountEmail(calendarsOf(account)) ?? (account.provider === 'microsoft' ? 'Outlook account' : 'Google account')

  const isWritable = (c: GoogleCalendarInfo) => c.accessRole === 'owner' || c.accessRole === 'writer'
  // New events go to the home account (primary Google, else primary Outlook)
  // unless "Create events on" names a calendar — of any account (2026-10-19).
  const home = homeAccount(accounts)
  const primaryGoogle = googleAccounts.find((a) => a.isPrimary) ?? googleAccounts[0]
  const createOnGroups = (home ? [home, ...accounts.filter((a) => a.id !== home.id)] : [])
    .filter((a) => !accountNeedsReconnect(a))
    .map((a) => ({
      account: a,
      // The home account's own calendar is the "Primary" option above the groups.
      calendars: calendarsOf(a).filter((c) => isWritable(c) && !(a.id === home?.id && c.primary)),
    }))
    .filter((g) => g.calendars.length > 0)

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

  const handleDisconnect = async (account: CalendarAccount) => {
    if (!confirm(`Disconnect ${nameOf(account)}? Its events will no longer appear in Symphony.`)) {
      return
    }
    setBusy(account.id)
    setActionError(null)
    try {
      await disconnect({ connectionId: account.id })
    } catch (err) {
      console.error('Failed to disconnect:', err)
      setActionError('Could not disconnect that account. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const handleMakePrimary = async (account: CalendarAccount) => {
    setBusy(account.id)
    setActionError(null)
    try {
      await makePrimary(account.id)
    } catch {
      setActionError('Could not change the primary account. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const handleConnect = async (provider: CalendarProvider) => {
    setConnecting(provider)
    try {
      await connect(provider)
    } catch (err) {
      console.error(`Failed to connect ${provider}:`, err)
      setConnecting(null)
    }
  }

  // Show setup wizard when connecting or reconnecting
  if (showSetupWizard) {
    return (
      <CalendarSetupWizard
        onComplete={() => {
          const url = new URL(window.location.href)
          url.searchParams.delete('connected')
          window.history.replaceState(window.history.state, '', url)
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
          <SectionHeading>Google Calendar</SectionHeading>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-neutral-200 rounded w-2/3" />
            <div className="h-20 bg-neutral-100 rounded" />
          </div>
        </section>
      </div>
    )
  }

  const accountCard = (account: CalendarAccount, count: number) => {
    const broken = accountNeedsReconnect(account)
    const own = calendarsOf(account)
    const isOutlook = account.provider === 'microsoft'
    return (
      <div key={account.id} data-testid="calendar-account" className="p-4 bg-white rounded-lg border border-neutral-100">
        <div className="flex items-center gap-3">
          {broken ? <DisconnectedBadge /> : <ConnectedBadge />}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-neutral-800 truncate">{nameOf(account)}</p>
            <p className="text-sm text-neutral-500">
              {broken
                ? 'Connection expired. Reconnect this account.'
                : isOutlook && own.length > 0 && !own.some(isWritable)
                  ? 'View only'
                  : count > 1 && account.isPrimary && (!isOutlook || googleAccounts.length === 0)
                    ? 'Primary: new events go here'
                    : 'Connected'}
            </p>
          </div>
        </div>

        {isOutlook && !broken && own.length > 0 && (
          <ul className="mt-3 p-3 bg-neutral-50 rounded-lg space-y-1">
            {own.map((c) => (
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

        <div className="mt-3 flex flex-wrap gap-2">
          {broken && (
            <button
              type="button"
              onClick={() => void handleConnect(account.provider)}
              className="flex-1 py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
            >
              Reconnect
            </button>
          )}
          {/* Outlook's primary matters only with no Google account: it is then
              where new events go. */}
          {count > 1 && !account.isPrimary && !broken && (!isOutlook || googleAccounts.length === 0) && (
            <button
              type="button"
              data-action="make-primary"
              onClick={() => void handleMakePrimary(account)}
              disabled={busy === account.id}
              className="flex-1 py-2 px-4 border border-neutral-200 rounded-lg text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
            >
              Make primary
            </button>
          )}
          <button
            type="button"
            data-action="disconnect"
            onClick={() => void handleDisconnect(account)}
            disabled={busy === account.id}
            className="flex-1 py-2 px-4 border border-neutral-200 rounded-lg text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
          >
            {busy === account.id ? 'Working…' : 'Disconnect'}
          </button>
        </div>
      </div>
    )
  }

  // Default write calendar — where Symphony-created events land. Read-only
  // calendars are excluded: the provider refuses writes to them regardless.
  const createOn = home && (createOnGroups.length > 0 || calendarsOf(home).some(isWritable)) ? (
    <div>
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
        <option value="">Primary ({nameOf(home)})</option>
        {accounts.length > 1
          ? createOnGroups.map((g) => (
              <optgroup key={g.account.id} label={nameOf(g.account)}>
                {g.calendars.map((c) => <option key={c.id} value={c.id}>{c.summary}</option>)}
              </optgroup>
            ))
          : createOnGroups.flatMap((g) => g.calendars).map((c) => <option key={c.id} value={c.id}>{c.summary}</option>)}
      </select>
      <p className="mt-1 text-xs text-neutral-400">
        {defaultSaveState === 'error'
          ? 'Could not save — try again.'
          : 'New events from Symphony go here. Calendars you can only view are not listed.'}
      </p>
    </div>
  ) : null

  const addButton = (provider: CalendarProvider, label: string) => (
    <button
      type="button"
      onClick={() => void handleConnect(provider)}
      disabled={connecting === provider}
      className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border border-neutral-200 rounded-lg text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
    >
      {provider === 'microsoft' ? <MicrosoftLogo /> : <GoogleCalendarLogo />}
      {connecting === provider ? (provider === 'microsoft' ? 'Opening Microsoft sign-in…' : 'Opening Google sign-in…') : label}
    </button>
  )

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      <section data-testid="google-card">
        <SectionHeading>Google Calendar</SectionHeading>
        <p className="text-sm text-neutral-500 mb-6">
          Connect one or more Google accounts to see their events alongside your tasks and routines.
        </p>

        {googleAccounts.length > 0 ? (
          <div className="space-y-3">
            {googleAccounts.map((a) => accountCard(a, googleAccounts.length))}

            {primaryGoogle && !accountNeedsReconnect(primaryGoogle) && (
              <div className="p-4 bg-white rounded-lg border border-neutral-100 space-y-4">
                {createOn}

                {/* Mail is optional and consented to separately (beta plan B05):
                    school email and drafts need it; the calendar does not. */}
                <div className="p-3 rounded-lg border border-dashed border-neutral-200">
                  {googleAccounts.some((a) => a.grantsMail) ? (
                    <p className="text-sm text-neutral-700">
                      Gmail is connected for {nameOf(googleAccounts.find((a) => a.grantsMail)!)}.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-neutral-700">Gmail is optional.</p>
                      <p className="text-xs text-neutral-500 mt-0.5 mb-2">Connect it only if you want school email read into the week and email drafts written for you. Symphony never sends mail itself.</p>
                      <button type="button" onClick={() => { void connect('google', { mail: true }) }} className="text-sm font-medium text-primary-600 hover:text-primary-700">
                        Also connect Gmail
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowSetupWizard(true)}
              className="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
            >
              Choose areas for calendars
            </button>
            {addButton('google', 'Add another Google account')}
          </div>
        ) : (
          <div className="p-4 bg-white rounded-lg border border-neutral-100">
            <div className="flex items-center gap-3 mb-4">
              <DisconnectedBadge />
              <div className="flex-1">
                <p className="font-medium text-neutral-800">Not Connected</p>
                <p className="text-sm text-neutral-500">Connect to see your calendar events</p>
              </div>
            </div>

            {error && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="button"
              // First connection ever: the wizard walks connect → domains.
              // With Outlook already connected the wizard would skip its
              // connect step (isConnected is true), so go straight to Google.
              onClick={() => (isConnected ? void handleConnect('google') : setShowSetupWizard(true))}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border border-neutral-200 rounded-lg text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
            >
              <GoogleCalendarLogo />
              Connect Google Calendar
            </button>
          </div>
        )}
      </section>

      {/* Outlook is offered only once it has been tested on real personal and
          work accounts (beta plan B05); an existing connection stays manageable. */}
      {outlookOffered && (
        <section data-testid="outlook-card">
          <SectionHeading>Outlook Calendar</SectionHeading>
          <p className="text-sm text-neutral-500 mb-6">
            Connect one or more Outlook or Microsoft 365 accounts. Their events show alongside everything else, and you can add and edit them from Symphony.
          </p>

          <div className="space-y-3">
            {outlookAccounts.map((a) => accountCard(a, outlookAccounts.length))}
            {/* With no Google account, "Create events on" lives here. */}
            {googleAccounts.length === 0 && createOn && (
              <div className="p-4 bg-white rounded-lg border border-neutral-100">{createOn}</div>
            )}
            {outlookAccounts.length === 0 && (
              <div className="p-4 bg-white rounded-lg border border-neutral-100 flex items-center gap-3">
                <DisconnectedBadge />
                <div className="flex-1">
                  <p className="font-medium text-neutral-800">Not Connected</p>
                  <p className="text-sm text-neutral-500">Connect to see Outlook events</p>
                </div>
              </div>
            )}
            {addButton('microsoft', outlookAccounts.length > 0 ? 'Add another Outlook account' : 'Connect Outlook Calendar')}
          </div>
        </section>
      )}

      {/* Info about calendar sync */}
      <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
        <h3 className="text-sm font-medium text-neutral-700 mb-2">What gets synced?</h3>
        <ul className="text-sm text-neutral-500 space-y-1">
          <li className="flex items-start gap-2">
            <CheckIcon />
            <span>Events from every connected account appear on your daily schedule</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon />
            <span>Create and edit calendar events from Symphony</span>
          </li>
          <li className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-neutral-400">Edits only touch events on calendars you can write to — view-only calendars stay untouched</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
