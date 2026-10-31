// src/lib/aiAllowance.ts
//
// The AI allowance refusal (supabase/functions/_shared/aiUsage.ts), said
// plainly and in the reader's own time. The server writes the reset in UTC
// ("2026-11-01T00:00:00+00:00 (UTC)") because it doesn't know where the reader
// is; this turns it into "It resets at 8:00 PM."

export type AllowanceCode = 'ai_daily_limit' | 'ai_monthly_limit'

export function isAllowanceCode(code: unknown): code is AllowanceCode {
  return code === 'ai_daily_limit' || code === 'ai_monthly_limit'
}

function resetPhrase(retryAt: string | null | undefined, now: Date): string | null {
  const at = retryAt ? new Date(retryAt) : null
  if (!at || !Number.isFinite(at.getTime()) || at.getTime() <= now.getTime()) return null
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sameDay = at.toDateString() === now.toDateString()
  if (sameDay) return `It resets at ${time}.`
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  if (at.toDateString() === tomorrow.toDateString()) return `It resets tomorrow at ${time}.`
  return `It resets ${at.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} at ${time}.`
}

/** "Today's AI allowance is used up. It resets at 8:00 PM. You can still
 *  change your plans directly." */
export function allowanceMessage(code: AllowanceCode, retryAt?: string | null, now: Date = new Date()): string {
  const used = code === 'ai_monthly_limit' ? "This month's AI allowance is used up." : "Today's AI allowance is used up."
  const reset = resetPhrase(retryAt, now)
  return [used, reset, 'You can still change your plans directly.'].filter(Boolean).join(' ')
}

/** The receipt line under a refused chat turn. */
export function allowanceReceipt(code: AllowanceCode): string {
  return code === 'ai_monthly_limit' ? "This month's AI allowance is used up. Nothing changed." : "Today's AI allowance is used up. Nothing changed."
}
