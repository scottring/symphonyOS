import { describe, it, expect } from 'vitest'
import { resolveInitialDomain, localDayKey } from './useDomain'

// The domain switcher is a LENS, but quick capture reads it as a WRITE default
// (`context: currentDomain`, useShellChrome.ts:107). Persisting the lens
// forever therefore silently labels weeks of captures with a choice made once
// and forgotten — how a household routine ("Weekdays after camp: kids unpack
// bags") ended up tagged `personal`, and so `scope: 'individual'`, invisible
// to everyone else in the house.

describe('resolveInitialDomain', () => {
  const TODAY = '2026-08-22'

  it('keeps the lens you chose earlier the same day', () => {
    expect(resolveInitialDomain('family', TODAY, TODAY)).toBe('family')
    expect(resolveInitialDomain('work', TODAY, TODAY)).toBe('work')
  })

  it('resets to universal on a new day', () => {
    expect(resolveInitialDomain('personal', '2026-08-21', TODAY)).toBe('universal')
    expect(resolveInitialDomain('personal', '2026-07-04', TODAY)).toBe('universal')
  })

  it('resets when the day was never stamped — the pre-fix stored value', () => {
    // Every existing install has a domain and no day. Those are exactly the
    // stale lenses this fix exists to clear, so they must NOT be trusted.
    expect(resolveInitialDomain('personal', null, TODAY)).toBe('universal')
  })

  it('defaults to universal with nothing stored', () => {
    expect(resolveInitialDomain(null, null, TODAY)).toBe('universal')
    expect(resolveInitialDomain(null, TODAY, TODAY)).toBe('universal')
  })
})

describe('localDayKey', () => {
  it('uses the LOCAL calendar day, not UTC', () => {
    // 2026-08-22 20:30 in a UTC-5 zone is 2026-08-23 in UTC. The lens should
    // turn over when the user's day does, not when UTC's does.
    const evening = new Date(2026, 7, 22, 20, 30)
    expect(localDayKey(evening)).toBe('2026-08-22')
  })

  it('zero-pads month and day', () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
