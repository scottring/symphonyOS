// The change card's server half (spec 2026-10-14). Symphony PROPOSES a set of
// changes; nothing here writes. The client previews the set dashed on the
// page and applies it on one Approve, with one Undo.
//
// v1 ops are task-only and never delete: dropping something is Someday.

export type ChangeOpKind = 'place' | 'unplace' | 'add' | 'someday' | 'assign'

export interface ChangeOp {
  key: string
  op: ChangeOpKind
  taskId?: string
  /** The task's title (resolved server-side), or the new task's title for add. */
  title: string
  /** YYYY-MM-DD */
  date?: string
  /** HH:MM, 24-hour */
  time?: string
  assignee?: string
  assigneeName?: string
  goalId?: string
  /** The task's updated_at when Symphony read it; Approve refuses if it moved. */
  seen?: string
}

export interface ChangeSet { key: string; title: string; ops: ChangeOp[] }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS = new Set<ChangeOpKind>(['place', 'unplace', 'add', 'someday', 'assign'])
const MAX_OPS = 40

const realDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}
const realTime = (v: unknown): string | null =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null

export function changeSetFromInput(input: Record<string, unknown>, key: string): { set: ChangeSet } | { error: string } {
  const raw = Array.isArray(input.ops) ? input.ops : null
  if (!raw || !raw.length) return { error: 'Provide at least one op' }
  if (raw.length > MAX_OPS) return { error: `Propose at most ${MAX_OPS} changes at a time` }
  const ops: ChangeOp[] = []
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i] as Record<string, unknown> | null
    if (!o || typeof o !== 'object') return { error: `Op ${i + 1} is not an object` }
    const op = o.op as ChangeOpKind
    if (!KINDS.has(op)) return { error: `Op ${i + 1}: unknown op "${String(o.op)}" (use place, unplace, add, someday or assign)` }
    const base: ChangeOp = { key: `${key}:${i}`, op, title: '' }
    if (op !== 'add') {
      if (typeof o.task_id !== 'string' || !UUID_RE.test(o.task_id)) return { error: `Op ${i + 1}: task_id must be an existing task id` }
      base.taskId = o.task_id
    }
    if (op === 'place' || (op === 'add' && o.date !== undefined)) {
      const date = realDate(o.date)
      if (!date) return { error: `Op ${i + 1}: date must be a real YYYY-MM-DD date` }
      base.date = date
    }
    if (o.time !== undefined && (op === 'place' || op === 'add')) {
      const time = realTime(o.time)
      if (!time) return { error: `Op ${i + 1}: time must be HH:MM (24-hour)` }
      base.time = time
    }
    if (op === 'add') {
      const title = typeof o.title === 'string' ? o.title.trim().slice(0, 300) : ''
      if (!title) return { error: `Op ${i + 1}: add needs a title` }
      base.title = title
      if (typeof o.goal_id === 'string' && UUID_RE.test(o.goal_id)) base.goalId = o.goal_id
    }
    if (op === 'assign' || (op === 'add' && o.assignee !== undefined)) {
      if (typeof o.assignee !== 'string' || !UUID_RE.test(o.assignee)) return { error: `Op ${i + 1}: assignee must be a household member id` }
      base.assignee = o.assignee
    }
    ops.push(base)
  }
  const title = typeof input.title === 'string' && input.title.trim()
    ? input.title.trim().slice(0, 120)
    : ops.length === 1 ? '1 change' : `${ops.length} changes`
  return { set: { key, title, ops } }
}

export function resolveRefs(
  set: ChangeSet,
  tasks: { id: string; title: string; updated_at: string; completed: boolean }[],
  members: { id: string; name: string }[],
): { set: ChangeSet } | { error: string } {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const names = new Map(members.map((m) => [m.id, m.name]))
  const ops: ChangeOp[] = []
  for (const op of set.ops) {
    const next = { ...op }
    if (op.taskId) {
      const t = byId.get(op.taskId)
      if (!t) return { error: `No task ${op.taskId} that this person can change. Read the tasks again and use their ids.` }
      if (t.completed) return { error: `"${t.title}" is already done; leave it out` }
      next.title = t.title
      next.seen = t.updated_at
    }
    if (op.assignee) {
      const name = names.get(op.assignee)
      if (!name) return { error: `No household member ${op.assignee}. Use symphony_list_household_members.` }
      next.assigneeName = name
    }
    ops.push(next)
  }
  return { set: { ...set, ops } }
}

export const PROPOSE_CHANGES_TOOL = {
  name: 'symphony_propose_changes',
  description: 'Propose ONE list of changes to the person\'s tasks, shown as a change card and as dashed rows on the page. Nothing is saved until they press Approve. Use this whenever a request changes MORE THAN ONE task, and always at the end of a planning conversation. Never call write tools for the same changes. Ops: place (give an existing task a day, optionally a time), unplace (take its day away), add (a new task, optionally on a day/time), someday (set it aside; there is no delete), assign (one household member). Each call replaces the list on the page: while planning, call it again with the whole list so far after each answer, and whenever the person asks for a change.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short heading, e.g. "6 changes to your week"' },
      ops: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['place', 'unplace', 'add', 'someday', 'assign'] },
            task_id: { type: 'string', description: 'Existing task id (all ops except add)' },
            title: { type: 'string', description: 'New task title (add only)' },
            date: { type: 'string', description: 'YYYY-MM-DD (place; optional for add)' },
            time: { type: 'string', description: 'HH:MM 24-hour (optional, place/add)' },
            assignee: { type: 'string', description: 'Household member id (assign; optional for add)' },
            goal_id: { type: 'string', description: 'Month goal the new task serves (add only, optional)' },
          },
          required: ['op'],
        },
      },
    },
    required: ['ops'],
  },
}
