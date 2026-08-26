import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { PlanItem } from '@/lib/planParse'

const mocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  addNote: vi.fn(),
  insert: vi.fn(),
  showToast: vi.fn(),
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
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ currentDomain: 'family' }) }))
vi.mock('@/hooks/useToast', () => ({ showToast: mocks.showToast }))

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
})

describe('useCommitPage', () => {
  it('reports the failure instead of claiming success when addTask writes nothing', async () => {
    // addTask does not throw on failure — it toasts and returns undefined. The
    // old code counted the REQUESTED items, so a page that wrote nothing still
    // toasted success and was then hard-deleted by its caller.
    mocks.addTask.mockResolvedValue(undefined)

    const result = await commit()({ items: [ITEM, ITEM], notes: [], storagePath: null })

    expect(result).toEqual({ tasksCreated: 0, notesCreated: 0, failures: 2 })
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

    expect(result).toEqual({ tasksCreated: 1, notesCreated: 0, failures: 1 })
    expect(errorToasts()[0][0]).toMatch(/Added 1 task, but 1 item could not be saved/)
  })

  it('reports the actual counts on a clean commit', async () => {
    const result = await commit()({
      items: [ITEM],
      notes: [{ title: 'Fence quote', content: 'Ask about cedar' }],
      storagePath: null,
    })

    expect(result).toEqual({ tasksCreated: 1, notesCreated: 1, failures: 0 })
    expect(successToasts()[0][0]).toBe('Added 1 task and 1 note from your page')
  })

  it('creates notes as general/import so the Obsidian dual-write never fires', async () => {
    await commit()({
      items: [],
      notes: [{ title: 'Fence quote', content: 'Ask about cedar' }],
      storagePath: null,
    })

    expect(mocks.addNote).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'general', source: 'import', context: 'family' }),
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
