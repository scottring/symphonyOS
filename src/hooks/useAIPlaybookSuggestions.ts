import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface AISuggestion {
  type: 'modify' | 'add' | 'remove'
  blockId?: string
  label: string
  blockType: string
  timeSlot?: string
  narrative?: string
  coachingNote?: string
  items?: { who: string; action: string; context?: string; coaching?: string }[]
  dayTypes?: string[]
  reason: string
  // Client-side tracking
  status: 'pending' | 'accepted' | 'rejected'
}

export interface AIPlaybookResult {
  suggestions: AISuggestion[]
  coachingInsights: string
  weeklyTheme?: string
}

export function useAIPlaybookSuggestions() {
  const [result, setResult] = useState<AIPlaybookResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateSuggestions = useCallback(async (weekOf: string) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Not authenticated')
        return
      }

      const response = await supabase.functions.invoke('generate-weekly-playbook', {
        body: { weekOf },
      })

      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate suggestions')
      }

      const data = response.data as {
        suggestions: Omit<AISuggestion, 'status'>[]
        coachingInsights: string
        weeklyTheme?: string
      }

      // Add pending status to each suggestion
      setResult({
        suggestions: (data.suggestions || []).map(s => ({ ...s, status: 'pending' as const })),
        coachingInsights: data.coachingInsights || '',
        weeklyTheme: data.weeklyTheme,
      })
    } catch (err) {
      console.error('AI suggestions error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate suggestions')
    } finally {
      setLoading(false)
    }
  }, [])

  const acceptSuggestion = useCallback((index: number) => {
    setResult(prev => {
      if (!prev) return prev
      const updated = [...prev.suggestions]
      updated[index] = { ...updated[index], status: 'accepted' }
      return { ...prev, suggestions: updated }
    })
  }, [])

  const rejectSuggestion = useCallback((index: number) => {
    setResult(prev => {
      if (!prev) return prev
      const updated = [...prev.suggestions]
      updated[index] = { ...updated[index], status: 'rejected' }
      return { ...prev, suggestions: updated }
    })
  }, [])

  const pendingSuggestions = result?.suggestions.filter(s => s.status === 'pending') || []
  const acceptedSuggestions = result?.suggestions.filter(s => s.status === 'accepted') || []

  return {
    result,
    loading,
    error,
    generateSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    pendingSuggestions,
    acceptedSuggestions,
  }
}
