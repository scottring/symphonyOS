import { describe, it, expect } from 'vitest'
import { pathForView } from './useDesktopBridge'

describe('pathForView', () => {
  it('maps shell views to router paths', () => {
    expect(pathForView('today')).toBe('/')
    expect(pathForView('inbox')).toBe('/inbox')
    expect(pathForView('projects')).toBe('/projects')
    expect(pathForView('routines')).toBe('/routines')
  })
  it('returns null for unknown views', () => {
    expect(pathForView('nonsense')).toBeNull()
  })
})
