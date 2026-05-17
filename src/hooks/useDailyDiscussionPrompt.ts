import { useState, useEffect, useCallback } from 'react'
import { FAMILY_DISCUSSION_PROMPTS } from '@/data/familyDiscussionPrompts'

const STORAGE_KEY = 'symphony-wall-prompt-dismissed'

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export interface UseDailyDiscussionPromptReturn {
  prompt: string
  dismissed: boolean
  dismiss: () => void
}

export function useDailyDiscussionPrompt(): UseDailyDiscussionPromptReturn {
  const now = new Date()
  const idx = dayOfYear(now) % FAMILY_DISCUSSION_PROMPTS.length
  const prompt = FAMILY_DISCUSSION_PROMPTS[idx]

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === todayKey()
    } catch { return false }
  })

  useEffect(() => {
    const id = setInterval(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        setDismissed(stored === todayKey())
      } catch { /* ignore */ }
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const dismiss = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, todayKey()) } catch { /* ignore */ }
    setDismissed(true)
  }, [])

  return { prompt, dismissed, dismiss }
}
