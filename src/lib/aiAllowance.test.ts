import { describe, expect, it } from 'vitest'
import { allowanceMessage, allowanceReceipt, isAllowanceCode } from './aiAllowance'

describe('allowanceMessage', () => {
  // A local afternoon; the reset is local evening the same day.
  const now = new Date(2026, 9, 31, 16, 3)
  const tonight = new Date(2026, 9, 31, 20, 0).toISOString()
  const time = new Date(tonight).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  it('says the day allowance is used up and when it resets, in local time', () => {
    expect(allowanceMessage('ai_daily_limit', tonight, now))
      .toBe(`Today's AI allowance is used up. It resets at ${time}. You can still change your plans directly.`)
  })

  it('never shows the raw UTC timestamp', () => {
    expect(allowanceMessage('ai_daily_limit', '2026-11-01T00:00:00+00:00', now)).not.toMatch(/UTC|T00:00|\+00:00/)
  })

  it('names tomorrow when the reset is the next local day', () => {
    const late = new Date(2026, 9, 31, 22, 0)
    const reset = new Date(2026, 10, 1, 8, 0).toISOString()
    expect(allowanceMessage('ai_daily_limit', reset, late)).toMatch(/^Today's AI allowance is used up\. It resets tomorrow at /)
  })

  it('says the month allowance for a monthly limit', () => {
    expect(allowanceMessage('ai_monthly_limit', tonight, now)).toMatch(/^This month's AI allowance is used up\./)
  })

  it('leaves out the reset when it is missing or already past', () => {
    expect(allowanceMessage('ai_daily_limit', null, now)).toBe("Today's AI allowance is used up. You can still change your plans directly.")
    expect(allowanceMessage('ai_daily_limit', new Date(2026, 9, 31, 9).toISOString(), now)).not.toMatch(/resets/)
  })
})

describe('allowance codes and receipts', () => {
  it('recognises only the two limit codes', () => {
    expect(isAllowanceCode('ai_daily_limit')).toBe(true)
    expect(isAllowanceCode('ai_monthly_limit')).toBe(true)
    expect(isAllowanceCode('ai_usage_unavailable')).toBe(false)
    expect(isAllowanceCode(undefined)).toBe(false)
  })

  it('never blames the connection', () => {
    expect(allowanceReceipt('ai_daily_limit')).toBe("Today's AI allowance is used up. Nothing changed.")
    expect(allowanceReceipt('ai_daily_limit')).not.toMatch(/reach/i)
  })
})
