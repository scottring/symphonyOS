import { describe, it, expect } from 'vitest'
import { resolveWallDark } from './wallThemeOverride'

describe('resolveWallDark', () => {
  it('follows auto with no override', () => {
    expect(resolveWallDark(false, null)).toEqual({ dark: false, override: null })
  })
  it('override dark holds while auto is unchanged', () => {
    expect(resolveWallDark(false, { dark: true, auto: false })).toEqual({ dark: true, override: { dark: true, auto: false } })
  })
  it('drops the override when auto flips, and stays auto when it flips back', () => {
    const o = { dark: true, auto: false }
    const r = resolveWallDark(true, o)
    expect(r).toEqual({ dark: true, override: null })
    expect(resolveWallDark(false, r.override)).toEqual({ dark: false, override: null })
  })
  it('a light override during auto dark ends when auto goes light', () => {
    expect(resolveWallDark(true, { dark: false, auto: true }).dark).toBe(false)
    expect(resolveWallDark(false, { dark: false, auto: true })).toEqual({ dark: false, override: null })
  })
})
