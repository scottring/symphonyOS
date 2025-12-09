import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useHousehold } from '@/hooks/useHousehold'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export function JoinHousehold() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const { user, loading: authLoading } = useAuth()
  const { acceptInvitation, loading: householdLoading } = useHousehold()

  const [status, setStatus] = useState<'loading' | 'invalid' | 'ready' | 'joining' | 'success' | 'error'>('loading')
  const [invitation, setInvitation] = useState<{ email: string; household_name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Validate the token
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setStatus('invalid')
        return
      }

      try {
        // Fetch invitation details (this is a public query - no auth required)
        const { data, error } = await supabase
          .from('household_invitations')
          .select(`
            email,
            expires_at,
            accepted_at,
            households (name)
          `)
          .eq('token', token)
          .single()

        if (error || !data) {
          setStatus('invalid')
          return
        }

        // Check if already accepted
        if (data.accepted_at) {
          setError('This invitation has already been used.')
          setStatus('invalid')
          return
        }

        // Check if expired
        if (new Date(data.expires_at) < new Date()) {
          setError('This invitation has expired.')
          setStatus('invalid')
          return
        }

        // households could be an object or array depending on the join
        const householdData = data.households as unknown
        let householdName = 'Unknown'
        if (householdData && typeof householdData === 'object') {
          if (Array.isArray(householdData) && householdData[0]?.name) {
            householdName = householdData[0].name
          } else if ('name' in householdData) {
            householdName = (householdData as { name: string }).name
          }
        }
        setInvitation({
          email: data.email,
          household_name: householdName,
        })
        setStatus('ready')
      } catch {
        setStatus('invalid')
      }
    }

    validateToken()
  }, [token])

  const handleJoin = async () => {
    if (!token) return

    setStatus('joining')
    try {
      await acceptInvitation(token)
      setStatus('success')
      // Redirect to main app after a moment
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join household')
      setStatus('error')
    }
  }

  // Show loading while checking auth
  if (authLoading || householdLoading || status === 'loading') {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="animate-pulse text-neutral-400">Loading...</div>
      </div>
    )
  }

  // Invalid or expired token
  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold text-neutral-800 mb-2">
            Invalid Invitation
          </h1>
          <p className="text-neutral-500 mb-6">
            {error || 'This invitation link is invalid or has expired.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary w-full"
          >
            Go to Symphony
          </button>
        </div>
      </div>
    )
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold text-neutral-800 mb-2">
            Welcome to the household!
          </h1>
          <p className="text-neutral-500">
            Redirecting you to Symphony...
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold text-neutral-800 mb-2">
            Something went wrong
          </h1>
          <p className="text-neutral-500 mb-6">{error}</p>
          <button
            onClick={() => setStatus('ready')}
            className="btn-primary w-full"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Need to log in first
  if (!user) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold text-neutral-800 mb-2">
            Join {invitation?.household_name}
          </h1>
          <p className="text-neutral-500 mb-6">
            You've been invited to join a household on Symphony.
            Please sign in or create an account to continue.
          </p>
          <p className="text-sm text-neutral-400 mb-6">
            Invitation for: <strong>{invitation?.email}</strong>
          </p>
          <button
            onClick={() => navigate(`/login?redirect=/join?token=${token}`)}
            className="btn-primary w-full"
          >
            Sign In or Create Account
          </button>
        </div>
      </div>
    )
  }

  // Ready to join
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-semibold text-neutral-800 mb-2">
          Join {invitation?.household_name}
        </h1>
        <p className="text-neutral-500 mb-6">
          You've been invited to share tasks, routines, and lists with this household.
        </p>

        {status === 'joining' ? (
          <button disabled className="btn-primary w-full opacity-50">
            Joining...
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleJoin}
              className="btn-primary w-full"
            >
              Join Household
            </button>
            <button
              onClick={() => navigate('/')}
              className="btn-secondary w-full"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
