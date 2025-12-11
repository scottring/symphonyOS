import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

export function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { signInWithEmail, signUpWithEmail } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

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
    <div className="min-h-screen gradient-mesh flex flex-col items-center justify-center px-6 py-12">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-primary-200/20 blob animate-float" style={{ animationDelay: '0s' }} />
        <div className="absolute bottom-32 right-16 w-48 h-48 bg-primary-300/15 blob animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/3 right-1/4 w-32 h-32 bg-neutral-200/30 blob animate-float" style={{ animationDelay: '2s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-10">
          {/* Logo mark */}
          <div className="mb-6 animate-fade-in-scale flex justify-center">
            <img
              src="/symphony-logo.jpg"
              alt="Symphony Logo"
              className="w-24 h-24 rounded-full object-cover shadow-lg"
            />
          </div>

          <h1 className="font-display text-4xl font-semibold text-neutral-900 mb-3 tracking-tight">
            Symphony OS
          </h1>
          <p className="text-neutral-500 text-lg max-w-xs mx-auto">
            The family coordination platform
          </p>
        </div>

        {/* Form card */}
        <div className="card p-8 paper-texture">
          <h2 className="font-display text-2xl font-medium text-neutral-800 mb-8 text-center">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
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

            {error && (
              <div className={`p-4 rounded-xl text-sm font-medium animate-fade-in-scale ${
                error.includes('Check your email')
                  ? 'bg-success-50 text-success-600 border border-success-500/20'
                  : 'bg-danger-50 text-danger-600 border border-danger-500/20'
              }`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-4 text-base font-medium rounded-xl
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                         touch-target"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Signing in...</span>
                </span>
              ) : (
                isSignUp ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-neutral-100">
            <p className="text-center text-sm text-neutral-500">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-primary-600 font-semibold hover:text-primary-700 transition-colors"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>

        {/* Value proposition */}
        <div className="mt-10 text-center space-y-4">
          <p className="text-neutral-600 text-sm leading-relaxed max-w-sm mx-auto">
            For families juggling multiple schedules, work tasks, and the mental load of keeping it all together.
          </p>
          <p className="text-neutral-400 text-xs">
            Plan on desktop. Execute on mobile.
          </p>
        </div>
      </div>
    </div>
  )
}
