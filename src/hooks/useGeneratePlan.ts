import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { GeneratePlanResult, UndoPlanResult } from '@/types/meal-planner'

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface GenerateReturn {
  ok: boolean
  result?: GeneratePlanResult
  error?: string
}

interface UndoReturn {
  ok: boolean
  noop?: boolean
  error?: string
}

export function useGeneratePlan() {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUndoToken, setLastUndoToken] = useState<{ id: string; expiresAt: string } | null>(null)

  const generate = useCallback(async (weekStart: Date): Promise<GenerateReturn> => {
    setGenerating(true)
    setError(null)
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke<GeneratePlanResult>(
        'meal-plan-generate',
        { body: { weekStart: toIsoDate(weekStart) } },
      )
      if (invokeErr || !data) {
        const msg = invokeErr?.message ?? 'generation failed'
        setError(msg)
        return { ok: false, error: msg }
      }
      setLastUndoToken(data.undoToken)
      return { ok: true, result: data }
    } finally {
      setGenerating(false)
    }
  }, [])

  const undo = useCallback(async (tokenId: string): Promise<UndoReturn> => {
    const { data, error: invokeErr } = await supabase.functions.invoke<UndoPlanResult>(
      'meal-plan-undo',
      { body: { tokenId } },
    )
    if (invokeErr || !data) {
      const msg = invokeErr?.message ?? 'undo failed'
      return { ok: false, error: msg }
    }
    if (data.ok) setLastUndoToken(null)
    return { ok: data.ok, noop: data.noop }
  }, [])

  return { generate, undo, generating, error, lastUndoToken, clearUndoToken: () => setLastUndoToken(null) }
}
