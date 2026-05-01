import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'
import type { GeneratePlanResult, UndoPlanResult } from '@/types/meal-planner'

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

// supabase-js v2 wraps non-2xx responses in FunctionsHttpError with the original
// Response on `.context`. Read the body to get our edge function's real error message.
async function unwrapInvokeError(err: unknown, fallback: string): Promise<string> {
  if (!err || typeof err !== 'object') return fallback
  const ctx = (err as { context?: unknown }).context
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json()
      if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
        return (body as { error: string }).error
      }
    } catch {
      try {
        const text = await ctx.clone().text()
        if (text) return text
      } catch { /* fall through */ }
    }
  }
  const msg = (err as { message?: unknown }).message
  return typeof msg === 'string' && msg ? msg : fallback
}

export function useGeneratePlan() {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async (weekStart: Date): Promise<GenerateReturn> => {
    setGenerating(true)
    setError(null)
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke<GeneratePlanResult>(
        'meal-plan-generate',
        { body: { weekStart: toIsoDate(weekStart) } },
      )
      if (invokeErr || !data) {
        const msg = await unwrapInvokeError(invokeErr, 'generation failed')
        setError(msg)
        return { ok: false, error: msg }
      }
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
      const msg = await unwrapInvokeError(invokeErr, 'undo failed')
      return { ok: false, error: msg }
    }
    return { ok: data.ok, noop: data.noop }
  }, [])

  return { generate, undo, generating, error }
}
