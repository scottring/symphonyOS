import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { callbackFunctionFor, providerFromOAuthState, providerLabel } from '@/lib/calendarProviders'

export function CalendarCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // StrictMode may run this effect twice. A connection transaction is one-use.
    if (started.current) return
    started.current = true
    async function handleCallback() {
      const code = searchParams.get('code')
      const errorParam = searchParams.get('error')
      // Which provider sent us back — stamped into `state` by the auth-url function.
      const provider = providerFromOAuthState(searchParams.get('state'))

      if (errorParam) {
        const detail = searchParams.get('error_description') ?? errorParam
        setError(`${providerLabel(provider)} authorization failed: ${detail}`)
        return
      }

      if (!code) {
        setError('No authorization code received')
        return
      }

      try {
        const { error: fnError } = await supabase.functions.invoke(callbackFunctionFor(provider), {
          body: {
            code,
            redirectUri: `${window.location.origin}/calendar-callback`,
            // Handed back for verification: the callback refuses a state that is not this person's.
            state: searchParams.get('state'),
          },
        })

        if (fnError) {
          const detail = await fnError.context?.json?.().catch(() => null)
          setError(typeof detail?.error === 'string' ? detail.error : 'Could not finish connecting. Start again from Calendar settings.')
          return
        }

        // Success - redirect to home with a FULL reload (not SPA navigation).
        // The GoogleCalendarProvider validates the connection only once on
        // mount, so an in-app navigate() would leave isConnected=false until a
        // manual refresh — the connection silently "won't stick" and every
        // surface keeps showing the Connect prompt. A hard reload remounts the
        // provider, which re-checks and flips isConnected=true.
        window.location.replace('/settings?tab=calendar&connected=1')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-card p-6 max-w-md text-center">
          <h1 className="text-lg font-semibold text-red-600 mb-2">Connection Failed</h1>
          <p className="text-neutral-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/settings?tab=calendar')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Calendar settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-card p-6 max-w-md text-center">
        <h1 className="text-lg font-semibold text-neutral-800 mb-2">Connecting Calendar...</h1>
        <p className="text-neutral-500">Please wait while we complete the connection.</p>
      </div>
    </div>
  )
}
