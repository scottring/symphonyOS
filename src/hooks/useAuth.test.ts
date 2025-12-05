import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAuth } from './useAuth'
import { createMockUser, createMockSession } from '@/test/mocks/factories'

// Module-level state for mocking
let mockSession: ReturnType<typeof createMockSession> | null = null
let mockSignInError: { message: string } | null = null
let mockSignUpError: { message: string } | null = null
let mockSignOutError: { message: string } | null = null
let authStateCallback: ((event: string, session: ReturnType<typeof createMockSession> | null) => void) | null = null
let mockGetSession: () => Promise<{ data: { session: ReturnType<typeof createMockSession> | null }; error: { message: string } | null }>
const mockUnsubscribe = vi.fn()

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => mockGetSession()),
      signInWithPassword: vi.fn(({ email }: { email: string; password: string }) => {
        if (mockSignInError) {
          return Promise.resolve({
            data: { user: null, session: null },
            error: mockSignInError
          })
        }
        const session = createMockSession({
          user: createMockUser({ email })
        })
        return Promise.resolve({
          data: { user: session.user, session },
          error: null
        })
      }),
      signUp: vi.fn(({ email }: { email: string }) => {
        if (mockSignUpError) {
          return Promise.resolve({
            data: { user: null, session: null },
            error: mockSignUpError
          })
        }
        const user = createMockUser({ email })
        return Promise.resolve({
          data: { user, session: null },
          error: null
        })
      }),
      signOut: vi.fn(() => {
        if (mockSignOutError) {
          return Promise.resolve({ error: mockSignOutError })
        }
        return Promise.resolve({ error: null })
      }),
      onAuthStateChange: vi.fn((callback: (event: string, session: ReturnType<typeof createMockSession> | null) => void) => {
        authStateCallback = callback
        return {
          data: {
            subscription: {
              unsubscribe: mockUnsubscribe
            }
          }
        }
      }),
    },
  },
}))

