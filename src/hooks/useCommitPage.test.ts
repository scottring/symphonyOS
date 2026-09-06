import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { PlanItem } from '@/lib/planParse'

const mocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  addNote: vi.fn(),
  addRoutine: vi.fn(),
  insert: vi.fn(),
  showToast: vi.fn(),
  addGoal: vi.fn(),
  addArea: vi.fn(),
  areas: [] as { id: string; name: string }[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ insert: mocks.insert })) },
  getAuthUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
}))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ addTask: mocks.addTask }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => ({ addNote: mocks.addNote }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ getCurrentUserMember: () => ({ id: 'member-1' }) }),
}))
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => ({ addRoutine: mocks.addRoutine }) }))
vi.mock('@/hooks/useToast', () => ({ showToast: mocks.showToast }))
vi.mock('@/contexts/GoalsContext', () => ({
  useGoalsContext: () => ({ areas: mocks.areas, addArea: mocks.addArea, addGoal: mocks.addGoal }),
}))

import { useCommitPage } from './useCommitPage'

const ITEM: PlanItem = {
  title: 'Buy milk',
  placement: { kind: 'inbox' },
  time: null,
  assigneeId: null,
  note: null,
  dateHint: null,
  kind: 'task',
  recurring: null,
  phone: null,
  contactMemberId: null,
}

const GOAL: PlanItem = { title: 'Run a half marathon', placement: { kind: 'goal' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task', recurring: null, phone: null, contactMemberId: null }

function commit() {
  return renderHook(() => useCommitPage()).result.current.commitPage
}

const successToasts = () => mocks.showToast.mock.calls.filter((c) => c[1] === 'success')
const errorToasts = () => mocks.showToast.mock.calls.filter((c) => c[1] === 'error')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.addTask.mockResolvedValue('task-1')
  mocks.addNote.mockResolvedValue({ id: 'note-1' })
  mocks.addRoutine.mockResolvedValue({ id: 'r1' })
  mocks.insert.mockResolvedValue({ error: null })
  mocks.areas.length = 0
  mocks.addArea.mockResolvedValue({ id: 'area-new', name: 'General' })
  mocks.addGoal.mockResolvedValue({ id: 'goal-1' })
})

