import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@/test/test-utils'
import { AuthGate } from './AuthGate'

// Controllable auth state shared across tests
const authState: {
  user: { id: string; email: string } | null
  loading: boolean
  isPasswordRecovery: boolean
  sessionLost: boolean
  signOut: () => void
  updatePassword: () => Promise<{ error: { message: string } | null }>
} = {
  user: null,
  loading: false,
  isPasswordRecovery: false,
  sessionLost: false,
  signOut: vi.fn(),
  updatePassword: vi.fn(async () => ({ error: null })),
}

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}))

// Stub the lazy AuthForm so it renders synchronously in tests. Renders the
// `message` prop too — the session-ended banner AuthGate hands it.
vi.mock('@/components/lazy', () => ({
  AuthForm: ({ message }: { message?: string }) => (
    <div>AUTH_FORM{message && <p>{message}</p>}</div>
  ),
}))

// Pairing in progress (src/lib/display/pairing.ts), set per test.
const pairingState = vi.hoisted(() => ({ now: false }))
vi.mock('@/lib/display/pairing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/display/pairing')>()),
  usePairing: () => pairingState.now,
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(() => {
  vi.stubEnv('VITE_TEST_ACCOUNT_IDS', '')
  vi.stubEnv('VITE_TEST_VERSION', '')
  authState.user = null
  authState.loading = false
  authState.isPasswordRecovery = false
  authState.sessionLost = false
  pairingState.now = false
  mockNavigate.mockClear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})
afterEach(() => vi.unstubAllEnvs())

