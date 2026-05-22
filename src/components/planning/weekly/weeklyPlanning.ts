import type { Task } from '@/types/task'

/** ISO-8601 week id, e.g. "2026-W21". */
export function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export interface WeeklyCandidates {
  inbox: Task[]
  carryover: Task[]
  month: Task[]
  someday: Task[]
}

/** Group open tasks into the source buckets the weekly session pulls from. */
export function selectWeeklyCandidates(tasks: Task[]): WeeklyCandidates {
  const open = tasks.filter(t => !t.completed)
  return {
    inbox: open.filter(t => t.bucket === 'inbox'),
    // 'today' is not in the TaskBucket union but exists in some runtime data paths;
    // cast to string for a safe runtime check without altering the Task type.
    carryover: open.filter(t => t.bucket === 'week' || (t.bucket as string) === 'today'),
    month: open.filter(t => t.bucket === 'month'),
    someday: open.filter(t => t.bucket === 'quarter'),
  }
}

export interface WeeklyNoteInput {
  weekId: string
  priorities: Task[]
  scheduleSummary: string
  concerns: string
}

export interface WeeklyNote {
  path: string
  title: string
  content: string
}

/** Build the vault note for a completed weekly session. */
export function formatWeeklyNote({ weekId, priorities, scheduleSummary, concerns }: WeeklyNoteInput): WeeklyNote {
  const priorityLines = priorities.length
    ? priorities.map((t, i) => `${i + 1}. ${t.title}`).join('\n')
    : '_None selected_'
  const content = [
    `# Weekly Plan — ${weekId}`,
    '',
    '## Priorities',
    priorityLines,
    '',
    '## Schedule',
    scheduleSummary || '_Not scheduled_',
    '',
    '## Concerns & topics',
    concerns?.trim() || '_None_',
    '',
  ].join('\n')
  return { path: `planning/weekly/${weekId}.md`, title: `Weekly Plan ${weekId}`, content }
}