describe('useCommitPage', () => {
  it('reports the failure instead of claiming success when addTask writes nothing', async () => {
    // addTask does not throw on failure — it toasts and returns undefined. The
    // old code counted the REQUESTED items, so a page that wrote nothing still
    // toasted success and was then hard-deleted by its caller.
    mocks.addTask.mockResolvedValue(undefined)

    const result = await commit()({ items: [ITEM, ITEM], notes: [], domain: 'family', storagePath: null, altitude: 'week' })

    expect(result).toEqual({ tasksCreated: 0, goalsCreated: 0, notesCreated: 0, routinesCreated: 0, failures: 2, route: '/week', periodLabel: 'this week' })
    expect(successToasts()).toHaveLength(0)
    expect(errorToasts()[0][0]).toMatch(/could not be saved/i)
  })

  it('counts a null note as a failure and reports only what landed', async () => {
    mocks.addNote.mockResolvedValue(null)

    const result = await commit()({
      items: [ITEM],
      notes: [{ title: 'Fence quote', content: 'Ask about cedar' }],
      domain: 'family',
      storagePath: null,
      altitude: 'week',
    })

    expect(result).toEqual({ tasksCreated: 1, goalsCreated: 0, notesCreated: 0, routinesCreated: 0, failures: 1, route: '/week', periodLabel: 'this week' })
    expect(errorToasts()[0][0]).toMatch(/Added 1 task, but 1 item could not be saved/)
  })

  it('reports the actual counts on a clean commit', async () => {
    const result = await commit()({
      items: [ITEM],
      notes: [{ title: 'Fence quote', content: 'Ask about cedar' }],
      domain: 'family',
      storagePath: null,
      altitude: 'week',
    })

    expect(result).toEqual({ tasksCreated: 1, goalsCreated: 0, notesCreated: 1, routinesCreated: 0, failures: 0, route: '/week', periodLabel: 'this week' })
    expect(successToasts()[0][0]).toBe('Added 1 task, 1 note to this week')
  })

  it('writes the page domain as context on every task and note', async () => {
    const { result } = renderHook(() => useCommitPage())
    await act(() => result.current.commitPage({ items: [ITEM], notes: [{ title: 'n', content: 'c' }], domain: 'family', storagePath: null, altitude: 'week' }))
    expect(mocks.addTask).toHaveBeenCalledWith('Buy milk', undefined, undefined, undefined, expect.objectContaining({ context: 'family' }))
    expect(mocks.addNote).toHaveBeenCalledWith(expect.objectContaining({ context: 'family' }))
  })

  it('files the page attachment against the first note when there are notes', async () => {
    await commit()({
      items: [ITEM],
      notes: [{ title: 'Fence quote', content: 'Ask about cedar' }],
      domain: 'family',
      storagePath: 'user-1/supernote/page.png',
      altitude: 'week',
    })

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'note',
        entity_id: 'note-1',
        file_name: 'page.png',
        // The poller stores .png with image/png — the row must match the object.
        file_type: 'image/png',
        storage_path: 'user-1/supernote/page.png',
      }),
    )
  })

  it('files the page attachment against the first task when there are no notes', async () => {
    await commit()({ items: [ITEM], notes: [], domain: 'family', storagePath: 'user-1/supernote/page.jpg', altitude: 'week' })

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'task',
        entity_id: 'task-1',
        file_type: 'image/jpeg',
      }),
    )
  })

  it('files a PDF page with the pdf MIME type', async () => {
    await commit()({ items: [ITEM], notes: [], domain: 'family', storagePath: 'user-1/supernote/page.pdf', altitude: 'week' })

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ file_type: 'application/pdf' }),
    )
  })

  it('skips the attachment row when nothing was created to hang it on', async () => {
    mocks.addTask.mockResolvedValue(undefined)

    await commit()({ items: [ITEM], notes: [], domain: 'family', storagePath: 'user-1/supernote/page.png', altitude: 'week' })

    expect(mocks.insert).not.toHaveBeenCalled()
  })
})

// Altitudes (2026-09-06): the commit stamps the page's own domain everywhere,
// turns recurring lines into routines and day-facts into dated notes, carries
// phone/lineage on the INSERT, and returns the landing route + period label.
describe('useCommitPage — domain, routines, day-facts, lineage, route', () => {
  it('a year goal keeps its note and gets the derived scope; no area is invented', async () => {
    const { result } = renderHook(() => useCommitPage())
    await act(() => result.current.commitPage({ items: [{ ...GOAL, note: 'Chicago does not count' }], notes: [], domain: 'family', storagePath: null, altitude: 'year' }))
    expect(mocks.addGoal).toHaveBeenCalledWith(null, GOAL.title, 'family', { notes: 'Chicago does not count', scope: 'compound' })
    expect(mocks.addArea).not.toHaveBeenCalled()
  })

  it('a recurring row becomes a routine, not a task', async () => {
    const { result } = renderHook(() => useCommitPage())
    const rec = { ...ITEM, title: 'Liam soccer', kind: 'recurring' as const, recurring: { days: ['sat' as const], until: '2026-11-30' }, time: '09:00', assigneeId: 'l' }
    const res = await act(() => result.current.commitPage({ items: [rec], notes: [], domain: 'family', storagePath: null, altitude: 'season' }))
    expect(mocks.addRoutine).toHaveBeenCalledWith(expect.objectContaining({ name: 'Liam soccer', context: 'family', time_of_day: '09:00', recurrence_pattern: expect.objectContaining({ type: 'weekly', days: ['sat'] }) }))
    expect(mocks.addTask).not.toHaveBeenCalled()
    expect(res.routinesCreated).toBe(1)
  })

  it('a day-fact becomes a dated note, not a task', async () => {
    const { result } = renderHook(() => useCommitPage())
    const fact = { ...ITEM, title: 'No school – Labor Day', kind: 'dayfact' as const, placement: { kind: 'date' as const, date: '2026-09-07' }, dateHint: '2026-09-07' }
    await act(() => result.current.commitPage({ items: [fact], notes: [], domain: 'family', storagePath: null, altitude: 'month' }))
    expect(mocks.addTask).not.toHaveBeenCalled()
    expect(mocks.addNote).toHaveBeenCalledWith(expect.objectContaining({ title: 'Mon, Sep 7 · No school – Labor Day' }))
  })

  it('returns the landing route for the altitude', async () => {
    const { result } = renderHook(() => useCommitPage())
    const r = await act(() => result.current.commitPage({ items: [], notes: [], domain: 'family', storagePath: null, altitude: 'season', seasonStart: new Date(2026, 8, 1) }))
    expect(r.route).toBe('/season?start=2026-09-01')
    const y = await act(() => result.current.commitPage({ items: [], notes: [], domain: 'family', storagePath: null, altitude: 'year' }))
    expect(y.route).toBe('/year')
  })

  it('phone and lineage ride the INSERT', async () => {
    const { result } = renderHook(() => useCommitPage())
    await act(() => result.current.commitPage({ items: [{ ...ITEM, phone: '410-555-0142', sourceId: 'src-1' }], notes: [], domain: 'family', storagePath: null, altitude: 'week' }))
    expect(mocks.addTask).toHaveBeenCalledWith(expect.any(String), undefined, undefined, undefined, expect.objectContaining({ phoneNumber: '410-555-0142', sourceId: 'src-1' }))
  })
})