describe('AuthGate', () => {
  it('the normal release accepts any authenticated account without a test badge', async () => {
    authState.user = { id: 'ordinary-account-outside-test-allowlist', email: 'person@example.test' }
    render(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)
    expect(await screen.findByText('PROTECTED')).toBeInTheDocument()
    expect(screen.queryByTestId('test-version')).toBeNull()
  })

  it('a separately configured test build still restricts account access', async () => {
    vi.stubEnv('VITE_TEST_ACCOUNT_IDS', 'test-account')
    authState.user = { id: 'ordinary-account', email: 'person@example.test' }
    render(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)
    expect(await screen.findByText('Use the prepared test account for this walkthrough.')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED')).toBeNull()
  })

  it('renders the auth form, not its children, when no user is signed in', async () => {
    authState.user = null

    render(
      <AuthGate>{() => <div>PROTECTED</div>}</AuthGate>
    )

    expect(await screen.findByText('AUTH_FORM')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED')).not.toBeInTheDocument()
  })

  it('renders its children when the user is signed in', async () => {
    authState.user = { id: 'u1', email: 'a@b.com' }

    render(
      <AuthGate>{() => <div>PROTECTED</div>}</AuthGate>
    )

    expect(await screen.findByText('PROTECTED')).toBeInTheDocument()
    expect(screen.queryByText('AUTH_FORM')).not.toBeInTheDocument()
  })

  it('shows the loading state while auth is still resolving', () => {
    authState.user = null
    authState.loading = true

    render(
      <AuthGate>{() => <div>PROTECTED</div>}</AuthGate>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('AUTH_FORM')).not.toBeInTheDocument()
  })

  it('passes the signed-in user to its children via the render prop', async () => {
    authState.user = { id: 'u1', email: 'me@example.com' }

    render(<AuthGate>{({ user }) => <div>USER:{user.email}</div>}</AuthGate>)

    expect(await screen.findByText('USER:me@example.com')).toBeInTheDocument()
  })

  it('shows the password-reset form during password recovery', async () => {
    authState.user = { id: 'u1', email: 'a@b.com' }
    authState.isPasswordRecovery = true

    render(
      <AuthGate>{() => <div>PROTECTED</div>}</AuthGate>
    )

    expect(await screen.findByText('Set New Password')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED')).not.toBeInTheDocument()
  })

  // A session that ends mid-tab used to drop the user straight to a bare
  // login screen with no explanation, and — once signed back in — leave them
  // on Today instead of wherever they were (demo run 2026-09-06).
  describe('session-ended recovery', () => {
    it('explains a lost session on the sign-in card', async () => {
      authState.user = null
      authState.sessionLost = true

      render(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)

      expect(await screen.findByText('AUTH_FORM')).toBeInTheDocument()
      expect(screen.getByText('Your session ended. Sign in to continue where you were.')).toBeInTheDocument()
    })

    it('explains a return-flagged sign-in even without sessionLost (e.g. a 401 redirect)', async () => {
      authState.user = null
      authState.sessionLost = false
      window.history.replaceState({}, '', '/?return=%2Fweek')

      render(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)

      expect(await screen.findByText('Your session ended. Sign in to continue where you were.')).toBeInTheDocument()
    })

    it('shows no banner on a plain sign-in with no lost session or return hint', async () => {
      authState.user = null

      render(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)

      expect(await screen.findByText('AUTH_FORM')).toBeInTheDocument()
      expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument()
    })

    it('navigates to the stored return route after signing back in', async () => {
      authState.user = null
      window.history.replaceState({}, '', '/?return=%2Fweek')

      const { rerender } = render(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)
      await screen.findByText('AUTH_FORM')

      authState.user = { id: 'u1', email: 'a@b.com' }
      rerender(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)

      await screen.findByText('PROTECTED')
      expect(mockNavigate).toHaveBeenCalledWith('/week', { replace: true })
    })

    it('defaults to /today when no return route was stored', async () => {
      authState.user = null
      authState.sessionLost = true

      const { rerender } = render(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)
      await screen.findByText('AUTH_FORM')

      authState.user = { id: 'u1', email: 'a@b.com' }
      rerender(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)

      await screen.findByText('PROTECTED')
      expect(mockNavigate).toHaveBeenCalledWith('/today', { replace: true })
    })

    // Found in review: AuthGate mounts once at the app root, and the return
    // hint was captured via a lazy useState initializer that never re-runs —
    // so it stayed "true" for the component's whole lifetime. A later
    // deliberate sign-out/sign-in in the SAME tab re-triggered the banner and
    // the forced navigation from a hint that had already done its job.
    it('does not re-arm the banner or redirect on a later sign-out/sign-in cycle', async () => {
      authState.user = null
      window.history.replaceState({}, '', '/?return=%2Fweek')

      const { rerender } = render(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)
      await screen.findByText('AUTH_FORM')
      expect(screen.getByText('Your session ended. Sign in to continue where you were.')).toBeInTheDocument()

      // First sign-in: consumes the return hint, redirects once.
      authState.user = { id: 'u1', email: 'a@b.com' }
      rerender(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)
      await screen.findByText('PROTECTED')
      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/week', { replace: true })

      // A deliberate sign-out — sessionLost stays false (useAuth's own guard).
      authState.user = null
      authState.sessionLost = false
      rerender(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)
      await screen.findByText('AUTH_FORM')
      expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument()

      // Signing back in must NOT re-navigate or re-show the banner.
      authState.user = { id: 'u1', email: 'a@b.com' }
      rerender(<AuthGate>{() => <div>PROTECTED</div>}</AuthGate>)
      await screen.findByText('PROTECTED')
      expect(mockNavigate).toHaveBeenCalledTimes(1)
    })
  })
})

describe('AuthGate on the wall', () => {
  it('shows pairing, not a person’s sign-in, when signed out on /wall-v2; "Sign in instead" is one tap away', () => {
    window.history.replaceState({}, '', '/wall-v2')
    render(<AuthGate>{() => <div>APP</div>}</AuthGate>)
    expect(screen.getByRole('button', { name: /pair this display/i })).toBeInTheDocument()
    expect(screen.queryByText('AUTH_FORM')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /sign in instead/i }))
    expect(screen.getByText('AUTH_FORM')).toBeInTheDocument()
  })
  it('keeps pairing up while the wall, just signed in, is still claiming its code', () => {
    window.history.replaceState({}, '', '/wall-v2')
    authState.user = { id: 'anon-display', email: '' }
    pairingState.now = true
    render(<AuthGate>{() => <div>APP</div>}</AuthGate>)
    expect(screen.getByRole('button', { name: /pair this display/i })).toBeInTheDocument()
    expect(screen.queryByText('APP')).toBeNull()
  })
  it('keeps the ordinary sign-in everywhere else', () => {
    window.history.replaceState({}, '', '/today')
    render(<AuthGate>{() => <div>APP</div>}</AuthGate>)
    expect(screen.getByText('AUTH_FORM')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pair this display/i })).toBeNull()
  })
})