describe('useAuth', () => {
  beforeEach(() => {
    // Reset all mocks and state
    mockSession = null
    mockSignInError = null
    mockSignUpError = null
    mockSignOutError = null
    authStateCallback = null
    // Default getSession implementation
    mockGetSession = () => Promise.resolve({
      data: { session: mockSession },
      error: null
    })
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with loading=true', async () => {
      const { result } = renderHook(() => useAuth())

      // Initially loading should be true
      expect(result.current.loading).toBe(true)
      // Wait for async session check to complete to avoid act() warning
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('sets user from initial session', async () => {
      const mockUser = createMockUser({ email: 'test@example.com' })
      mockSession = createMockSession({ user: mockUser })

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toEqual(mockUser)
    })

    it('sets loading=false after session check', async () => {
      mockSession = null

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('handles no active session', async () => {
      mockSession = null

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()
    })

    it('handles session check error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockGetSession = () => Promise.reject(new Error('Network error'))

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith(
        'Auth session check failed:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  describe('session changes', () => {
    it('updates user on SIGNED_IN event', async () => {
      mockSession = null

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()

      // Simulate sign in event
      const newUser = createMockUser({ email: 'new@example.com' })
      const newSession = createMockSession({ user: newUser })

      act(() => {
        authStateCallback?.('SIGNED_IN', newSession)
      })

      expect(result.current.user).toEqual(newUser)
    })

    it('clears user on SIGNED_OUT event', async () => {
      const mockUser = createMockUser({ email: 'test@example.com' })
      mockSession = createMockSession({ user: mockUser })

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      // Simulate sign out event
      act(() => {
        authStateCallback?.('SIGNED_OUT', null)
      })

      expect(result.current.user).toBeNull()
    })

    it('handles TOKEN_REFRESHED event', async () => {
      const mockUser = createMockUser({ email: 'test@example.com' })
      mockSession = createMockSession({ user: mockUser })

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      // Simulate token refresh event with updated session
      const updatedUser = createMockUser({
        email: 'test@example.com',
        id: 'updated-user-id'
      })
      const updatedSession = createMockSession({ user: updatedUser })

      act(() => {
        authStateCallback?.('TOKEN_REFRESHED', updatedSession)
      })

      expect(result.current.user).toEqual(updatedUser)
    })

    it('unsubscribes from auth changes on unmount', async () => {
      mockSession = null

      const { unmount } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(authStateCallback).not.toBeNull()
      })

      unmount()

      expect(mockUnsubscribe).toHaveBeenCalled()
    })
  })

  describe('signInWithEmail', () => {
    it('calls signInWithPassword with correct credentials', async () => {
      mockSession = null

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const { supabase } = await import('@/lib/supabase')

      await act(async () => {
        await result.current.signInWithEmail('test@example.com', 'password123')
      })

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })

    it('returns null error on successful sign in', async () => {
      mockSession = null

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let signInResult: { error: { message: string } | null } | undefined

      await act(async () => {
        signInResult = await result.current.signInWithEmail('test@example.com', 'password123')
      })

      expect(signInResult?.error).toBeNull()
    })

    it('returns error on invalid credentials', async () => {
      mockSession = null
      mockSignInError = { message: 'Invalid login credentials' }

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let signInResult: { error: { message: string } | null } | undefined

      await act(async () => {
        signInResult = await result.current.signInWithEmail('wrong@example.com', 'wrongpass')
      })

      expect(signInResult?.error).toEqual({ message: 'Invalid login credentials' })
    })
  })

  describe('signUpWithEmail', () => {
    it('calls signUp with email and password', async () => {
      mockSession = null

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const { supabase } = await import('@/lib/supabase')

      await act(async () => {
        await result.current.signUpWithEmail('new@example.com', 'password123')
      })

      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
      })
    })

    it('returns null error on successful sign up', async () => {
      mockSession = null

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let signUpResult: { error: { message: string } | null } | undefined

      await act(async () => {
        signUpResult = await result.current.signUpWithEmail('new@example.com', 'password123')
      })

      expect(signUpResult?.error).toBeNull()
    })

    it('handles existing user error', async () => {
      mockSession = null
      mockSignUpError = { message: 'User already registered' }

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let signUpResult: { error: { message: string } | null } | undefined

      await act(async () => {
        signUpResult = await result.current.signUpWithEmail('existing@example.com', 'password123')
      })

      expect(signUpResult?.error).toEqual({ message: 'User already registered' })
    })

    it('handles weak password error', async () => {
      mockSession = null
      mockSignUpError = { message: 'Password should be at least 6 characters' }

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let signUpResult: { error: { message: string } | null } | undefined

      await act(async () => {
        signUpResult = await result.current.signUpWithEmail('new@example.com', '123')
      })

      expect(signUpResult?.error).toEqual({ message: 'Password should be at least 6 characters' })
    })
  })

  describe('signOut', () => {
    it('calls supabase.auth.signOut', async () => {
      const mockUser = createMockUser({ email: 'test@example.com' })
      mockSession = createMockSession({ user: mockUser })

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      const { supabase } = await import('@/lib/supabase')

      await act(async () => {
        await result.current.signOut()
      })

      expect(supabase.auth.signOut).toHaveBeenCalled()
    })

    it('returns null error on successful sign out', async () => {
      const mockUser = createMockUser({ email: 'test@example.com' })
      mockSession = createMockSession({ user: mockUser })

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      let signOutResult: { error: { message: string } | null } | undefined

      await act(async () => {
        signOutResult = await result.current.signOut()
      })

      expect(signOutResult?.error).toBeNull()
    })

    it('handles sign out error', async () => {
      const mockUser = createMockUser({ email: 'test@example.com' })
      mockSession = createMockSession({ user: mockUser })
      mockSignOutError = { message: 'Sign out failed' }

      const { result } = renderHook(() => useAuth())

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      let signOutResult: { error: { message: string } | null } | undefined

      await act(async () => {
        signOutResult = await result.current.signOut()
      })

      expect(signOutResult?.error).toEqual({ message: 'Sign out failed' })
    })
  })
})
