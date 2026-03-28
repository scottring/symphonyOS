import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import * as Sentry from '@sentry/react'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const loadingRef = useRef(true)

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
        setUser(session?.user ?? null)
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true)
        }
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
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  return {
    user,
    loading,
    isPasswordRecovery,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    updatePassword,
  }
}
