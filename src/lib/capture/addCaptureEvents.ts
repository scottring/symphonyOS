// ⌘K's event card (Scott, 2026-10-30): the events read off a screenshot go on
// the calendar — each carrying the printed details, the links and the picture —
// and the Inbox row the picture became is removed. If any event fails, the row
// and its picture stay put, so nothing read off the picture is lost.
import type { CaptureEvent, PhotoCaptureResult } from '@/hooks/usePhotoCapture'
import type { TaskContext } from '@/types/task'
import { eventSpan } from './captureEvents'

type Row = Record<string, unknown>
type Result<T> = PromiseLike<{ data: T; error: unknown }>
/** The slice of the Supabase client this needs (RLS-scoped, the person's own). */
export interface CaptureEventsDb {
  from(table: string): {
    upsert(row: Row, opts: { onConflict: string }): { select(cols: string): { single(): Result<Row | null> } }
    select(cols: string): { eq(c: string, v: string): { eq(c: string, v: string): { eq(c: string, v: string): { maybeSingle(): Result<Row | null> } } } }
    update(row: Row): { eq(c: string, v: string): Result<unknown> }
    insert(rows: Row[]): Result<unknown>
    delete(): { eq(c: string, v: string): Result<unknown> }
  }
}

export interface CaptureEventsDeps {
  db: CaptureEventsDb
  userId: string
  /** The Google calendar to write to (null = primary); undefined = no calendar connected. */
  calendarId: string | null | undefined
  createEvent: (p: { title: string; startTime: Date; endTime: Date; allDay: boolean; location?: string; description?: string; timeZone: string; calendarId?: string }) => Promise<{ id: string }>
  addTask: (title: string, start: Date, opts: { assignedTo?: string; assignedToAll?: string[]; category: 'event'; context?: TaskContext; isAllDay: boolean }) => Promise<string | null | undefined>
  deleteTask: (id: string) => Promise<unknown>
}

export async function addCaptureEvents(
  capture: PhotoCaptureResult,
  events: Array<CaptureEvent & { assignedMemberIds: string[] }>,
  context: TaskContext | null,
  deps: CaptureEventsDeps,
): Promise<{ added: number; failed: number }> {
  const { db, userId, calendarId } = deps
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const linkLines = capture.links.map((l) => (l.title ? `${l.title}: ${l.url}` : l.url))
  const homes: Array<{ entity_type: 'event_note' | 'task'; entity_id: string }> = []
  let failed = 0
  for (const e of events) {
    const { start, end } = eventSpan(e)
    const ids = e.assignedMemberIds
    try {
      if (calendarId !== undefined) {
        const created = await deps.createEvent({
          title: e.title,
          startTime: start,
          endTime: end,
          allDay: e.allDay,
          location: e.location ?? undefined,
          description: [e.details, ...linkLines].filter(Boolean).join('\n') || undefined,
          timeZone,
          calendarId: calendarId ?? undefined,
        })
        const { data: note, error } = await db
          .from('event_notes')
          .upsert({
            user_id: userId,
            google_event_id: created.id,
            notes: e.details,
            links: capture.links,
            assigned_to: ids[0] ?? null,
            assigned_to_all: ids,
            context,
            event_title: e.title,
            event_start_time: start.toISOString(),
          }, { onConflict: 'user_id,google_event_id' })
          .select('id')
          .single()
        if (error || !note) throw error ?? new Error('Event note not saved')
        homes.push({ entity_type: 'event_note', entity_id: note.id as string })
      } else {
        // No calendar connected: the same event as a Symphony event task.
        const id = await deps.addTask(e.title, start, {
          assignedTo: ids[0],
          assignedToAll: ids.length > 1 ? ids : undefined,
          category: 'event',
          context: context ?? undefined,
          isAllDay: e.allDay,
        })
        if (!id) throw new Error('Event task not saved')
        homes.push({ entity_type: 'task', entity_id: id })
      }
    } catch (err) {
      console.error('Capture event not added:', err)
      failed++
    }
  }
  if (!homes.length || failed) return { added: homes.length, failed }

  // The picture goes with every event: its attachment row moves to the first,
  // and a row on the same stored file is added for each other one.
  const { data: picture } = await db
    .from('attachments')
    .select('id, file_name, file_type, file_size, storage_path, facets, analyzed_at')
    .eq('entity_type', 'task')
    .eq('entity_id', capture.taskId)
    .eq('storage_path', capture.storagePath)
    .maybeSingle()
  if (picture) {
    const { id: pictureId, ...file } = picture
    await db.from('attachments').update(homes[0]).eq('id', pictureId as string)
    if (homes.length > 1) await db.from('attachments').insert(homes.slice(1).map((h) => ({ ...file, ...h, user_id: userId })))
  }
  await deps.deleteTask(capture.taskId)
  // deleteTask skips a row its list has not loaded yet (realtime lag).
  await db.from('tasks').delete().eq('id', capture.taskId)
  return { added: homes.length, failed: 0 }
}
