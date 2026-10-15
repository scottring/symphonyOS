import { describe, it, expect } from 'vitest'
import { codeFromBody, isRetryable, paperErrorMessage } from './errors'

describe('paper plan errors', () => {
  it('reads the code from both functions’ error shapes', () => {
    expect(codeFromBody({ error: { code: 'model_busy', message: 'x' } })).toBe('model_busy')
    expect(codeFromBody({ error: 'Anthropic returned 529', code: 'model_busy' })).toBe('model_busy')
    expect(codeFromBody({ error: 'Invalid token' })).toBe('unauthorized')
    expect(codeFromBody(null, 401)).toBe('unauthorized')
    expect(codeFromBody({ error: 'Unexpected token' })).toBe('unknown')
  })

  it('every message says what to do and none leaks a technical error', () => {
    for (const code of ['bad_request', 'unauthorized', 'forbidden', 'image_unavailable', 'model_busy', 'model_refused', 'reply_unreadable', 'too_long', 'server_config', 'network', 'unknown', undefined]) {
      const m = paperErrorMessage(code)
      expect(m).toMatch(/Try|Sign in|Remove|Check/)
      expect(m).not.toMatch(/JSON|token|status|Edge Function/i)
    }
  })

  it('offers a plain retry only when retrying unchanged can work', () => {
    expect(isRetryable('model_busy')).toBe(true)
    expect(isRetryable('reply_unreadable')).toBe(true)
    expect(isRetryable('image_unavailable')).toBe(false)
    expect(isRetryable('unauthorized')).toBe(false)
  })
})

describe('AI allowance refusals', () => {
  it('are read from the edge function body and say when the allowance returns, keeping the photos', () => {
    expect(codeFromBody({ error: 'The AI allowance for this day has been reached.', code: 'ai_daily_limit', retry_at: '2026-10-16T00:00:00Z' }, 429)).toBe('ai_daily_limit')
    expect(paperErrorMessage('ai_daily_limit')).toMatch(/resets tomorrow.*photos and notes are kept/)
    expect(paperErrorMessage('ai_monthly_limit')).toMatch(/resets next month/)
    expect(paperErrorMessage('ai_usage_unavailable')).toMatch(/type the plan in yourself/)
  })
  it('a used-up allowance is not retried blindly; an unavailable guard can be', () => {
    expect(isRetryable('ai_daily_limit')).toBe(false)
    expect(isRetryable('ai_monthly_limit')).toBe(false)
    expect(isRetryable('ai_usage_unavailable')).toBe(true)
  })
})
