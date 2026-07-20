import { useState, Suspense, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
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
 * Auth gate. Renders `children` only when the user is signed in and not mid
 * password-recovery. Otherwise renders the loading state, the auth form, or
 * the password-reset form as appropriate.
 *
 * Lifted out of App.tsx so the Shell-mounted cutover routes (/, /today, /inbox,
 * /task/:id) get the same gate when `symphony.useNewTasks` is enabled.
 */
export function AuthGate({ children }: { children: (auth: AuthedContext) => ReactNode }) {
  const { user, loading: authLoading, isPasswordRecovery, updatePassword, signOut } = useAuth()

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
        <AuthForm />
      </Suspense>
    )
  }

  if (isPasswordRecovery) {
    return <PasswordResetForm onSubmit={updatePassword} />
  }

  return <>{children({ user, signOut })}</>
}
