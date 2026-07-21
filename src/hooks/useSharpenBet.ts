import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * On-demand "sharpen" for season-bet phrasing — calls the sharpen-goal edge
 * function with mode:'bet' only when the user taps Sharpen (never on
 * render), same invoke pattern as useGoalSharpen. Unlike useGoalSharpen (which
 * shows a propose/accept card per goal), the bet coach hints replace the
 * draft input's value directly, so this just returns the rewritten sentence
 * to the caller.
 */
export function useSharpenBet() {
  const [loading, setLoading] = useState(false)

  const sharpen = useCallback(async (title: string): Promise<string | null> => {
    const trimmed = title.trim()
    if (!trimmed) return null
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('sharpen-goal', {
        body: { title: trimmed, mode: 'bet' },
      })
      if (error) throw error
      const suggestion = (data as { suggestion?: string } | null)?.suggestion
      return typeof suggestion === 'string' && suggestion.trim() ? suggestion.trim() : null
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { sharpen, loading }
}
