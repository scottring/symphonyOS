import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { SavedImport } from './importNext'

// Friends-and-family review, 2026-10-08: the saved-import panel and the
// week's pointer were kept per tab with no account on them — signing out of
// A and into B in the same tab showed A's import to B.

const OCTOBER: SavedImport = {
  id: 'imp-1', altitude: 'month', periodStart: '2026-10-01', names: { month: 'October', season: 'Fall', year: '2026' },
  saved: 3, linked: 0, failed: 0, landings: [{ count: 3, label: 'on October’s list' }], taskIds: ['t1', 't2', 't3'], at: Date.now(),
}

/** A reload: the module starts again from what this tab kept. */
async function reload() {
  vi.resetModules()
  return import('./importNextStore')
}

beforeEach(() => { sessionStorage.clear() })

describe('importNextStore — whose import it is', () => {
  it('after a reload, the import comes back for the account that saved it and no one else', async () => {
    const before = await reload()
    before.announcePaperImport('A', OCTOBER)

    const store = await reload()
    expect(renderHook(() => store.usePaperImport('A')).result.current).toMatchObject({ id: 'imp-1' })
    expect(renderHook(() => store.usePaperImport('B')).result.current).toBeNull()
    expect(renderHook(() => store.usePaperImport(null)).result.current).toBeNull()
    // Restored, not announced in this page load: no one takes focus for it.
    expect(store.takeFresh('A', 'imp-1')).toBe(false)
  })

  it('ignores a record kept before imports had an owner', async () => {
    sessionStorage.setItem('symphony.paper.next', JSON.stringify(OCTOBER))
    sessionStorage.setItem('symphony.paper.weekFocus', JSON.stringify({ monthStart: '2026-10-01', taskIds: ['t1'], at: Date.now() }))
    const store = await reload()
    expect(renderHook(() => store.usePaperImport('A')).result.current).toBeNull()
    expect(store.peekPaperWeekFocus('A', ['2026-10-01'])).toBeNull()
  })

  it('the one-time focus belongs to the account that saved the import', async () => {
    const store = await reload()
    store.announcePaperImport('A', OCTOBER)
    expect(store.takeFresh('B', 'imp-1')).toBe(false)
    expect(store.takeFresh(null, 'imp-1')).toBe(false)
    expect(store.takeFresh('A', 'imp-1')).toBe(true)
    expect(store.takeFresh('A', 'imp-1')).toBe(false)
  })

  it('a later save by B replaces A’s, and A no longer sees one', async () => {
    const store = await reload()
    store.announcePaperImport('A', OCTOBER)
    store.announcePaperImport('B', { ...OCTOBER, id: 'imp-2' })
    expect(renderHook(() => store.usePaperImport('A')).result.current).toBeNull()
    expect(renderHook(() => store.usePaperImport('B')).result.current).toMatchObject({ id: 'imp-2' })
  })

  it('the week pointer survives a reload for its owner only', async () => {
    const before = await reload()
    before.setPaperWeekFocus('A', { monthStart: '2026-10-01', taskIds: ['t1'] })
    const store = await reload()
    expect(store.peekPaperWeekFocus('B', ['2026-10-01'])).toBeNull()
    expect(store.peekPaperWeekFocus('A', ['2026-10-01'])).toMatchObject({ monthStart: '2026-10-01', taskIds: ['t1'] })
  })

  it('nothing is kept without an owner', async () => {
    const store = await reload()
    store.announcePaperImport('', OCTOBER)
    store.setPaperWeekFocus('', { monthStart: '2026-10-01', taskIds: ['t1'] })
    expect(sessionStorage.getItem('symphony.paper.next')).toBeNull()
    expect(sessionStorage.getItem('symphony.paper.weekFocus')).toBeNull()
  })
})
