import { describe, expect, it } from 'vitest'
import { computeContentInset, ASSISTANT_RAIL_WIDTH, DEFAULT_DETAIL_PANEL_WIDTH } from './railLayout'

const base = { isMobile: false, railOpen: false, detailWidth: 0, isWide: false }

describe('computeContentInset', () => {
  it('is 0 with nothing open', () => {
    expect(computeContentInset(base)).toBe('0')
  })

  it('reserves the rail width when only the rail is open', () => {
    expect(computeContentInset({ ...base, railOpen: true })).toBe('420px')
  })

  it('reserves the detail width when only a detail pane is open', () => {
    expect(computeContentInset({ ...base, detailWidth: 480 })).toBe('480px')
  })

  it('reserves both on a wide viewport', () => {
    expect(computeContentInset({ ...base, railOpen: true, detailWidth: 480, isWide: true })).toBe('900px')
  })

  it('reserves only the detail pane below the wide threshold, letting the rail overlay', () => {
    expect(computeContentInset({ ...base, railOpen: true, detailWidth: 480, isWide: false })).toBe('480px')
  })

  it('respects a non-default detail width', () => {
    expect(computeContentInset({ ...base, railOpen: true, detailWidth: 420, isWide: true })).toBe('840px')
  })

  it('never insets on mobile', () => {
    expect(computeContentInset({ isMobile: true, railOpen: true, detailWidth: 480, isWide: true })).toBe('0')
  })

  it('exports the shared widths', () => {
    expect(ASSISTANT_RAIL_WIDTH).toBe(420)
    expect(DEFAULT_DETAIL_PANEL_WIDTH).toBe(480)
  })
})
