// useYearbookGeneration — calls the generate-yearbook-content edge function

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface UseYearbookGenerationReturn {
  isGenerating: boolean
  error: string | null
  lastCount: number | null
  generateContent: (personId: string, yearbookId: string, manualId: string, count?: number) => Promise<number>
}

export function useYearbookGeneration(householdId: string | null): UseYearbookGenerationReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCount, setLastCount] = useState<number | null>(null)

  const generateContent = useCallback(async (
    personId: string,
    yearbookId: string,
    manualId: string,
    count = 10,
  ): Promise<number> => {
    if (!householdId) throw new Error('No household')

    setIsGenerating(true)
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-yearbook-content', {
        body: { householdId, personId, yearbookId, manualId, count },
      })

      if (fnError) throw new Error(fnError.message || 'Generation failed')

      const generated = data?.count ?? 0
      setLastCount(generated)
      return generated
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate content'
      setError(message)
      throw err
    } finally {
      setIsGenerating(false)
    }
  }, [householdId])

  return { isGenerating, error, lastCount, generateContent }
}
