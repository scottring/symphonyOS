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
