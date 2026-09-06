import { useState, useEffect, useRef, Suspense, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AuthForm } from '@/components/lazy'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import type { User } from '@supabase/supabase-js'

const SESSION_ENDED_MESSAGE = 'Your session ended. Sign in to continue where you were.'
const RETURN_TO_KEY = 'symphony.returnTo'

/** Auth values handed to AuthGate's children once the gate is open. */
export interface AuthedContext {
  user: User
  signOut: () => Promise<{ error: unknown }>
}

function PasswordResetForm({ onSubmit }: { onSubmit: (password: string) => Promise<{ error: { message: string } | null }> }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setError(null)
    setLoading(true)
    const { error } = await onSubmit(password)
    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="/symphony-logo.jpg" alt="Symphony Logo" className="w-12 h-12 rounded-full object-cover" />
            <h1 className="font-display text-3xl text-neutral-900">Symphony</h1>
          </div>
        </div>
        <div className="card p-8">
          <h2 className="font-display text-xl font-medium text-neutral-800 mb-6 text-center">Set New Password</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="new-password" className="block text-sm font-medium text-neutral-600">New Password</label>
              <input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-base" placeholder="At least 6 characters" required minLength={6} />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-neutral-600">Confirm Password</label>
              <input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input-base" placeholder="Re-enter your password" required minLength={6} />
            </div>
            {error && <div className="p-3 rounded-lg text-sm bg-danger-50 text-danger-700">{error}</div>}
            <button type="submit" disabled={loading} className="w-full btn-primary py-3 text-base font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

/**
 * Auth gate. Renders `children` only when the user is signed in and not mid
 * password-recovery. Otherwise renders the loading state, the auth form, or
 * the password-reset form as appropriate.
 *
 * Lifted out of App.tsx so the Shell-mounted cutover routes (/, /today, /inbox,
 * /task/:id) get the same gate when `symphony.useNewTasks` is enabled.
 */
export function AuthGate({ children }: { children: (auth: AuthedContext) => ReactNode }) {
  const { user, loading: authLoading, isPasswordRecovery, updatePassword, signOut, sessionLost } = useAuth()
  const navigate = useNavigate()
  // Did we land here already logged out (the sign-in screen showing), or on a
  // route that says WHY (?return=)? Either way, a sign-in that follows counts
  // as "recovering" and should return you where you were, not drop you on
  // Today. A user who was already signed in when this mounted, or who opens
  // the sign-in screen fresh with no hint, gets no forced navigation.
  const recoveringRef = useRef(false)
  const wasSignedOutRef = useRef(!user)

  // A session-ending redirect (e.g. a 401 caught as SessionExpiredError)
  // hands back '?return=<path>' — remember it so a fresh sign-in returns
  // there instead of dropping the user back on Today.
  const [hasReturnParam] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).has('return')
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const ret = params.get('return')
      if (ret) sessionStorage.setItem(RETURN_TO_KEY, ret)
    } catch {
      // sessionStorage can throw in a locked-down browser context — the
      // recovery message still shows, just without a route to return to.
    }
  }, [])

  if (sessionLost || hasReturnParam) recoveringRef.current = true

  useEffect(() => {
    if (user && wasSignedOutRef.current && recoveringRef.current) {
      recoveringRef.current = false
      let dest = '/today'
      try {
        dest = sessionStorage.getItem(RETURN_TO_KEY) ?? '/today'
        sessionStorage.removeItem(RETURN_TO_KEY)
      } catch {
        // Fall back to the default below.
      }
      navigate(dest, { replace: true })
    }
    wasSignedOutRef.current = !user
  }, [user, navigate])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <AuthForm message={sessionLost || hasReturnParam ? SESSION_ENDED_MESSAGE : undefined} />
      </Suspense>
    )
  }

  if (isPasswordRecovery) {
    return <PasswordResetForm onSubmit={updatePassword} />
  }

  return <>{children({ user, signOut })}</>
}
