import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addCaptureEvents, type CaptureEventsDb, type CaptureEventsDeps } from './addCaptureEvents'
import type { PhotoCaptureResult } from '@/hooks/usePhotoCapture'

// A recording fake of the few Supabase calls the writer makes.
function fakeDb(picture: Record<string, unknown> | null = { id: 'a1', file_name: 'screenshot.jpg', file_type: 'image/jpeg', file_size: 9, storage_path: 'u/capture/t1.jpg', facets: [], analyzed_at: 'x' }) {
  const calls: Array<[string, string, unknown]> = []
  let note = 0
  const db: CaptureEventsDb = {
    from: (table) => ({
      upsert: (row) => ({ select: () => ({ single: async () => { calls.push([table, 'upsert', row]); return { data: { id: `n${++note}` }, error: null } } }) }),
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: picture, error: null }) }) }) }) }),
      update: (row) => ({ eq: async (_c, v) => { calls.push([table, 'update', { ...row, id: v }]); return { data: null, error: null } } }),
      insert: async (rows) => { calls.push([table, 'insert', rows]); return { data: null, error: null } },
      delete: () => ({ eq: async (_c, v) => { calls.push([table, 'delete', v]); return { data: null, error: null } } }),
    }),
  }
  return { db, calls }
}

const capture: PhotoCaptureResult = { taskId: 't1', storagePath: 'u/capture/t1.jpg', events: [], links: [{ url: 'https://southwest.com/manage', title: 'Manage this flight' }] }
const flight = (title: string, start: string) => ({ title, start, end: null, allDay: false, location: 'BWI', who: ['Iris'], details: 'Confirmation 2ILYQY', assignedMemberIds: ['iris'] })
const out = flight('Flight BWI → BOS', '2026-12-04T22:10:00.000Z')
const back = flight('Flight BOS → BWI', '2026-12-07T16:20:00.000Z')

let deps: CaptureEventsDeps
let fake: ReturnType<typeof fakeDb>
beforeEach(() => {
  fake = fakeDb()
  deps = {
    db: fake.db, userId: 'u', calendarId: 'family-cal',
    createEvent: vi.fn(async (p) => ({ id: `g-${p.title}` })),
    addTask: vi.fn(async () => 'task-new'),
    deleteTask: vi.fn(async () => undefined),
  }
})

describe('addCaptureEvents', () => {
  it('writes each event to the calendar with the details and links, notes who it is for, moves the picture, and removes the Inbox row', async () => {
    const r = await addCaptureEvents(capture, [out, back], 'family', deps)
    expect(r).toEqual({ added: 2, failed: 0 })
    expect(deps.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Flight BWI → BOS', calendarId: 'family-cal', location: 'BWI',
      description: 'Confirmation 2ILYQY\nManage this flight: https://southwest.com/manage',
      startTime: new Date('2026-12-04T22:10:00.000Z'), endTime: new Date('2026-12-04T23:10:00.000Z'),
    }))
    expect(fake.calls).toContainEqual(['event_notes', 'upsert', expect.objectContaining({ google_event_id: 'g-Flight BWI → BOS', assigned_to_all: ['iris'], context: 'family', links: capture.links })])
    expect(fake.calls).toContainEqual(['attachments', 'update', { entity_type: 'event_note', entity_id: 'n1', id: 'a1' }])
    expect(fake.calls).toContainEqual(['attachments', 'insert', [expect.objectContaining({ entity_type: 'event_note', entity_id: 'n2', storage_path: 'u/capture/t1.jpg', user_id: 'u' })]])
    expect(deps.deleteTask).toHaveBeenCalledWith('t1')
    expect(fake.calls).toContainEqual(['tasks', 'delete', 't1'])
  })

  it('keeps the Inbox row and its picture when any event fails', async () => {
    deps.createEvent = vi.fn(async (p) => { if (p.title === 'Flight BOS → BWI') throw new Error('Google said no'); return { id: 'g1' } })
    const r = await addCaptureEvents(capture, [out, back], 'family', deps)
    expect(r).toEqual({ added: 1, failed: 1 })
    expect(deps.deleteTask).not.toHaveBeenCalled()
    expect(fake.calls.some(([t]) => t === 'attachments' || t === 'tasks')).toBe(false)
  })

  it('without a connected calendar, makes Symphony event tasks instead', async () => {
    deps.calendarId = undefined
    const r = await addCaptureEvents(capture, [out], null, deps)
    expect(r).toEqual({ added: 1, failed: 0 })
    expect(deps.createEvent).not.toHaveBeenCalled()
    expect(deps.addTask).toHaveBeenCalledWith('Flight BWI → BOS', new Date('2026-12-04T22:10:00.000Z'), expect.objectContaining({ category: 'event', assignedTo: 'iris', isAllDay: false }))
    expect(fake.calls).toContainEqual(['attachments', 'update', { entity_type: 'task', entity_id: 'task-new', id: 'a1' }])
  })
})
