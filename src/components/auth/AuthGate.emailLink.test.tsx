/**
 * Arriving from an email link that didn't work (live, 2026-10-08): a new user
 * opened the older of two confirmation emails, Supabase redirected back with
 * `#error_code=otp_expired`, and the app showed a bare Sign In form with no
 * explanation and no way to get a new link.
 *
 * These render AuthGate with the REAL AuthForm, so the URL → message → resend
 * path is exercised end to end; only useAuth (the Supabase boundary) is faked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { AuthGate } from './AuthGate'
import { rememberAuthEmailFlow } from '@/lib/authCallback'

const EXPIRED_HASH =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'

const { authState, mockResend, mockReset } = vi.hoisted(() => ({
  authState: {
    user: null as { id: string; email: string } | null,
    loading: false,
    isPasswordRecovery: false,
    sessionLost: false,
  },
  mockResend: vi.fn(),
  mockReset: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    ...authState,
    signOut: vi.fn(),
    updatePassword: vi.fn(async () => ({ error: null })),
    signInWithEmail: vi.fn(async () => ({ error: null })),
    signUpWithEmail: vi.fn(async () => ({ error: null })),
    resetPassword: mockReset,
    resendConfirmation: mockResend,
  }),
}))

// The real form, loaded eagerly so it renders synchronously in tests.
vi.mock('@/components/lazy', async () => ({
  AuthForm: (await import('@/components/AuthForm')).AuthForm,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

const gate = () => <AuthGate>{() => <div>PROTECTED</div>}</AuthGate>

const consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []

beforeEach(() => {
  authState.user = null
  authState.loading = false
  authState.isPasswordRecovery = false
  authState.sessionLost = false
  mockResend.mockReset()
  mockResend.mockResolvedValue({ error: null })
  mockReset.mockReset()
  mockReset.mockResolvedValue({ error: null })
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    consoleSpies.push(vi.spyOn(console, method))
  }
})

afterEach(() => {
  consoleSpies.splice(0).forEach((spy) => spy.mockRestore())
})

describe('AuthGate — an expired or already-used email link', () => {
  it('explains the link, offers a new confirmation email, and clears the error from the address bar', async () => {
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)

    render(gate())

    const heading = await screen.findByRole('heading', { name: 'This link has expired or was already used' })
    expect(screen.getByText(/only the newest link works/)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send a new confirmation email' })).toBeInTheDocument()
    // Not the bare sign-in form.
    expect(screen.queryByRole('heading', { name: 'Sign In' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    // Keyboard and screen reader land on the explanation.
    expect(heading).toHaveFocus()

    await waitFor(() => expect(window.location.hash).toBe(''))
    expect(window.location.href).not.toMatch(/error|otp_expired/)

    // Nothing from the URL went to the console.
    for (const spy of consoleSpies) {
      expect(JSON.stringify(spy.mock.calls)).not.toMatch(/otp_expired|invalid or has expired/)
    }
  })

  it('reads the query form of the error too (PKCE redirects) and strips only the auth params', async () => {
    window.history.replaceState(
      {},
      '',
      '/today?keep=1&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    )

    render(gate())

    expect(await screen.findByRole('heading', { name: 'This link has expired or was already used' })).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe('?keep=1'))
    expect(window.location.pathname).toBe('/today')
  })

  it('leaves the URL alone until auth has finished starting up (supabase-js reads it too)', async () => {
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)
    authState.loading = true

    const { rerender } = render(gate())
    expect(window.location.hash).toBe(EXPIRED_HASH)

    authState.loading = false
    rerender(gate())

    expect(await screen.findByRole('heading', { name: 'This link has expired or was already used' })).toBeInTheDocument()
    await waitFor(() => expect(window.location.hash).toBe(''))
  })

  it('sends a new confirmation email on Enter and says what to expect without claiming one was sent', async () => {
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)
    const user = userEvent.setup()
    render(gate())

    await user.type(await screen.findByLabelText('Email'), 'new@example.com{Enter}')

    await waitFor(() => expect(mockResend).toHaveBeenCalledWith('new@example.com'))
    const status = screen.getByRole('status')
    await waitFor(() => expect(status).toHaveTextContent('Check your inbox'))
    expect(status).toHaveTextContent('If this address is waiting to be confirmed, a new link is on its way.')
    expect(status).toHaveTextContent(/Use the newest email/)
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it('explains a rate limit in plain words', async () => {
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)
    mockResend.mockResolvedValue({
      error: { message: 'For security purposes, you can only request this after 42 seconds.', status: 429 },
    })
    const user = userEvent.setup()
    render(gate())

    await user.type(await screen.findByLabelText('Email'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Send a new confirmation email' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait 42 seconds, then try again.')
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument()
  })

  it('handles a resend that throws without crashing or showing raw text', async () => {
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)
    mockResend.mockRejectedValue(new Error('boom: internal stack detail'))
    const user = userEvent.setup()
    render(gate())

    await user.type(await screen.findByLabelText('Email'), 'new@example.com{Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't send a new link just now/)
    expect(alert).not.toHaveTextContent('boom')
    // The button is usable again.
    expect(screen.getByRole('button', { name: 'Send a new confirmation email' })).toBeEnabled()
  })

  it('offers sign-in for people already confirmed, without implying it confirms them, and keeps the email', async () => {
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)
    const user = userEvent.setup()
    render(gate())

    await user.type(await screen.findByLabelText('Email'), 'me@example.com')
    expect(screen.getByText('Already confirmed your email?')).toBeInTheDocument()
    expect(screen.getByText('Signing in works only after your email is confirmed.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument()
    const email = screen.getByLabelText('Email')
    expect(email).toHaveValue('me@example.com')
    expect(email).toHaveFocus()
  })

  it('does not come back after the user signs in and later signs out', async () => {
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)
    const { rerender } = render(gate())
    await screen.findByRole('heading', { name: 'This link has expired or was already used' })

    authState.user = { id: 'u1', email: 'a@b.com' }
    rerender(gate())
    await screen.findByText('PROTECTED')

    authState.user = null
    rerender(gate())
    expect(await screen.findByRole('heading', { name: 'Sign In' })).toBeInTheDocument()
    expect(screen.queryByText(/expired or was already used/)).not.toBeInTheDocument()
  })
})

// Review, 2026-10-08: Supabase reports an expired PASSWORD-RESET link with the
// same otp_expired. A confirmation-only resend would trap those people.
describe('AuthGate — an expired password-reset link', () => {
  it('lets someone say it was a reset link and sends a new reset link, not a confirmation', async () => {
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)
    const user = userEvent.setup()
    render(gate())

    await screen.findByRole('heading', { name: 'This link has expired or was already used' })
    expect(screen.getByRole('radio', { name: 'Confirming a new account' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Resetting my password' }))
    await user.type(screen.getByLabelText('Email'), 'sam@example.com')
    await user.click(screen.getByRole('button', { name: 'Send a new reset link' }))

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith('sam@example.com'))
    expect(mockResend).not.toHaveBeenCalled()
    expect(await screen.findByText(/a new password reset link is on its way/)).toBeInTheDocument()
    expect(screen.getByText(/Remember your password\?/)).toBeInTheDocument()
    expect(screen.queryByText(/works only after your email is confirmed/)).not.toBeInTheDocument()
  })

  it('starts on password reset when this browser last asked for a reset link', async () => {
    rememberAuthEmailFlow('recovery')
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)
    const user = userEvent.setup()
    render(gate())

    expect(await screen.findByRole('radio', { name: 'Resetting my password' })).toBeChecked()
    await user.type(screen.getByLabelText('Email'), 'sam@example.com{Enter}')
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith('sam@example.com'))
    expect(mockResend).not.toHaveBeenCalled()
  })

  it('can switch back to confirming an account', async () => {
    rememberAuthEmailFlow('recovery')
    window.history.replaceState({}, '', `/${EXPIRED_HASH}`)
    const user = userEvent.setup()
    render(gate())

    await user.click(await screen.findByRole('radio', { name: 'Confirming a new account' }))
    await user.type(screen.getByLabelText('Email'), 'sam@example.com')
    await user.click(screen.getByRole('button', { name: 'Send a new confirmation email' }))
    await waitFor(() => expect(mockResend).toHaveBeenCalledWith('sam@example.com'))
    expect(mockReset).not.toHaveBeenCalled()
  })
})

describe('AuthGate — some other email-link failure', () => {
  it("says the link didn't work and shows the provider's words as text, not the expired-link copy", async () => {
    window.history.replaceState(
      {},
      '',
      '/#error=server_error&error_code=unexpected_failure&error_description=Database+is+%3Cb%3Edown%3C%2Fb%3E'
    )

    const { container } = render(gate())

    expect(await screen.findByRole('heading', { name: /That link didn.t work/ })).toHaveFocus()
    expect(screen.getByText(/The sign-in service said:/)).toHaveTextContent('Database is <b>down</b>')
    expect(container.querySelector('b')).toBeNull()
    expect(screen.queryByText(/expired or was already used/)).not.toBeInTheDocument()
    expect(screen.queryByText(/only the newest link works/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send a new confirmation email' })).not.toBeInTheDocument()
    expect(within(screen.getByText(/Still stuck\?/)).getByRole('link', { name: 'hello@symphony-os.com' }))
      .toHaveAttribute('href', 'mailto:hello@symphony-os.com')

    await waitFor(() => expect(window.location.hash).toBe(''))

    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to sign in' }))
    expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument()
  })
})

describe('AuthGate — a successful callback', () => {
  const SUCCESS_HASH = '#access_token=tok&expires_in=3600&refresh_token=ref&token_type=bearer&type=signup'

  it('leaves the URL for supabase-js and shows no link-problem copy', async () => {
    window.history.replaceState({}, '', `/${SUCCESS_HASH}`)
    authState.user = null

    render(gate())

    expect(await screen.findByRole('heading', { name: 'Sign In' })).toBeInTheDocument()
    expect(screen.queryByText(/expired or was already used|didn.t work/)).not.toBeInTheDocument()
    expect(window.location.hash).toBe(SUCCESS_HASH)
  })

  it('lets a signed-in user straight through', async () => {
    window.history.replaceState({}, '', `/${SUCCESS_HASH}`)
    authState.user = { id: 'u1', email: 'a@b.com' }

    render(gate())

    expect(await screen.findByText('PROTECTED')).toBeInTheDocument()
    expect(window.location.hash).toBe(SUCCESS_HASH)
  })
})
