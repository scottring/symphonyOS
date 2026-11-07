import { useEffect, useRef, useState } from 'react'
import { CircleAlert, MailWarning } from 'lucide-react'
import {
  SUPPORT_EMAIL,
  describeResendError,
  type AuthCallbackError,
  type AuthEmailFlow,
} from '@/lib/authCallback'

type SendResult = Promise<{ error: { message?: string | null; status?: number; code?: string; name?: string } | null }>

interface EmailLinkProblemProps {
  problem: AuthCallbackError
  /** Shared with the sign-in form, so switching over keeps what was typed. */
  email: string
  onEmailChange: (email: string) => void
  onResend: (email: string) => SendResult
  /** Send a new password-reset link: an expired reset link reports the same
   *  `otp_expired` as an expired confirmation link. */
  onSendReset: (email: string) => SendResult
  /** What this browser last asked to be emailed, if known. */
  initialFlow?: AuthEmailFlow | null
  onSignIn: () => void
}

/**
 * What the sign-in card shows when someone arrives from an email link that
 * didn't work. An expired or already-used link gets the explanation people
 * actually need (only the newest email works) and a way to get a new one; any
 * other failure is reported as itself, with the provider's own words.
 */
export function EmailLinkProblem({ problem, email, onEmailChange, onResend, onSendReset, initialFlow, onSignIn }: EmailLinkProblemProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The URL can't say which kind of link this was, so the person can always
  // choose; a remembered request picks the likely one first.
  const [flow, setFlow] = useState<AuthEmailFlow>(initialFlow ?? 'signup')
  const reset = flow === 'recovery'
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Land on the explanation, not the input: a screen reader reads why first,
  // and a phone keyboard doesn't open over the copy. Tab reaches the field.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSent(false)
    setSending(true)
    try {
      const { error } = await (reset ? onSendReset : onResend)(email.trim())
      if (error) {
        setError(describeResendError(error))
      } else {
        setSent(true)
      }
    } catch (err) {
      setError(describeResendError(err instanceof Error ? err : {}))
    } finally {
      setSending(false)
    }
  }

  if (problem.kind === 'other') {
    return (
      <div>
        <div className="flex justify-center mb-4">
          <span className="flex items-center justify-center w-11 h-11 rounded-full bg-danger-50 text-danger-600">
            <CircleAlert className="w-6 h-6" aria-hidden="true" />
          </span>
        </div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-xl font-medium text-neutral-800 mb-3 text-center focus:outline-none"
        >
          That link didn&rsquo;t work
        </h2>
        <p className="text-sm text-neutral-600 mb-3">
          Symphony couldn&rsquo;t use the link you opened.
        </p>
        {problem.description && (
          <p className="text-sm text-neutral-600 mb-3 p-3 rounded-lg bg-neutral-50 break-words">
            The sign-in service said: &ldquo;{problem.description}&rdquo;
          </p>
        )}
        <p className="text-sm text-neutral-600 mb-6">
          If you have a newer email from us, try its link. Still stuck? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-600 font-medium underline hover:no-underline">
            {SUPPORT_EMAIL}
          </a>.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="w-full btn-primary py-3 text-base font-medium rounded-xl"
        >
          Go to sign in
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-center mb-4">
        <span className="flex items-center justify-center w-11 h-11 rounded-full bg-warning-50 text-warning-600">
          <MailWarning className="w-6 h-6" aria-hidden="true" />
        </span>
      </div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-xl font-medium text-neutral-800 mb-3 text-center focus:outline-none"
      >
        This link has expired or was already used
      </h2>
      <p className="text-sm text-neutral-600 mb-6">
        Each link from us works once, for a limited time. If you asked for more than one
        email, only the newest link works.
      </p>

      <form onSubmit={handleResend} className="space-y-4">
        <fieldset>
          <legend className="text-sm font-medium text-neutral-700 mb-2">What was the email for?</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([['signup', 'Confirming a new account'], ['recovery', 'Resetting my password']] as const).map(([id, label]) => (
              <label
                key={id}
                className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg border text-sm cursor-pointer ${
                  flow === id ? 'border-primary-500 bg-primary-50 text-neutral-800' : 'border-neutral-200 text-neutral-600'
                }`}
              >
                <input
                  type="radio"
                  name="link-purpose"
                  value={id}
                  checked={flow === id}
                  onChange={() => { setFlow(id); setSent(false); setError(null) }}
                  className="accent-primary-600"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <label htmlFor="resend-email" className="block text-sm font-medium text-neutral-600">
            Email
          </label>
          <input
            id="resend-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="input-base"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-lg text-sm bg-danger-50 text-danger-600">
            {error}
          </div>
        )}

        <div role="status" aria-live="polite">
          {sent && (
            <div className="p-3 rounded-lg text-sm bg-success-50 text-success-600">
              <p className="font-medium">Check your inbox</p>
              <p className="mt-1">
                {reset
                  ? 'If an account uses this address, a new password reset link is on its way.'
                  : 'If this address is waiting to be confirmed, a new link is on its way.'}{' '}
                Use the newest email &mdash; earlier links won&rsquo;t work. Nothing after a few
                minutes? Check spam.
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={sending}
          className="w-full btn-primary py-3 text-base font-medium rounded-xl
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? 'Sending...' : sent ? 'Send another link' : reset ? 'Send a new reset link' : 'Send a new confirmation email'}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-neutral-100 text-center">
        <p className="text-sm text-neutral-500">
          {reset ? 'Remember your password?' : 'Already confirmed your email?'}{' '}
          <button
            type="button"
            onClick={onSignIn}
            className="text-primary-600 font-medium hover:text-primary-700"
          >
            Sign in
          </button>
        </p>
        {!reset && (
          <p className="mt-2 text-xs text-neutral-400">
            Signing in works only after your email is confirmed.
          </p>
        )}
      </div>
    </div>
  )
}
