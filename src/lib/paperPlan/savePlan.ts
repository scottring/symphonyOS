// Plan from paper → the rows an APPROVED proposal saves. Pure: the caller
// inserts them (useSavePaperPlan) and the tests read them.
//
// The save is additive and retry-safe:
//  - every row's id was fixed when the item was proposed (PaperImport.rowIds),
//    and the writer inserts with ON CONFLICT (id) DO NOTHING — so a retried or
//    interrupted save never makes a second copy and never overwrites a row;
//  - nothing goes on a day: no scheduled_for, no focus, no planned_on;
//  - routines are saved switched off (visibility 'reference');
//  - existing goals and tasks are only ever LINKED to, never changed.
import type { Analysis, Item, Level } from '../../../supabase/functions/plan-from-paper/lib/plan'
import type { DomainId } from '@/lib/domains'
import { scopeForDomain } from '@/lib/scope'

export interface SaveOptions {
  userId: string
  domain: DomainId
  /** The planning year, for year goals. */
  year: number
  /** This week's first day (YYYY-MM-DD), for the rare line that says "this week". */
  weekStart: string
  /** Which proposed items the user kept (default: kept). */
  include: Record<string, boolean>
  /** Proposed item id → the row id it saves as. */
  rowIds: Record<string, string>
  /** The "source pages" note: the transcription, with the photos attached. */
  sourceNote: { id: string; title: string }
  images: { path: string; attachmentId: string; bytes: number }[]
  /** Existing goal tasks by id → where they live, so goal_task_id is only set
   *  on the same list (the planning model's rule). */
  existingPeriodGoals: Record<string, { level: 'season' | 'month'; start: string }>
  /** Existing rows that still exist at save time. A link to anything else (a
   *  goal deleted since the pages were read) would fail the insert on every
   *  retry, so it goes into the item's notes instead. */
  existing: { yearGoalIds: ReadonlySet<string>; taskIds: ReadonlySet<string> }
}

export interface SavePlanRows {
  goals: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
  routines: Record<string, unknown>[]
  notes: Record<string, unknown>[]
  attachments: Record<string, unknown>[]
  /** Relationships shown in review that the data model cannot hold, with why. */
  unlinked: { itemId: string; label: string; reason: string }[]
}

export type RowTarget =
  | { table: 'goals' }
  | { table: 'tasks'; bucket: 'month' | 'quarter' | 'week' | 'someday' | 'inbox'; isGoal: boolean; start: string | null }
  | { table: 'routines' }
  | { table: 'notes' }

/** Where an item lands. A task has no year list, so a year-level task waits in Someday. */
export function targetFor(item: Pick<Item, 'kind' | 'placement'>): RowTarget {
  const level: Level = item.placement.level
  if (item.kind === 'note') return { table: 'notes' }
  if (item.kind === 'routine') return { table: 'routines' }
  if (item.kind === 'goal' && level === 'year') return { table: 'goals' }
  const isGoal = item.kind === 'goal' && (level === 'season' || level === 'month')
  if (level === 'season') return { table: 'tasks', bucket: 'quarter', isGoal, start: item.placement.start }
  if (level === 'month') return { table: 'tasks', bucket: 'month', isGoal, start: item.placement.start }
  if (level === 'week') return { table: 'tasks', bucket: 'week', isGoal: false, start: null }
  if (level === 'someday' || level === 'year') return { table: 'tasks', bucket: 'someday', isGoal: false, start: null }
  return { table: 'tasks', bucket: 'inbox', isGoal: false, start: null }
}

/** Items the user kept, in the order the proposal lists them. */
export function includedItems(analysis: Analysis, include: Record<string, boolean>): Item[] {
  return analysis.items.filter((i) => include[i.id] !== false)
}

/** Default: keep everything except a line that repeats something already
 *  saved. A repeat of another line on these pages (a month item carrying a
 *  season one down) is kept — the user decides. */
export function defaultInclude(item: Item, proposedIds: ReadonlySet<string>): boolean {
  return !item.flags.some((f) => f.type === 'possible_duplicate' && !!f.target_id && !proposedIds.has(f.target_id))
}

const REL_WORDS = { derived_from: 'comes from', supports: 'serves', part_of: 'is part of' } as const

