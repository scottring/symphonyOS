// src/hooks/usePlanSessionHost.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => ({ saved: null, mine: null, loading: false, loadedToken: '2026-10-4', error: null, reload: vi.fn(), save: vi.fn(async () => true) }),
  weekToken: (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, monthToken: () => '',
}))
import { usePlanSessionHost } from './usePlanSessionHost'
import { writeDraftAndAnnounce } from '@/lib/planning/sessionDraft'
import { emptyDraft } from '@/lib/planning/session'

const writers = () => ({ keep: vi.fn(async () => true), addTask: vi.fn(async (_t: string, o: { id: string }) => o.id), contextOf: () => null,
  complete: vi.fn(async () => true), someday: vi.fn(async () => true), drop: vi.fn(async () => true), takeInto: vi.fn(async () => true) })

describe('usePlanSessionHost', () => {
  it('opens on a fresh draft, saves through the writers, and closes marked just-saved', async () => {
    localStorage.clear()
    const w = writers()
    const { result } = renderHook(() => usePlanSessionHost({
      enabled: true, level: 'week', horizon: 'weekly', token: '2026-10-4', periodStart: new Date(2026, 9, 4), prevStart: new Date(2026, 8, 27),
      listsLoading: false, back: { finished: [], open: [] }, current: [], above: [], writers: w, isCompleted: () => false,
    }))
    expect(result.current.sessionReady).toBe(true)
    act(() => result.current.startSession())
    expect(result.current.draft?.level).toBe('week')
    expect(result.current.sessionOpen).toBe(true)
    act(() => result.current.changeDraft({ ...result.current.draft!, newTasks: [{ id: 'n1', title: 'Call the plumber' }] }))
    await act(async () => { await result.current.saveDraft() })
    expect(w.addTask).toHaveBeenCalledTimes(1)
    expect(result.current.sessionOpen).toBe(false)
    expect(result.current.justSaved).toBe(true)
    expect(result.current.draft).toBeNull()
  })

  // A page from paper joins the draft this session is editing. `storage` never
  // fires in the tab that wrote, so without the announcement the session would
  // save its older copy back over the import.
  it('re-reads the draft when something else in this tab writes it', () => {
    localStorage.clear()
    const { result } = renderHook(() => usePlanSessionHost({
      enabled: true, level: 'week', horizon: 'weekly', token: '2026-10-4', periodStart: new Date(2026, 9, 4), prevStart: new Date(2026, 8, 27),
      listsLoading: false, back: { finished: [], open: [] }, current: [], above: [], writers: writers(), isCompleted: () => false,
    }))
    act(() => result.current.startSession())
    expect(result.current.draft?.newTasks).toEqual([])

    const fromPaper = { ...emptyDraft('week', new Date(2026, 9, 4), new Date(2026, 8, 27)), newTasks: [{ id: 'p1', title: 'Order the mulch' }] }
    act(() => writeDraftAndAnnounce('u1', fromPaper))

    expect(result.current.draft?.newTasks.map((t) => t.title)).toEqual(['Order the mulch'])
  })

  it('ignores an announcement for another period', () => {
    localStorage.clear()
    const { result } = renderHook(() => usePlanSessionHost({
      enabled: true, level: 'week', horizon: 'weekly', token: '2026-10-4', periodStart: new Date(2026, 9, 4), prevStart: new Date(2026, 8, 27),
      listsLoading: false, back: { finished: [], open: [] }, current: [], above: [], writers: writers(), isCompleted: () => false,
    }))
    act(() => result.current.startSession())
    const other = { ...emptyDraft('week', new Date(2026, 9, 11), new Date(2026, 9, 4)), newTasks: [{ id: 'p2', title: 'Not this week' }] }
    act(() => writeDraftAndAnnounce('u1', other))
    expect(result.current.draft?.newTasks).toEqual([])
  })
})
