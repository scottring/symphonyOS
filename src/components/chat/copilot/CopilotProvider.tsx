import { CopilotKit } from '@copilotkit/react-core'
import type { ReactNode } from 'react'
import { useMemo, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface CopilotProviderProps {
  children: ReactNode
}

/**
 * CopilotKit provider for Symphony OS
 * Wraps the app to enable AI copilot features with Generative UI
 */
export function CopilotProvider({ children }: CopilotProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null)

  // Get and track the session access token
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAccessToken(session?.access_token ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAccessToken(session?.access_token ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Build the runtime URL for Supabase edge function
  const runtimeUrl = useMemo(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    return `${supabaseUrl}/functions/v1/copilot-runtime`
  }, [])

  // Build headers with auth token
  const headers = useMemo(() => {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (accessToken) {
      h['Authorization'] = `Bearer ${accessToken}`
    }
    return h
  }, [accessToken])

  return (
    <CopilotKit
      runtimeUrl={runtimeUrl}
      headers={headers}
      agent="symphony"
    >
      {children}
    </CopilotKit>
  )
}