function noteLines(item: Item, unlinked: string[] = []): string | null {
  const lines: string[] = []
  if (item.title !== item.original) lines.push(`On paper: “${item.original}”`)
  if (item.date_text) lines.push(`Date on the page: ${item.date_text}`)
  for (const u of unlinked) lines.push(`On paper, this ${u}`)
  return lines.length ? lines.join('\n') : null
}

function startOfMonth(ymd: string | null): string | null {
  return ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(0, 7)}-01` : null
}

/** The transcription, as the source-pages note's text. */
export function transcriptionText(analysis: Analysis, instructions: string | null): string {
  const parts: string[] = []
  if (instructions?.trim()) parts.push(`About these pages: ${instructions.trim()}`)
  for (const p of analysis.pages) {
    parts.push(`## ${p.heading ?? p.period.label ?? `Page ${p.page}`}`)
    for (const l of p.lines) {
      const text = l.struck ? `~~${l.text}~~` : l.text
      parts.push(`- ${text}${l.uncertain ? ` [unsure${l.uncertainty ? `: ${l.uncertainty}` : ''}]` : ''}`)
    }
  }
  return parts.join('\n\n')
}

export function buildSaveRows(analysis: Analysis, instructions: string | null, o: SaveOptions): SavePlanRows {
  const items = includedItems(analysis, o.include)
  const byId = new Map(items.map((i) => [i.id, i]))
  const targets = new Map(items.map((i) => [i.id, targetFor(i)]))
  const scope = scopeForDomain(o.domain, [], null)
  const unlinked: SavePlanRows['unlinked'] = []
  const rowId = (itemId: string) => o.rowIds[itemId]

  const goals: Record<string, unknown>[] = []
  const tasks: Record<string, unknown>[] = []
  const routines: Record<string, unknown>[] = []
  const notes: Record<string, unknown>[] = []

  for (const item of items) {
    const t = targets.get(item.id)!
    const id = rowId(item.id)
    if (!id) continue

    if (t.table === 'goals') {
      goals.push({ id, user_id: o.userId, area_id: null, name: item.title, year: o.year, context: o.domain, scope, notes: noteLines(item), status: 'active' })
      continue
    }
    if (t.table === 'notes') {
      notes.push({ id, user_id: o.userId, title: item.title.slice(0, 120), content: item.original, type: 'general', source: 'import', context: o.domain, scope })
      continue
    }
    if (t.table === 'routines') {
      const r = item.routine
      const detail = [
        r?.cadence && `How often: ${r.cadence}`,
        r?.time && `When: ${r.time}`,
        r?.who && `Who: ${r.who}`,
        r?.steps.length ? `Steps:\n${r.steps.map((s) => `- ${s}`).join('\n')}` : null,
        noteLines(item),
      ].filter(Boolean).join('\n')
      routines.push({
        id, user_id: o.userId, name: item.title, description: detail || null,
        // A proposal, not a schedule: switched off, with no time guessed.
        visibility: 'reference', recurrence_pattern: { type: 'daily' }, time_of_day: null,
        raw_input: item.original, context: o.domain, scope,
      })
      continue
    }

    // A task row (plain task, or a season/month goal).
    let goalId: string | null = null
    let goalTaskId: string | null = null
    let sourceId: string | null = null
    let parentTaskId: string | null = null
    // Links the data model cannot hold go into the task's own notes, so what
    // the page connected is never silently lost.
    const mine: string[] = []
    for (const rel of item.relationships) {
      const target = rel.target_kind === 'item' ? byId.get(rel.target_id) : undefined
      const targetT = target ? targets.get(target.id) : undefined
      const why = (reason: string) => {
        const label = `${REL_WORDS[rel.type]} “${target?.title ?? rel.target_label}”`
        unlinked.push({ itemId: item.id, label, reason })
        mine.push(label)
      }
      if (rel.target_kind === 'item' && !target) { why('that item is not being saved'); continue }
      if (rel.target_kind === 'year_goal' && !o.existing.yearGoalIds.has(rel.target_id)) { why('that goal is no longer in Symphony'); continue }
      if ((rel.target_kind === 'task' || rel.target_kind === 'period_goal') && !o.existing.taskIds.has(rel.target_id)) { why('that item is no longer in Symphony'); continue }

      if (rel.type === 'supports') {
        if (rel.target_kind === 'year_goal') { goalId ??= rel.target_id; continue }
        if (targetT?.table === 'goals') { goalId ??= rowId(target!.id); continue }
        // A step under a season/month goal lives on that goal's own list.
        const goalPlace = rel.target_kind === 'period_goal'
          ? o.existingPeriodGoals[rel.target_id]
          : targetT?.table === 'tasks' && targetT.isGoal ? { level: targetT.bucket === 'quarter' ? 'season' : 'month', start: targetT.start } : undefined
        const ownLevel = t.bucket === 'quarter' ? 'season' : t.bucket === 'month' ? 'month' : null
        if (goalPlace && ownLevel === goalPlace.level && startOfMonth(goalPlace.start) === startOfMonth(t.start) && !t.isGoal) {
          goalTaskId ??= rel.target_kind === 'period_goal' ? rel.target_id : rowId(target!.id)
        } else why('a goal only holds steps on its own list')
        continue
      }
      if (rel.type === 'derived_from') {
        if (rel.target_kind === 'task' || rel.target_kind === 'period_goal') { sourceId ??= rel.target_id; continue }
        if (targetT?.table === 'tasks') { sourceId ??= rowId(target!.id); continue }
        why('only a task or season/month goal can be carried down')
        continue
      }
      if (rel.type === 'part_of') {
        if (targetT?.table === 'tasks' && !targetT.isGoal) { parentTaskId ??= rowId(target!.id); continue }
        why('only a task can hold sub-steps')
      }
    }

    tasks.push({
      id, user_id: o.userId, title: item.title, completed: false,
      bucket: t.bucket,
      scheduled_for: null,
      week_start: t.bucket === 'week' ? o.weekStart : null,
      month_start: t.bucket === 'month' ? startOfMonth(t.start) : null,
      season_start: t.bucket === 'quarter' ? t.start : null,
      is_goal: t.isGoal,
      category: 'task',
      context: o.domain, scope,
      goal_id: goalId, goal_task_id: goalTaskId, source_id: sourceId, parent_task_id: parentTaskId,
      notes: noteLines(item, mine),
    })
  }

  // Insert order: a row that another row points at goes first (source, goal
  // task, parent), so every reference already exists when it is written.
  const ordered: Record<string, unknown>[] = []
  const placed = new Set<string>()
  const taskById = new Map(tasks.map((r) => [r.id as string, r]))
  const visit = (r: Record<string, unknown>, depth = 0) => {
    if (placed.has(r.id as string) || depth > 50) return
    for (const ref of [r.source_id, r.goal_task_id, r.parent_task_id]) {
      const dep = typeof ref === 'string' ? taskById.get(ref) : undefined
      if (dep && dep !== r) visit(dep, depth + 1)
    }
    placed.add(r.id as string)
    ordered.push(r)
  }
  tasks.forEach((r) => visit(r))

  notes.unshift({
    id: o.sourceNote.id, user_id: o.userId, title: o.sourceNote.title,
    content: transcriptionText(analysis, instructions), type: 'general', source: 'import', context: o.domain, scope,
  })
  const attachments = o.images.map((img) => ({
    id: img.attachmentId, user_id: o.userId, entity_type: 'note', entity_id: o.sourceNote.id,
    file_name: img.path.split('/').pop() ?? 'page.jpg', file_type: 'image/jpeg', file_size: img.bytes, storage_path: img.path,
  }))

  return { goals, tasks: ordered, routines, notes, attachments, unlinked }
}

/** Counts for the "Save N changes" confirmation. */
export function summarizeRows(rows: SavePlanRows) {
  const tasks = rows.tasks as { bucket: string; is_goal: boolean }[]
  return {
    yearGoals: rows.goals.length,
    seasonGoals: tasks.filter((t) => t.is_goal && t.bucket === 'quarter').length,
    monthGoals: tasks.filter((t) => t.is_goal && t.bucket === 'month').length,
    seasonTasks: tasks.filter((t) => !t.is_goal && t.bucket === 'quarter').length,
    monthTasks: tasks.filter((t) => !t.is_goal && t.bucket === 'month').length,
    otherTasks: tasks.filter((t) => t.bucket !== 'quarter' && t.bucket !== 'month').length,
    routines: rows.routines.length,
    notes: rows.notes.length - 1,
    total: rows.goals.length + rows.tasks.length + rows.routines.length + rows.notes.length,
  }
}
