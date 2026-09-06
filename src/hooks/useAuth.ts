import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import * as Sentry from '@sentry/react'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [sessionLost, setSessionLost] = useState(false)
  const loadingRef = useRef(true)
  // True only while a signOut() call the user asked for is in flight — a
  // SIGNED_OUT that fires while this is true is expected, not a loss.
  const signingOutRef = useRef(false)
  // What the PREVIOUS auth event carried, so a SIGNED_OUT can tell "we had a
  // session and it just vanished" from "we were already signed out".
  const prevUserRef = useRef<User | null>(null)
  const prevExpiresRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    // Timeout to prevent infinite loading if Supabase is unreachable
    const timeout = setTimeout(() => {
      if (loadingRef.current) {
        console.warn('Auth check timed out after 5 seconds')
        loadingRef.current = false
        setLoading(false)
      }
    }, 5000)

    // Listen for auth changes — must be set up BEFORE exchangeCodeForSession
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // A session that just disappeared without the user asking (signOut())
        // is a LOST session, not a clean sign-out — expiry, revocation
        // elsewhere, or a bug. Silent before this: the user just saw the
        // login screen with no record anywhere (demo run 2026-09-06).
        if (event === 'SIGNED_OUT' && prevUserRef.current && !signingOutRef.current) {
          // Guarded: `localStorage` THROWS in a private window and wherever
          // site data is blocked, and an unguarded write here would take the
          // `setUser(null)` below down with it — leaving the app rendering a
          // signed-in shell over a session that is gone. The breadcrumb is a
          // nice-to-have; the state change is not.
          try {
            localStorage.setItem('symphony.auth.lostAt', new Date().toISOString())
          } catch { /* private mode / blocked site data */ }
          Sentry.captureEvent({
            message: 'auth.session_lost',
            level: 'warning',
            extra: {
              path: window.location.pathname,
              prevExpiresAt: prevExpiresRef.current,
            },
          })
          setSessionLost(true)
        }
        if (event === 'SIGNED_IN') {
          setSessionLost(false)
          signingOutRef.current = false
        }
        setUser(session?.user ?? null)
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true)
        }
        prevUserRef.current = session?.user ?? null
        prevExpiresRef.current = session?.expires_at
      }
    )

    // Handle PKCE code exchange (password recovery, email confirm, etc.)
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(() => {
          // Clean up the URL
          window.history.replaceState({}, '', window.location.pathname)
          loadingRef.current = false
          setLoading(false)
          clearTimeout(timeout)
        })
        .catch((error) => {
          console.error('Code exchange failed:', error)
          loadingRef.current = false
          setLoading(false)
          clearTimeout(timeout)
        })
    } else {
      // No code param — just get existing session
      supabase.auth.getSession()
        .then(({ data: { session } }) => {
          setUser(session?.user ?? null)
          prevUserRef.current = session?.user ?? null
          prevExpiresRef.current = session?.expires_at
          loadingRef.current = false
          setLoading(false)
          clearTimeout(timeout)
        })
        .catch((error) => {
          console.error('Auth session check failed:', error)
          loadingRef.current = false
          setLoading(false)
          clearTimeout(timeout)
        })
    }

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  // Set Sentry user context when user changes
  useEffect(() => {
    if (import.meta.env.PROD && user) {
      Sentry.setUser({
        id: user.id,
        email: user.email || undefined,
      })
    } else if (import.meta.env.PROD && !user) {
      Sentry.setUser(null)
    }
  }, [user])

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signUpWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { error }
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    })
    return { error }
  }

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (!error) {
      setIsPasswordRecovery(false)
    }
    return { error }
  }

  const signOut = async () => {
    signingOutRef.current = true
    const { error } = await supabase.auth.signOut()
    if (error) {
      // If the server session is already dead (revoked by a password change,
      // expired while idle), auth-js errors out WITHOUT clearing the local
      // session — session_not_found maps to AuthSessionMissingError, which
      // slips past its own 401/403/404 ignore list. Left alone, Sign out
      // silently does nothing forever. The user asked to leave: drop the
      // local session ourselves and reload to the login screen.
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-')) localStorage.removeItem(key)
      }
      window.location.reload()
    }
    return { error: null }
  }

  return {
    user,
    loading,
    isPasswordRecovery,
    /** True after a SIGNED_OUT the user did not ask for (Sign out excluded).
     *  Resets on the next SIGNED_IN. */
    sessionLost,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    updatePassword,
  }
}
