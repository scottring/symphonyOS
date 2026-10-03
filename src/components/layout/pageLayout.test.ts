import { describe, it, expect } from 'vitest'
import { PAGE_COLUMN, PAGE_PLANNING } from './pageLayout'

// Scott, 2026-10-03: "widen the content space to fit a landscape screen".
describe('page widths', () => {
  it('reading pages are 1040px of content (1152 with the gutter)', () => {
    expect(PAGE_COLUMN).toContain('max-w-[1152px]')
  })
  it('planning pages fill the screen up to 1600px of content (1712 with the gutter)', () => {
    expect(PAGE_PLANNING).toContain('max-w-[1712px]')
  })
})