// A year page's lines are goals, not tasks (altitudes, 2026-09-05).
describe('useCommitPage — goals', () => {
  it('writes a goal row into the first existing area and never calls addTask for it', async () => {
    mocks.areas.push({ id: 'area-1', name: 'Health' })
    const result = await commit()({ items: [GOAL, ITEM], notes: [], domain: 'family', storagePath: null, altitude: 'week' })
    expect(mocks.addGoal).toHaveBeenCalledWith('area-1', 'Run a half marathon', 'family', { notes: null, scope: 'compound' })
    expect(mocks.addArea).not.toHaveBeenCalled()
    expect(mocks.addTask).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ tasksCreated: 1, goalsCreated: 1, notesCreated: 0, routinesCreated: 0, failures: 0, route: '/week', periodLabel: 'this week' })
    expect(successToasts()[0][0]).toMatch(/1 task.*1 goal/)
  })

  it('counts a goal that did not land as a failure', async () => {
    mocks.addGoal.mockResolvedValue(null)
    const result = await commit()({ items: [GOAL], notes: [], domain: 'family', storagePath: null, altitude: 'year' })
    expect(result.failures).toBe(1)
    expect(result.goalsCreated).toBe(0)
  })

  // Step 5: a month page stamps the month it is for; a season page the season.
  // The sheet's choice wins; without one, the page's own default applies.
  it('stamps month_start / season_start from the payload onto month and season rows', async () => {
    await commit()({
      items: [
        { ...ITEM, title: 'Repaint', placement: { kind: 'month' } },
        { ...ITEM, title: 'Trips', placement: { kind: 'season' } },
        { ...ITEM, title: 'Read more', placement: { kind: 'month' }, goal: true },
      ],
      notes: [], domain: 'family', storagePath: null, altitude: 'month',
      monthStart: new Date(2026, 9, 1), seasonStart: new Date(2026, 9, 1),
    })
    const opts = mocks.addTask.mock.calls.map((c) => c[4])
    expect(opts[0]).toMatchObject({ bucket: 'month', monthStart: new Date(2026, 9, 1), isGoal: false })
    expect(opts[1]).toMatchObject({ bucket: 'quarter', seasonStart: new Date(2026, 9, 1) })
    expect(opts[2]).toMatchObject({ bucket: 'month', isGoal: true })
    expect(mocks.addGoal).not.toHaveBeenCalled()
  })

  it('stamps the page\'s own month when the payload names none', async () => {
    await commit()({ items: [{ ...ITEM, placement: { kind: 'month' } }], notes: [], domain: 'family', storagePath: null, altitude: 'month' })
    expect(mocks.addTask.mock.calls[0][4].monthStart).toBeInstanceOf(Date)
  })
})
