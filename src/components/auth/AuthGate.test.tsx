import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { AuthGate } from './AuthGate'

// Controllable auth state shared across tests
const authState: {
  user: { id: string; email: string } | null
  loading: boolean
  isPasswordRecovery: boolean
  signOut: () => void
  updatePassword: () => Promise<{ error: { message: string } | null }>
} = {
  user: null,
  loading: false,
  isPasswordRecovery: false,
  signOut: vi.fn(),
  updatePassword: vi.fn(async () => ({ error: null })),
}

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}))

// Onboarding lookup — default: onboarding complete
const onboarding = { completedAt: new Date().toISOString() as string | null }
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { onboarding_completed_at: onboarding.completedAt },
              error: null,
            }),
        }),
      }),
    }),
  },
}))

// Stub the lazy AuthForm so it renders synchronously in tests
vi.mock('@/components/lazy', () => ({
  AuthForm: () => <div>AUTH_FORM</div>,
}))

beforeEach(() => {
  authState.user = null
  authState.loading = false
  authState.isPasswordRecovery = false
  onboarding.completedAt = new Date().toISOString()
})

describe('AuthGate', () => {
  it('renders the auth form, not its children, when no user is signed in', async () => {
    authState.user = null

    render(
      <AuthGate>{() => <div>PROTECTED</div>}</AuthGate>
    )

    expect(await screen.findByText('AUTH_FORM')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED')).not.toBeInTheDocument()
  })

  it('renders its children when the user is signed in and onboarded', async () => {
    authState.user = { id: 'u1', email: 'a@b.com' }
    onboarding.completedAt = new Date().toISOString()

    render(
      <AuthGate>{() => <div>PROTECTED</div>}</AuthGate>
    )

    expect(await screen.findByText('PROTECTED')).toBeInTheDocument()
    expect(screen.queryByText('AUTH_FORM')).not.toBeInTheDocument()
  })

  it('redirects to /onboarding when the user has not completed onboarding', async () => {
    authState.user = { id: 'u1', email: 'a@b.com' }
    onboarding.completedAt = null

    render(
      <AuthGate>{() => <div>PROTECTED</div>}</AuthGate>
    )

    await waitFor(() => expect(window.location.pathname).toBe('/onboarding'))
    expect(screen.queryByText('PROTECTED')).not.toBeInTheDocument()
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
    onboarding.completedAt = new Date().toISOString()

    render(<AuthGate>{({ user }) => <div>USER:{user.email}</div>}</AuthGate>)

    expect(await screen.findByText('USER:me@example.com')).toBeInTheDocument()
  })

  it('shows the password-reset form during password recovery', async () => {
    authState.user = { id: 'u1', email: 'a@b.com' }
    authState.isPasswordRecovery = true
    onboarding.completedAt = new Date().toISOString()

    render(
      <AuthGate>{() => <div>PROTECTED</div>}</AuthGate>
    )

    expect(await screen.findByText('Set New Password')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED')).not.toBeInTheDocument()
  })
})
