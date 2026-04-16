/**
 * Relish API client for Symphony OS.
 *
 * Talks to the Relish Cloud Functions that back the dinner-prompt feature
 * on the wall kiosk. Shared-secret bearer auth; per-household allow-list
 * on the Relish side.
 */

const GET_URL = import.meta.env.VITE_RELISH_DINNER_PROMPT_URL || ''
const REPORT_URL = import.meta.env.VITE_RELISH_REPORT_PROMPT_URL || ''
const API_KEY = import.meta.env.VITE_RELISH_API_KEY || ''
const HOUSEHOLD_ID = import.meta.env.VITE_RELISH_HOUSEHOLD_ID || ''

export const isRelishConfigured = Boolean(GET_URL && API_KEY && HOUSEHOLD_ID)

export interface DinnerPrompt {
  text: string
  audience: 'kid' | 'adult'
  theme: string
  source: 'library' | 'synthesized'
  servedAt: string
}

function todayIso(): string {
  // YYYY-MM-DD in the device's local timezone — Symphony wall runs in the
  // household's physical location, so the local date is the right one.
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function withTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

/** Fetch today's prompt. Returns null if Relish is unreachable or misconfigured. */
export async function getDinnerPrompt(): Promise<DinnerPrompt | null> {
  if (!isRelishConfigured) return null
  const date = todayIso()
  const url = `${GET_URL}?householdId=${encodeURIComponent(HOUSEHOLD_ID)}&date=${encodeURIComponent(date)}`
  try {
    const res = await withTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    if (!res.ok) {
      console.warn(`[relish] getDinnerPrompt ${res.status}`)
      return null
    }
    return (await res.json()) as DinnerPrompt
  } catch (err) {
    console.warn('[relish] getDinnerPrompt failed', err)
    return null
  }
}

/** Request a swap — returns the new prompt. */
export async function swapDinnerPrompt(): Promise<DinnerPrompt | null> {
  if (!isRelishConfigured) return null
  const date = todayIso()
  try {
    const res = await withTimeout(GET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ householdId: HOUSEHOLD_ID, date, swap: true }),
    })
    if (!res.ok) {
      console.warn(`[relish] swapDinnerPrompt ${res.status}`)
      return null
    }
    return (await res.json()) as DinnerPrompt
  } catch (err) {
    console.warn('[relish] swapDinnerPrompt failed', err)
    return null
  }
}

/** Report the current prompt as inappropriate. Fire-and-forget from the kiosk's view. */
export async function reportDinnerPrompt(reason?: string): Promise<boolean> {
  if (!REPORT_URL || !API_KEY || !HOUSEHOLD_ID) return false
  const date = todayIso()
  try {
    const res = await withTimeout(REPORT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ householdId: HOUSEHOLD_ID, date, reason: reason ?? null }),
    })
    return res.ok
  } catch (err) {
    console.warn('[relish] reportDinnerPrompt failed', err)
    return false
  }
}
