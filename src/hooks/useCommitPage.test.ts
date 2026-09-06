import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { PlanItem } from '@/lib/planParse'

const mocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  addNote: vi.fn(),
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
vi.mock('@/hooks/useToast', () => ({ showToast: mocks.showToast }))
vi.mock('@/contexts/GoalsContext', () => ({
  useGoalsContext: () => ({ areas: mocks.areas, addArea: mocks.addArea, addGoal: mocks.addGoal }),
}))

import { useCommitPage } from './useCommitPage'

const ITEM: PlanItem = {
  title: 'Call the dentist',
  placement: { kind: 'inbox' },
  assigneeId: null,
  note: null,
}

function commit() {
  return renderHook(() => useCommitPage()).result.current.commitPage
}

const successToasts = () => mocks.showToast.mock.calls.filter((c) => c[1] === 'success')
const errorToasts = () => mocks.showToast.mock.calls.filter((c) => c[1] === 'error')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.addTask.mockResolvedValue('task-1')
  mocks.addNote.mockResolvedValue({ id: 'note-1' })
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

    const result = await commit()({ items: [ITEM, ITEM], notes: [], storagePath: null })

    expect(result).toEqual({ tasksCreated: 0, goalsCreated: 0, notesCreated: 0, failures: 2 })
    expect(successToasts()).toHaveLength(0)
    expect(errorToasts()[0][0]).toMatch(/could not be saved/i)
  })

  it('counts a null note as a failure and reports only what landed', async () => {
    mocks.addNote.mockResolvedValue(null)

    const result = await commit()({
      items: [ITEM],
      notes: [{ title: 'Fence quote', content: 'Ask about cedar' }],
      storagePath: null,
    })

    expect(result).toEqual({ tasksCreated: 1, goalsCreated: 0, notesCreated: 0, failures: 1 })
    expect(errorToasts()[0][0]).toMatch(/Added 1 task, but 1 item could not be saved/)
  })

  it('reports the actual counts on a clean commit', async () => {
    const result = await commit()({
      items: [ITEM],
      notes: [{ title: 'Fence quote', content: 'Ask about cedar' }],
      storagePath: null,
    })

    expect(result).toEqual({ tasksCreated: 1, goalsCreated: 0, notesCreated: 1, failures: 0 })
    expect(successToasts()[0][0]).toBe('Added 1 task and 1 note from your page')
  })

  it('creates notes as general/import — a page commit is a capture, so it never stamps a context', async () => {
    await commit()({
      items: [],
      notes: [{ title: 'Fence quote', content: 'Ask about cedar' }],
      storagePath: null,
    })

    expect(mocks.addNote).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'general', source: 'import', context: undefined }),
    )
  })

  it('files the page attachment against the first note when there are notes', async () => {
    await commit()({
      items: [ITEM],
      notes: [{ title: 'Fence quote', content: 'Ask about cedar' }],
      storagePath: 'user-1/supernote/page.png',
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
    await commit()({ items: [ITEM], notes: [], storagePath: 'user-1/supernote/page.jpg' })

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'task',
        entity_id: 'task-1',
        file_type: 'image/jpeg',
      }),
    )
  })

  it('files a PDF page with the pdf MIME type', async () => {
    await commit()({ items: [ITEM], notes: [], storagePath: 'user-1/supernote/page.pdf' })

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ file_type: 'application/pdf' }),
    )
  })

  it('skips the attachment row when nothing was created to hang it on', async () => {
    mocks.addTask.mockResolvedValue(undefined)

    await commit()({ items: [ITEM], notes: [], storagePath: 'user-1/supernote/page.png' })

    expect(mocks.insert).not.toHaveBeenCalled()
  })
})

// A year page's lines are goals, not tasks (altitudes, 2026-09-05).
describe('useCommitPage — goals', () => {
  const GOAL: PlanItem = { title: 'Run a half marathon', placement: { kind: 'goal' }, time: null, assigneeId: null, note: null }

  it('writes a goal row into the first existing area and never calls addTask for it', async () => {
    mocks.areas.push({ id: 'area-1', name: 'Health' })
    const result = await commit()({ items: [GOAL, ITEM], notes: [], storagePath: null })
    expect(mocks.addGoal).toHaveBeenCalledWith('area-1', 'Run a half marathon', undefined)
    expect(mocks.addArea).not.toHaveBeenCalled()
    expect(mocks.addTask).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ tasksCreated: 1, goalsCreated: 1, notesCreated: 0, failures: 0 })
    expect(successToasts()[0][0]).toMatch(/1 task and 1 goal/)
  })

  it('creates a General area when the household has none yet', async () => {
    await commit()({ items: [GOAL], notes: [], storagePath: null })
    expect(mocks.addArea).toHaveBeenCalledWith('General')
    expect(mocks.addGoal).toHaveBeenCalledWith('area-new', 'Run a half marathon', undefined)
  })

  it('counts a goal that did not land as a failure', async () => {
    mocks.addGoal.mockResolvedValue(null)
    const result = await commit()({ items: [GOAL], notes: [], storagePath: null })
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
      notes: [], storagePath: null,
      monthStart: new Date(2026, 9, 1), seasonStart: new Date(2026, 9, 1),
    })
    const opts = mocks.addTask.mock.calls.map((c) => c[4])
    expect(opts[0]).toMatchObject({ bucket: 'month', monthStart: new Date(2026, 9, 1), isGoal: false })
    expect(opts[1]).toMatchObject({ bucket: 'quarter', seasonStart: new Date(2026, 9, 1) })
    expect(opts[2]).toMatchObject({ bucket: 'month', isGoal: true })
    expect(mocks.addGoal).not.toHaveBeenCalled()
  })

  it('stamps the page\'s own month when the payload names none', async () => {
    await commit()({ items: [{ ...ITEM, placement: { kind: 'month' } }], notes: [], storagePath: null })
    expect(mocks.addTask.mock.calls[0][4].monthStart).toBeInstanceOf(Date)
  })
})
