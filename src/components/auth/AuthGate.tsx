import { useEffect, useRef, useState, Suspense, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { AuthForm } from '@/components/lazy'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import type { User } from '@supabase/supabase-js'

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
 * Auth + onboarding gate. Renders `children` only when the user is signed in,
 * not mid password-recovery, and has completed onboarding. Otherwise renders
 * the loading state, the auth form, the password-reset form, or a redirect to
 * /onboarding as appropriate.
 *
 * Lifted out of App.tsx so the Shell-mounted cutover routes (/, /today, /inbox,
 * /task/:id) get the same gate when `symphony.useNewTasks` is enabled.
 */
export function AuthGate({ children }: { children: (auth: AuthedContext) => ReactNode }) {
  const { user, loading: authLoading, isPasswordRecovery, updatePassword, signOut } = useAuth()

  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(true)
  const onboardingChecked = useRef(false)

  // Check onboarding status — only on initial load, not on auth token refreshes.
  useEffect(() => {
    if (onboardingChecked.current) return // Only check once
    async function checkOnboarding() {
      if (!user) {
        setOnboardingLoading(false)
        return
      }

      onboardingChecked.current = true

      try {
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('onboarding_completed_at')
          .eq('user_id', user.id)
          .maybeSingle()

        if (error) {
          console.error('Error checking onboarding:', error)
          // Assume complete on error to not block the app
          setOnboardingComplete(true)
        } else if (profile?.onboarding_completed_at) {
          setOnboardingComplete(true)
        } else {
          setOnboardingComplete(false)
        }
      } catch (err) {
        console.error('Error in checkOnboarding:', err)
        setOnboardingComplete(true) // Fail open
      } finally {
        setOnboardingLoading(false)
      }
    }

    if (!authLoading) {
      checkOnboarding()
    }
  }, [user, authLoading])

  if (authLoading || onboardingLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <AuthForm />
      </Suspense>
    )
  }

  if (isPasswordRecovery) {
    return <PasswordResetForm onSubmit={updatePassword} />
  }

  if (onboardingComplete === false) {
    // Onboarding lives at /onboarding as a top-level route. Redirect any
    // gated path (e.g. /, /meals/plan) there until the user finishes.
    return <Navigate to="/onboarding" replace />
  }

  return <>{children({ user, signOut })}</>
}
