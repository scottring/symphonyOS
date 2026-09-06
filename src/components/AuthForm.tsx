import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface AuthFormProps {
  /** A banner shown above the form fields — e.g. after a session ended
   *  unexpectedly, so the sign-in card explains why the user landed here. */
  message?: string
}

export function AuthForm({ message }: AuthFormProps = {}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { signInWithEmail, signUpWithEmail, resetPassword } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (isForgotPassword) {
      const { error } = await resetPassword(email)
      if (error) {
        setError(error.message)
      } else {
        setError('Check your email for a password reset link!')
      }
      setLoading(false)
      return
    }

    const { error } = isSignUp
      ? await signUpWithEmail(email, password)
      : await signInWithEmail(email, password)

    if (error) {
      setError(error.message)
    } else if (isSignUp) {
      setError('Check your email for a confirmation link!')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img
              src="/symphony-logo.jpg"
              alt="Symphony Logo"
              className="w-12 h-12 rounded-full object-cover"
            />
            <h1 className="font-display text-3xl text-neutral-900">
              Symphony
            </h1>
          </div>
        </div>

        {/* Form card */}
        <div className="card p-8">
          {message && (
            <div className="mb-5 p-3 rounded-lg text-sm bg-primary-50 text-primary-700">
              {message}
            </div>
          )}
          <h2 className="font-display text-xl font-medium text-neutral-800 mb-6 text-center">
            {isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Sign In'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-neutral-600">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-base"
                placeholder="you@example.com"
                required
              />
            </div>

            {!isForgotPassword && (
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-neutral-600">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-base"
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                />
              </div>
            )}

            {error && (
              <div className={`p-3 rounded-lg text-sm ${
                error.includes('Check your email')
                  ? 'bg-success-50 text-success-700'
                  : 'bg-danger-50 text-danger-700'
              }`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-base font-medium rounded-xl
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>{isForgotPassword ? 'Sending...' : 'Signing in...'}</span>
                </span>
              ) : (
                isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          {/* Forgot password link (only on sign in) */}
          {!isSignUp && !isForgotPassword && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setIsForgotPassword(true); setError(null) }}
                className="text-sm text-neutral-500 hover:text-primary-600"
              >
                Forgot your password?
              </button>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-neutral-100">
            <p className="text-center text-sm text-neutral-500">
              {isForgotPassword ? (
                <>
                  Remember your password?{' '}
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setError(null) }}
                    className="text-primary-600 font-medium hover:text-primary-700"
                  >
                    Sign In
                  </button>
                </>
              ) : (
                <>
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(!isSignUp); setError(null) }}
                    className="text-primary-600 font-medium hover:text-primary-700"
                  >
                    {isSignUp ? 'Sign In' : 'Sign Up'}
                  </button>
                </>
              )}
            </p>
            {isSignUp && (
              <p className="mt-3 text-xs text-neutral-400">
                By creating an account you agree to how Symphony handles your data, described in the{' '}
                <a
                  href="https://www.symphony-os.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-500 underline hover:text-neutral-700"
                >
                  privacy page
                </a>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
