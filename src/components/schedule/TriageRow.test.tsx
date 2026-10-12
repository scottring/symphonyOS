import { describe, it, expect, vi } from 'vitest'
import type { Task } from '@/types/task'
import { applyTriageVerdict } from './TriageRow'

const task = (o: Partial<Task> = {}): Task =>
  ({ id: 't1', title: 'Test task', completed: false, bucket: 'inbox', createdAt: new Date(), updatedAt: new Date(), userId: 'me', ...o }) as Task

// "Do today" used to write the wall-clock time it was pressed at (e.g. Sep 6
// 6:50 AM) instead of the day itself, so the task showed up as a timed row
// at 6:50 AM rather than an all-day row (demo run 2026-09-06).
describe('applyTriageVerdict — today/tomorrow land all-day, not at the clock time', () => {
  it('"today" pushes midnight of the viewed day, not the time it was pressed', async () => {
    const onPushTask = vi.fn(async () => true)
    await applyTriageVerdict(task(), 'today', { viewedDate: new Date(2026, 8, 6, 6, 50), onUpdateTask: vi.fn(), onPushTask })
    expect(onPushTask).toHaveBeenCalledWith('t1', new Date(2026, 8, 6, 0, 0, 0, 0))
  })

  it('"tomorrow" pushes midnight of the next day', async () => {
    const onPushTask = vi.fn(async () => true)
    await applyTriageVerdict(task(), 'tomorrow', { viewedDate: new Date(2026, 8, 6, 6, 50), onUpdateTask: vi.fn(), onPushTask })
    expect(onPushTask).toHaveBeenCalledWith('t1', new Date(2026, 8, 7, 0, 0, 0, 0))
  })
})

// "Do today" is a CHOICE of day (planned_on), so the task lands on Today's
// main list instead of waiting in the Today pin (2026-09-19).
describe('applyTriageVerdict — "today" chooses the day', () => {
  it('an inbox task is dated to the day AND chosen for it', async () => {
    const onPushTask = vi.fn(async () => true)
    const onUpdateTask = vi.fn(async () => true)
    await applyTriageVerdict(task(), 'today', { viewedDate: new Date(2026, 8, 6, 6, 50), onUpdateTask, onPushTask })
    expect(onPushTask).toHaveBeenCalledWith('t1', new Date(2026, 8, 6))
    expect(onUpdateTask).toHaveBeenCalledWith('t1', { plannedOn: new Date(2026, 8, 6) })
  })

  it('a cancelled placement chooses nothing', async () => {
    const onUpdateTask = vi.fn(async () => true)
    const ok = await applyTriageVerdict(task(), 'today', { viewedDate: new Date(2026, 8, 6), onUpdateTask, onPushTask: vi.fn(async () => false) })
    expect(ok).toBe(false)
    expect(onUpdateTask).not.toHaveBeenCalled()
  })

  // S4: "Today" is date + focus for every task — a month- or week-list task
  // too. The date never removes its list commitment (placement module).
  it('a month-list task is dated today AND chosen (S4)', async () => {
    const onPushTask = vi.fn(async () => true)
    const onUpdateTask = vi.fn(async () => true)
    await applyTriageVerdict(task({ bucket: 'month' }), 'today', { viewedDate: new Date(2026, 8, 6), onUpdateTask, onPushTask })
    expect(onPushTask).toHaveBeenCalledWith('t1', new Date(2026, 8, 6))
    expect(onUpdateTask).toHaveBeenCalledWith('t1', { plannedOn: new Date(2026, 8, 6) })
  })

  it('"tomorrow" is a date only — no focus for tomorrow (S4)', async () => {
    const onPushTask = vi.fn(async () => true)
    const onUpdateTask = vi.fn(async () => true)
    await applyTriageVerdict(task({ bucket: 'week' }), 'tomorrow', { viewedDate: new Date(2026, 8, 6), onUpdateTask, onPushTask })
    expect(onPushTask).toHaveBeenCalledWith('t1', new Date(2026, 8, 7))
    expect(onUpdateTask).not.toHaveBeenCalled()
  })
})

// Scott, 2026-09-30: the Inbox's expired rows needed this weekend / next week
// / next weekend. Updated 2026-10-12 for the triage contract: a task's weekend
// is EITHER day (weekendPlacement), never a silently chosen Saturday, and next
// week is next week's list under the household's week start — not "Monday".
describe('applyTriageVerdict — the week choices land in their period', () => {
  it('"this-weekend" / "next-weekend" place it on that weekend, either day, without choosing it for today', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 30, 10, 0)) // Wed Sep 30
    const onPushTask = vi.fn(async () => true)
    const onUpdateTask = vi.fn(async () => true)
    await applyTriageVerdict(task(), 'this-weekend', { viewedDate: new Date(), onUpdateTask, onPushTask })
    expect(onPushTask).not.toHaveBeenCalled()
    expect(onUpdateTask).toHaveBeenLastCalledWith('t1', expect.objectContaining({ bucket: 'week', weekendStart: new Date(2026, 9, 3), scheduledFor: undefined }))
    await applyTriageVerdict(task(), 'next-weekend', { viewedDate: new Date(), onUpdateTask, onPushTask })
    expect(onUpdateTask).toHaveBeenLastCalledWith('t1', expect.objectContaining({ weekendStart: new Date(2026, 9, 10) }))
    expect(onUpdateTask.mock.calls.some(([, u]) => 'plannedOn' in (u as object) && (u as { plannedOn?: Date }).plannedOn)).toBe(false)
    vi.useRealTimers()
  })

  it('"next-week" is next week’s list (Saturday weeks: the Saturday after this one)', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 30, 10, 0)) // Wed Sep 30
    localStorage.setItem('symphony-cadence-config', JSON.stringify({ weekStartsOn: 6 }))
    const onUpdateTask = vi.fn(async () => true)
    await applyTriageVerdict(task(), 'next-week', { viewedDate: new Date(), onUpdateTask, onPushTask: vi.fn() })
    expect(onUpdateTask).toHaveBeenCalledWith('t1', { bucket: 'week', weekStart: new Date(2026, 9, 3), scheduledFor: undefined })
    localStorage.removeItem('symphony-cadence-config')
    vi.useRealTimers()
  })
})
