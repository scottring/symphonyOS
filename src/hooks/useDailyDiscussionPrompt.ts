import { useState, useEffect, useCallback } from 'react'
import { FAMILY_DISCUSSION_PROMPTS } from '@/data/familyDiscussionPrompts'

const STORAGE_KEY = 'symphony-wall-prompt-dismissed'
/** How many questions past today's the family has skipped — resets daily. */
const OFFSET_KEY = 'symphony-wall-prompt-offset'

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
  /** Mark tonight's question done. Explicit — never a side effect of a tap. */
  dismiss: () => void
  /** Bring tonight's question back after a dismiss. */
  undismiss: () => void
  /** Skip to the next question in the rotation (sticks for the day). */
  next: () => void
}

function readOffset(): number {
  try {
    const raw = localStorage.getItem(OFFSET_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { day?: string; offset?: number }
    return parsed.day === todayKey() && typeof parsed.offset === 'number' ? parsed.offset : 0
  } catch { return 0 }
}

export function useDailyDiscussionPrompt(): UseDailyDiscussionPromptReturn {
  const now = new Date()
  const [offset, setOffset] = useState<number>(() => readOffset())
  const idx = (dayOfYear(now) + offset) % FAMILY_DISCUSSION_PROMPTS.length
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

  const undismiss = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setDismissed(false)
  }, [])

  const next = useCallback(() => {
    setOffset((o) => {
      const n = o + 1
      try { localStorage.setItem(OFFSET_KEY, JSON.stringify({ day: todayKey(), offset: n })) } catch { /* ignore */ }
      return n
    })
  }, [])

  return { prompt, dismissed, dismiss, undismiss, next }
}
