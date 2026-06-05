import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function CalendarCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code')
      const errorParam = searchParams.get('error')

      if (errorParam) {
        setError(`Google authorization failed: ${errorParam}`)
        return
      }

      if (!code) {
        setError('No authorization code received')
        return
      }

      try {
        const { error: fnError } = await supabase.functions.invoke('google-calendar-callback', {
          body: {
            code,
            redirectUri: `${window.location.origin}/calendar-callback`,
          },
        })

        if (fnError) {
          setError(fnError.message)
          return
        }

        // Success - redirect to home with a FULL reload (not SPA navigation).
        // The GoogleCalendarProvider validates the connection only once on
        // mount, so an in-app navigate() would leave isConnected=false until a
        // manual refresh — the connection silently "won't stick" and every
        // surface keeps showing the Connect prompt. A hard reload remounts the
        // provider, which re-checks and flips isConnected=true.
        window.location.replace('/')
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
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Home
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
