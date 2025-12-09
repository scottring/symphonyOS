import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'

export function CalendarConnect() {
  const { isConnected, needsReconnect, isLoading, error, connect, disconnect } = useGoogleCalendar()

  if (isLoading) {
    return (
      <div className="card p-5">
        <p className="text-neutral-500 text-sm">Checking calendar connection...</p>
      </div>
    )
  }

  // Show reconnect prompt when connection has expired
  if (needsReconnect) {
    return (
      <div className="card p-5 border-warning-200 bg-warning-50/50">
        <div className="flex items-start gap-3 mb-4">
          <span className="w-2.5 h-2.5 bg-warning-500 rounded-full mt-1.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-neutral-700">Calendar reconnection needed</p>
            <p className="text-sm text-neutral-500 mt-1">
              {error || 'Your calendar connection has expired. Please reconnect to continue seeing your events.'}
            </p>
          </div>
        </div>
        <button
          onClick={connect}
          className="flex items-center gap-3 px-4 py-3 bg-white border border-neutral-200 rounded-xl
                     hover:bg-neutral-50 hover:border-neutral-300 hover:shadow-sm
                     transition-all touch-target w-full justify-center"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="text-sm font-medium text-neutral-700">Reconnect Google Calendar</span>
        </button>
      </div>
    )
  }

  if (isConnected) {
    return (
      <div className="card p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 bg-success-500 rounded-full" />
          <span className="text-sm text-neutral-600">Google Calendar connected</span>
        </div>
        <button
          onClick={disconnect}
          className="text-sm text-neutral-500 hover:text-danger-500 transition-colors touch-target"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="card p-5">
      <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
        Connect your Google Calendar to see events alongside your tasks.
      </p>
      <button
        onClick={connect}
        className="flex items-center gap-3 px-4 py-3 bg-white border border-neutral-200 rounded-xl
                   hover:bg-neutral-50 hover:border-neutral-300 hover:shadow-sm
                   transition-all touch-target"
      >
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        <span className="text-sm font-medium text-neutral-700">Connect Google Calendar</span>
      </button>
    </div>
  )
}
