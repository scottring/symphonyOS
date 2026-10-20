import { describe, it, expect, vi } from 'vitest'
import type { Task } from '@/types/task'

const attach = vi.hoisted(() => ({ attachFile: vi.fn(async () => ({ id: 'a1', contentType: 'image/jpeg' })) }))
vi.mock('@/lib/taskAttachments', () => attach)
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/hooks/useWallData', () => ({ rowToTask: (r: unknown) => r, TASK_COLUMNS: '*' }))

import { matchOpenPaper, saveSchoolPaper } from './schoolPaper'

// A photographed paper (spec 2026-10-20): claim the one already on the wall,
// or add one per kid, held by whoever took the photo.
const open = (over: Partial<Task>): Task => ({
  id: 'p1', title: 'Pink health form', completed: false, createdAt: new Date(), updatedAt: new Date(),
  category: 'paper', context: 'family', assignedTo: 'k', ...over,
} as Task)

describe('matchOpenPaper', () => {
  it('a matching open paper is claimed, not duplicated', () => {
    expect(matchOpenPaper({ title: 'Pink Health Information Form' }, [open({})], 'k')?.id).toBe('p1')
  })
  it('the same due date matches a differently named paper', () => {
    const d = new Date(2026, 9, 22)
    expect(matchOpenPaper({ title: 'Zoo trip form', due: '2026-10-22' }, [open({ title: 'Field trip permission slip', neededOn: d })], 'k')?.id).toBe('p1')
  })
  it('a held or other kid\'s paper never matches', () => {
    expect(matchOpenPaper({ title: 'Pink health form' }, [open({ heldBy: 'iris' })], 'k')).toBeNull()
    expect(matchOpenPaper({ title: 'Pink health form' }, [open({ assignedTo: 'e' })], 'k')).toBeNull()
    expect(matchOpenPaper({ title: 'Pink health form' }, [open({ completed: true })], 'k')).toBeNull()
    expect(matchOpenPaper({ title: 'Pink health form' }, [open({ dismissedAt: new Date() })], 'k')).toBeNull()
  })
})

function db() {
  const updates: { patch: Record<string, unknown>; id: string }[] = []
  const inserts: Record<string, unknown>[][] = []
  return {
    updates, inserts,
    from: () => ({
      update: (patch: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { updates.push({ patch, id }); return { error: null } } }),
      insert: (rows: Record<string, unknown>[]) => ({
        select: async () => { inserts.push(rows); return { data: rows.map((_, i) => ({ id: `new-${i}` })), error: null } },
      }),
    }),
  }
}
const photo = new Blob(['x'], { type: 'image/jpeg' })

describe('saveSchoolPaper', () => {
  it('with an existing paper only claims it and attaches the photo', async () => {
    const d = db()
    expect(await saveSchoolPaper(d, { userId: 'u', kidIds: ['k'], title: 'Pink health form', notes: '', holderId: 'scott', photo, existing: open({}), today: '2026-10-20' })).toBe(true)
    expect(d.updates).toEqual([{ patch: { held_by: 'scott' }, id: 'p1' }])
    expect(d.inserts).toEqual([])
    expect(attach.attachFile).toHaveBeenCalledWith('task', 'p1', photo, expect.any(String))
  })

  it('without one, inserts one row per kid, held by the photographer', async () => {
    const d = db()
    attach.attachFile.mockClear()
    await saveSchoolPaper(d, { userId: 'u', kidIds: ['e', 'k'], title: 'Field trip slip', due: '2026-10-22', notes: '$12', holderId: 'iris', photo, today: '2026-10-20' })
    expect(d.inserts).toHaveLength(1)
    const rows = d.inserts[0]
    expect(rows.map((r) => r.assigned_to)).toEqual(['e', 'k'])
    for (const r of rows) {
      expect(r).toMatchObject({ category: 'paper', context: 'family', completed: false, held_by: 'iris', needed_on: '2026-10-22', assigned_to_all: null, user_id: 'u' })
    }
    expect(attach.attachFile).toHaveBeenCalledTimes(2)
  })

  it('an undated paper is due the next school day, like the digest\'s', async () => {
    const d = db()
    await saveSchoolPaper(d, { userId: 'u', kidIds: ['k'], title: 'Form', notes: '', holderId: 'iris', photo, today: '2026-10-23' })
    expect(d.inserts[0][0].needed_on).toBe('2026-10-26')
  })
})
