import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
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

    // Get initial session
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

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

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

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  return {
    user,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }
}
