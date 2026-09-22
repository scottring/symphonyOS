// src/hooks/usePlanSessionHost.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
// A shared, overridable save() so one test can hold the session-save step
// open — a real window between applySession's last progress write and the
// save actually finishing (see applySession.ts's final saveSession call).
const saveSessionMock = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => ({ saved: null, mine: null, loading: false, loadedToken: '2026-10-4', error: null, reload: vi.fn(), save: saveSessionMock }),
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

  // An import event that lands mid-save is ignored by the storage listener
  // (it bails out while savingRef.current is true), so a naive save would
  // silently overwrite it. saveDraft must re-read storage once it finishes,
  // catching an import that landed after the last progress write (here: in
  // the window while applySession's final saveSession() call is pending).
  it('re-reads storage after save when an import landed mid-save', async () => {
    localStorage.clear()
    let resolveSave: (() => void) | null = null
    saveSessionMock.mockImplementation(() => new Promise<boolean>((resolve) => {
      resolveSave = () => resolve(true)
    }))
    const w = writers()
    const { result } = renderHook(() => usePlanSessionHost({
      enabled: true, level: 'week', horizon: 'weekly', token: '2026-10-4', periodStart: new Date(2026, 9, 4), prevStart: new Date(2026, 8, 27),
      listsLoading: false, back: { finished: [], open: [] }, current: [], above: [], writers: w, isCompleted: () => false,
    }))
    act(() => result.current.startSession())
    act(() => result.current.changeDraft({ ...result.current.draft!, newTasks: [{ id: 'n1', title: 'Call the plumber' }] }))

    let savePromise!: Promise<void>
    act(() => { savePromise = result.current.saveDraft() })

    // Let the newTasks writer resolve and its progress write land, then —
    // while the session-save step is still pending — a page-from-paper
    // import writes its own draft to storage. The listener ignores it
    // (savingRef.current is true).
    await act(async () => { await Promise.resolve() })
    const fromPaper = { ...emptyDraft('week', new Date(2026, 9, 4), new Date(2026, 8, 27)), newTasks: [{ id: 'p1', title: 'Order the mulch' }] }
    act(() => writeDraftAndAnnounce('u1', fromPaper))
    expect(result.current.draft?.newTasks.map((t) => t.title)).toEqual(['Call the plumber'])

    await act(async () => {
      resolveSave?.()
      await savePromise
    })

    // The imported item survives the save instead of being clobbered.
    expect(result.current.draft?.newTasks.map((t) => t.title)).toContain('Order the mulch')
    saveSessionMock.mockReset().mockImplementation(async () => true)
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
