import { describe, it, expect } from 'vitest'
import { pathForView } from './useDesktopBridge'

describe('pathForView', () => {
  it('maps shell views to router paths', () => {
    expect(pathForView('today')).toBe('/')
    expect(pathForView('week')).toBe('/week')
    expect(pathForView('month')).toBe('/month')
    expect(pathForView('season')).toBe('/season')
    expect(pathForView('year')).toBe('/year')
    expect(pathForView('inbox')).toBe('/inbox')
    expect(pathForView('routines')).toBe('/routines')
  })
  it('ignores the retired Projects item an older shell may still send', () => {
    expect(pathForView('projects')).toBeNull()
  })
  it('returns null for unknown views', () => {
    expect(pathForView('nonsense')).toBeNull()
  })
})
