import type { Task } from '@/types/task'

type Match = (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) => boolean

/** Ports TodaySchedule.overdueTasks (~621-657). `now` defaults to new Date(). */
export function selectOverdue(tasks: Task[], isToday: boolean, match: Match, now: Date = new Date()): Task[] {
  if (!isToday) return []
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const isOverdue = (task: Task): boolean => {
    if (!task.scheduledFor) return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    const taskDate = new Date(task.scheduledFor)
    taskDate.setHours(0, 0, 0, 0)
    if (task.completed) {
      const completedDate = new Date(task.updatedAt)
      completedDate.setHours(0, 0, 0, 0)
      const todayDate = new Date(now)
      todayDate.setHours(0, 0, 0, 0)
      if (completedDate.getTime() !== todayDate.getTime()) return false
    }
    return taskDate < today
  }
  const result: Task[] = []
  for (const task of tasks) {
    if (isOverdue(task)) result.push(task)
    if (task.subtasks) {
      for (const subtask of task.subtasks) {
        if (isOverdue(subtask)) result.push(subtask)
      }
    }
  }
  return result
}

/** Ports TodaySchedule.inboxTasks (~662-670). */
export function selectInbox(tasks: Task[], isToday: boolean, match: Match): Task[] {
  if (!isToday) return []
  return tasks.filter((task) => {
    if (task.completed) return false
    if (task.bucket !== 'inbox') return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    return true
  })
}

/** Ports TodaySchedule.weekTasks (~673-681). */
export function selectWeek(tasks: Task[], isToday: boolean, match: Match): Task[] {
  if (!isToday) return []
  return tasks.filter((task) => {
    if (task.completed) return false
    if (task.bucket !== 'week') return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    return true
  })
}

/** Month staging pool — mirrors selectWeek for bucket 'month'. */
export function selectMonth(tasks: Task[], isToday: boolean, match: Match): Task[] {
  if (!isToday) return []
  return tasks.filter((task) => {
    if (task.completed) return false
    if (task.bucket !== 'month') return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    return true
  })
}

/** Ports TodaySchedule.completedInboxTasks (~697-713). */
export function selectCompletedInbox(tasks: Task[], viewedDate: Date, match: Match): Task[] {
  const startOfDay = new Date(viewedDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(viewedDate)
  endOfDay.setHours(23, 59, 59, 999)
  return tasks.filter((task) => {
    if (!task.completed) return false
    if (task.bucket === 'timed') return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    const updatedDate = new Date(task.updatedAt)
    if (updatedDate < startOfDay || updatedDate > endOfDay) return false
    return true
  })
}

/** Ports TodaySchedule.filteredTasks (~716-749). */
export function selectTimed(tasks: Task[], viewedDate: Date, match: Match): Task[] {
  const startOfDay = new Date(viewedDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(viewedDate)
  endOfDay.setHours(23, 59, 59, 999)
  const isOnViewedDate = (date: Date | undefined | null) => {
    if (!date) return false
    const d = new Date(date)
    return d >= startOfDay && d <= endOfDay
  }
  const result: Task[] = []
  for (const task of tasks) {
    if (!match(task.assignedTo, task.assignedToAll)) continue
    if (task.bucket === 'timed' && isOnViewedDate(task.scheduledFor)) result.push(task)
    if (task.subtasks) {
      for (const subtask of task.subtasks) {
        if (!match(subtask.assignedTo, subtask.assignedToAll)) continue
        if (subtask.bucket === 'timed' && isOnViewedDate(subtask.scheduledFor)) result.push(subtask)
      }
    }
  }
  return result
}
