import { describe, it, expect } from 'vitest'
import { PAGE_COLUMN, PAGE_COLUMN_WIDE, PAGE_COLUMN_SPLIT, PAGE_COLUMN_FULL, PAGE_GUTTER_X } from './pageLayout'

// Scott, 2026-09-07: "the today card should appear at the exact same
// coordinates (at least on the left/starting margin) for all pages."
// Centering can only line up columns that share a width, and these three
// don't — so the left edge has to be a constant, not a leftover.
describe('the page column starts in the same place on every page', () => {
  const columns = { PAGE_COLUMN, PAGE_COLUMN_WIDE, PAGE_COLUMN_SPLIT, PAGE_COLUMN_FULL }

  it.each(Object.entries(columns))('%s carries the shared left gutter', (_name, cls) => {
    expect(cls).toContain(PAGE_GUTTER_X)
  })

  it.each(Object.entries(columns))('%s is not centered', (_name, cls) => {
    // mx-auto splits the leftover space, which makes the left edge a function
    // of the column's max-width — the whole defect.
    expect(cls).not.toContain('mx-auto')
  })

  it('one reading width for every page; only canvases and splits differ', () => {
    // Layout system (2026-10-01): one 880px column of content (992 with the
    // gutter). WIDE survives as a name for the same column.
    expect(PAGE_COLUMN).toContain('max-w-[992px]')
    expect(PAGE_COLUMN_WIDE).toBe(PAGE_COLUMN)
    expect(PAGE_COLUMN_SPLIT).toContain('max-w-[1152px]')
    expect(PAGE_COLUMN_FULL).not.toContain('max-w-')
  })
})
