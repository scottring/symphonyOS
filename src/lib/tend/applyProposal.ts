//
// Turns an accepted proposal into writes. One write per task, through
// setBucket — bucket:'timed' + scheduledFor land in a single call so the
// timed-bucket invariant can't be violated by a race.

import type { TaskBucket } from '@/types/task'
import type { TendProposal } from './types'

export interface TendActions {
  setBucket: (id: string, bucket: TaskBucket, scheduledFor?: Date, isAllDay?: boolean) => void
  /** Merge case deletes each dropId via this function; callers wanting single atomic undo handle merge themselves (as WeekPage does). */
  deleteTask: (id: string) => void
}

export function applyProposal(p: TendProposal, actions: TendActions): void {
  switch (p.kind) {
    case 'merge':
      for (const id of p.dropIds) actions.deleteTask(id)
      return
    case 'put_aside':
      actions.setBucket(p.taskId, 'someday')
      return
    case 'regrade':
      actions.setBucket(p.taskId, p.to)
      return
    case 'place': {
      // Local date parts — never Date.parse (UTC shift).
      const [y, m, d] = p.date.split('-').map(Number)
      const [hh, mm] = (p.time ?? '09:00').split(':').map(Number)
      const when = new Date(y, m - 1, d, hh, mm, 0, 0)
      for (const id of p.taskIds) actions.setBucket(id, 'timed', when, false)
      return
    }
  }
}
