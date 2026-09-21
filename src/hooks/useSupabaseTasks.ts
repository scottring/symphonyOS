import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useFamilyMembers } from './useFamilyMembers'
import { showToast } from './useToast'
import { logger } from '@/lib/logger'
import { findTaskById as lookupTaskById } from '@/lib/findTaskById'
import type { Task, TaskBucket, TaskLink, TaskContext, TaskCategory, TaskCaptureMeta, LinkedActivity, LinkType, LinkedActivityType, GroupMemberRef } from '@/types/task'
import type { TaskDirections } from '@/types/directions'
import { scopeForDomain, memberForAuthUser, type Scope } from '@/lib/scope'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { monthStartOf, isPlacement } from '@/lib/planning/periodPlacement'
import { stepsThatCarryForward } from '@/lib/planning/goalSteps'
import { readSeasons, seasonStartFor } from '@/lib/cadence/seasons'
import { planPlacement, planKeep, planDropCommitment, commitmentRow, isPlacementWrite, type PlacementPlan } from '@/lib/placement/intentions'
import type { TaskCommitment, TaskFocusEntry, PlacementLevel } from '@/types/task'
import { committedTo, deriveCache } from '@/lib/placement/model'
import { onRealtimeResumed } from '@/lib/realtime/keepAlive'
import { announceToBuyChanged } from '@/lib/lists/toBuy'
// `import type` on purpose: erased at compile time, so it does NOT drag
// taskOrdering's @dnd-kit/sortable dependency into this hook's runtime bundle.
import type { OrderWrite } from '@/lib/today/taskOrdering'

// Monotonic suffix so every hook instance gets its own realtime channel topic.
let tasksChannelSeq = 0

// Same-tab write fan-out. Every hook instance keeps its own copy of the tasks
// state, and cross-instance sync (detail panel → Today list, QuickCapture →
// view) used to ride ONLY on the Supabase realtime round-trip — seconds of lag
// when healthy, and silently dead when the websocket is (slept laptop,
// long-lived tab): "rescheduled in the panel but Today never changed".
// Successful local writes now announce themselves in-process so every mounted
// instance applies the change immediately; realtime remains the channel for
// other tabs and devices. Announced tasks are the full local objects (nested
// subtasks intact), unlike realtime's flat rows.
type LocalTaskWrite =
  | { kind: 'insert'; task: Task }
  | { kind: 'update'; task: Task }
  | { kind: 'delete'; id: string }
const localTaskWrites = new EventTarget()
function announceLocalWrite(detail: LocalTaskWrite): void {
  localTaskWrites.dispatchEvent(new CustomEvent<LocalTaskWrite>('write', { detail }))
}

// Tasks whose last commitment/focus write failed AND could not be re-read.
// Their local state is the pre-write snapshot, which may not be the truth, so
// no placement write may plan from it until a re-read succeeds. Module scope,
// like localTaskWrites: every mounted instance honours it, not only the one
// whose write failed (final review M9).
const unreconciledTasks = new Set<string>()

/**
 * A local write that a LATER write in the same flow plans from: applied to the
 * always-current ref NOW as well as to state (visible after the next render).
 * A planning session drops a step and then keeps its goal; the goal's carry
 * reads the ref and must not find the step still open (final review I1). The
 * updater is pure, so applying it to both agrees.
 */
function setTasksNow(ref: { current: Task[] }, set: (fn: (prev: Task[]) => Task[]) => void, fn: (prev: Task[]) => Task[]): void {
  ref.current = fn(ref.current)
  set(fn)
}

export interface DbTask {
  id: string
  user_id: string
  title: string
  completed: boolean
  completed_at?: string | null
  bucket: TaskBucket
  scheduled_for: string | null
  deferred_until: string | null
  defer_count: number | null
  is_all_day: boolean | null
  is_someday: boolean | null
  context: TaskContext | null
  scope: Scope | null
  category: string | null
  notes: string | null
  capture_id: string | null
  links: (string | TaskLink)[] | null // Can be old string format or new object format
  phone_number: string | null
  email: string | null
  contact_id: string | null
  assigned_to: string | null
  assigned_to_all: string[] | null
  project_id: string | null
  parent_task_id: string | null
  group_members: GroupMemberRef[] | null
  linked_event_id: string | null
  // Generalized prep/follow-up linking
  link_type: 'prep' | 'followup' | null
  linked_activity_type: LinkedActivityType | null
  linked_activity_id: string | null
  estimated_duration: number | null
  location: string | null
  location_place_id: string | null
  directions: TaskDirections | null
  is_waiting: boolean | null
  waiting_since: string | null
  waiting_for: string | null
  needs_discussion: boolean | null
  discussion_note: string | null
  // Date-only column: which day this was marked "needed today".
  needed_on: string | null
  // Date-only column: the day this was chosen for Today's main list.
  // Optional: absent until the 2026-09-19 migration is applied.
  planned_on?: string | null
  week_deferred_at: string | null
  week_start: string | null
  month_start: string | null
  season_start: string | null
  is_goal: boolean | null
  picked_at: string | null
  capture_meta: { status?: string; storage_path?: string; suggested_task_id?: string } | null
  source_id: string | null
  goal_id: string | null
  goal_task_id: string | null
  is_fun: boolean | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

// Convert old string links to new TaskLink format
function normalizeLinks(links: (string | TaskLink)[] | null): TaskLink[] | undefined {
  if (!links || links.length === 0) return undefined
  return links.map((link) => {
    if (typeof link === 'string') {
      return { url: link }
    }
    return link
  })
}

export function dbTaskToTask(dbTask: DbTask): Task {
  // Build linkedTo from new generalized fields if present
  const linkedTo: LinkedActivity | undefined =
    dbTask.linked_activity_type && dbTask.linked_activity_id
      ? { type: dbTask.linked_activity_type, id: dbTask.linked_activity_id }
      : undefined

  return {
    id: dbTask.id,
    title: dbTask.title,
    completed: dbTask.completed,
    completedAt: dbTask.completed_at ? new Date(dbTask.completed_at) : null,
    userId: dbTask.user_id,
    bucket: (dbTask.bucket as TaskBucket) || 'inbox',
    createdAt: new Date(dbTask.created_at),
    updatedAt: new Date(dbTask.updated_at),
    scheduledFor: dbTask.scheduled_for ? new Date(dbTask.scheduled_for) : undefined,
    deferredUntil: dbTask.deferred_until ? new Date(dbTask.deferred_until) : undefined,
    deferCount: dbTask.defer_count ?? undefined,
    isAllDay: dbTask.is_all_day ?? undefined,
    isSomeday: dbTask.is_someday ?? undefined,
    context: dbTask.context ?? null,
    scope: dbTask.scope ?? 'individual',
    category: (dbTask.category as TaskCategory) ?? 'task',
    notes: dbTask.notes ?? undefined,
    captureId: dbTask.capture_id ?? undefined,
    links: normalizeLinks(dbTask.links),
    phoneNumber: dbTask.phone_number ?? undefined,
    email: dbTask.email ?? undefined,
    contactId: dbTask.contact_id ?? undefined,
    assignedTo: dbTask.assigned_to ?? undefined,
    // Normalize assignee: legacy single-assignee tasks store only `assigned_to`
    // (array null). Surfaces that read `assignedToAll` (the Today timeline's
    // multi-assignee avatars) would then show the task as unassigned while the
    // detail panel — which reads `assignedTo` — shows the assignee. Fall back so
    // every consumer agrees.
    assignedToAll: (dbTask.assigned_to_all && dbTask.assigned_to_all.length > 0)
      ? dbTask.assigned_to_all
      : (dbTask.assigned_to ? [dbTask.assigned_to] : undefined),
    projectId: dbTask.project_id ?? undefined,
    parentTaskId: dbTask.parent_task_id ?? undefined,
    groupMembers: (dbTask.group_members && dbTask.group_members.length > 0) ? dbTask.group_members : undefined,
    linkedEventId: dbTask.linked_event_id ?? undefined,
    linkedTo,
    linkType: dbTask.link_type ?? undefined,
    estimatedDuration: dbTask.estimated_duration ?? undefined,
    location: dbTask.location ?? undefined,
    locationPlaceId: dbTask.location_place_id ?? undefined,
    directions: dbTask.directions ?? undefined,
    isWaiting: dbTask.is_waiting ?? undefined,
    waitingSince: dbTask.waiting_since ? new Date(dbTask.waiting_since) : undefined,
    waitingFor: dbTask.waiting_for ?? undefined,
    needsDiscussion: dbTask.needs_discussion ?? undefined,
    discussionNote: dbTask.discussion_note ?? undefined,
    // Date-only column: parse as LOCAL midnight. `new Date('2026-08-19')` parses
    // as UTC and lands on the 18th in US timezones — the note would show the
    // item a day early.
    neededOn: dbTask.needed_on ? parseLocalYmd(dbTask.needed_on) : undefined,
    plannedOn: dbTask.planned_on ? parseLocalYmd(dbTask.planned_on) : undefined,
    weekDeferredAt: dbTask.week_deferred_at ? new Date(dbTask.week_deferred_at) : undefined,
    // A `date` column — parse to LOCAL midnight, never `new Date(str)` (that's UTC).
    weekStart: dbTask.week_start ? parseLocalYmd(dbTask.week_start) : undefined,
    monthStart: dbTask.month_start ? parseLocalYmd(dbTask.month_start) : undefined,
    seasonStart: dbTask.season_start ? parseLocalYmd(dbTask.season_start) : undefined,
    isGoal: dbTask.is_goal ?? false,
    pickedAt: dbTask.picked_at ? new Date(dbTask.picked_at) : undefined,
    sourceId: dbTask.source_id ?? undefined,
    goalId: dbTask.goal_id ?? undefined,
    goalTaskId: dbTask.goal_task_id ?? undefined,
    isFun: dbTask.is_fun ?? undefined,
    sortOrder: dbTask.sort_order ?? null,
    captureMeta: dbTask.capture_meta
      ? {
          status: dbTask.capture_meta.status as TaskCaptureMeta['status'],
          storagePath: dbTask.capture_meta.storage_path,
          suggestedTaskId: dbTask.capture_meta.suggested_task_id,
        }
      : undefined,
  }
}

// ── The supporting records: commitments and focus ────────────────────────────
// One enduring action (2026-09-21): a task's period commitments and personal
// focus live in their own tables and ride on the Task as arrays. The tasks
// row's bucket/stamps are a cache of them (see lib/placement/model).

export interface DbTaskCommitment {
  id: string
  task_id: string
  level: PlacementLevel
  period_start: string
  status: TaskCommitment['status']
  carried_to: string | null
}

export interface DbTaskFocus {
  task_id: string
  user_id: string
  date: string
}

export function dbCommitmentToCommitment(r: DbTaskCommitment): TaskCommitment {
  return {
    id: r.id, level: r.level, status: r.status,
    periodStart: parseLocalYmd(r.period_start),
    carriedTo: r.carried_to ? parseLocalYmd(r.carried_to) : undefined,
  }
}

export function dbFocusToFocus(r: DbTaskFocus): TaskFocusEntry {
  return { userId: r.user_id, date: parseLocalYmd(r.date) }
}

/** Hang each task's records on it. A task with none gets an empty array (so
 *  the legacy fallback in lib/placement/model applies only to rows that truly
 *  predate the tables — those arrive with `commitments` undefined only when
 *  the records could not be loaded at all). */
export function attachRecords(rows: Task[], commitments: DbTaskCommitment[] | null, focus: DbTaskFocus[] | null): Task[] {
  if (!commitments && !focus) return rows
  const cById = new Map<string, TaskCommitment[]>()
  for (const r of commitments ?? []) {
    const list = cById.get(r.task_id) ?? []
    list.push(dbCommitmentToCommitment(r))
    cById.set(r.task_id, list)
  }
  const fById = new Map<string, TaskFocusEntry[]>()
  for (const r of focus ?? []) {
    const list = fById.get(r.task_id) ?? []
    list.push(dbFocusToFocus(r))
    fById.set(r.task_id, list)
  }
  const attach = (t: Task): Task => ({
    ...t,
    ...(commitments ? { commitments: cById.get(t.id) ?? [] } : {}),
    ...(focus ? { focus: fById.get(t.id) ?? [] } : {}),
    ...(t.subtasks ? { subtasks: t.subtasks.map((s) => ({
      ...s,
      ...(commitments ? { commitments: cById.get(s.id) ?? [] } : {}),
      ...(focus ? { focus: fById.get(s.id) ?? [] } : {}),
    })) } : {}),
  })
  return rows.map(attach)
}

/** Patch one task (top-level or nested) with a record change. Pure. */
function patchTaskRecords(rows: Task[], taskId: string, patch: (t: Task) => Task): Task[] {
  return rows.map((t) => {
    if (t.id === taskId) return patch(t)
    if (t.subtasks?.some((s) => s.id === taskId)) {
      return { ...t, subtasks: t.subtasks.map((s) => (s.id === taskId ? patch(s) : s)) }
    }
    return t
  })
}

function applyCommitmentEvent(rows: Task[], event: 'INSERT' | 'UPDATE' | 'DELETE', row: DbTaskCommitment): Task[] {
  return patchTaskRecords(rows, row.task_id, (t) => {
    const list = (t.commitments ?? []).filter((c) => c.id !== row.id && !(c.level === row.level && localYmd(c.periodStart) === row.period_start))
    if (event !== 'DELETE') list.push(dbCommitmentToCommitment(row))
    return { ...t, commitments: list }
  })
}

function applyFocusEvent(rows: Task[], event: 'INSERT' | 'UPDATE' | 'DELETE', row: DbTaskFocus): Task[] {
  return patchTaskRecords(rows, row.task_id, (t) => {
    const list = (t.focus ?? []).filter((f) => !(f.userId === row.user_id && localYmd(f.date) === row.date))
    if (event !== 'DELETE') list.push(dbFocusToFocus(row))
    return { ...t, focus: list }
  })
}

// ── One first load, shared ───────────────────────────────────────────────────
// Every instance of this hook used to fetch the whole table on mount, and a
// single route mounts several (ShellLayout, ShellSearch, useShellChrome, the
// view container, StagingFloat…). That meant the same 650 rows pulled five
// times over before anything rendered. Instances still hold their own state
// and their own optimistic writes — only the network round trip is shared.
// Only a request ALREADY IN FLIGHT is shared — deliberately not a cache with a
// lifetime. The instances race each other within one render pass, so in-flight
// sharing collapses the whole storm; a stored snapshot would additionally hand
// stale rows to anything mounting later (a panel opened seconds after a
// server-side write), which is a correctness cost for no extra speed.
let tasksInFlight: { userId: string; promise: Promise<Task[] | null> } | null = null

/**
 * Instances must never share task OBJECTS — `applyIncomingDelete` edits
 * `subtasks` in place, so a shared array would let one instance's delete
 * reach into another's state.
 */
function cloneRows(rows: Task[]): Task[] {
  return rows.map((t) => (t.subtasks ? { ...t, subtasks: [...t.subtasks] } : { ...t }))
}

// ── The tab's task list, kept live ───────────────────────────────────────────
//
// In-flight sharing alone only helps instances that overlap. Once the app got
// fast, the nine instances on a route mounted far enough apart to each pull
// their own 716 KB copy — the fix created its own next bottleneck.
//
// So the rows are cached, and kept CORRECT rather than merely fresh: every
// insert/update/delete that reaches any instance is applied to the cache by the
// same pure function that updates that instance's state. Realtime carries other
// tabs, other devices and server-side writes, so nothing changes without the
// cache hearing about it. The TTL below is a backstop for a missed event, not
// the mechanism.
const TASKS_CACHE_TTL_MS = 60_000
let tasksCache: { userId: string; rows: Task[]; at: number } | null = null

/** Realtime semantics, as pure functions — used for both state and the cache. */
function applyInsert(rows: Task[], newTask: Task): Task[] {
  // Realtime is not the only writer: this tab's own addTask has usually
  // already added the row (optimistically or reconciled).
  const exists = rows.some(
    (t) => t.id === newTask.id || t.subtasks?.some((st) => st.id === newTask.id)
  )
  if (exists) return rows
  if (newTask.parentTaskId) {
    // Append to the parent's nested subtasks. Don't re-run nestSubtasks on an
    // already-nested list — it would replace the parent's subtasks with just
    // this one.
    return rows.map((t) =>
      t.id === newTask.parentTaskId
        ? { ...t, subtasks: [...(t.subtasks || []), newTask] }
        : t
    )
  }
  return [newTask, ...rows]
}

function applyUpdate(rows: Task[], updatedTask: Task): Task[] {
  const updated = rows.map((t) => {
    // A realtime UPDATE arrives as a FLAT row. Replacing a parent with it
    // wiped `subtasks`, so the parent's NEXT reschedule found no children to
    // carry ("a group moves as a unit") and stranded them at a stale time —
    // found live 2026-08-31. The incoming row's own fields win; the nesting
    // this list already holds survives the swap (same principle as the
    // post-updateTask swap, which announces the merged local object).
    if (t.id === updatedTask.id) {
      // The commitment and focus records live in their own tables and reach
      // this list through their own events; a flat tasks row never carries
      // them, so the ones already held survive the swap too.
      const records = {
        commitments: updatedTask.commitments ?? t.commitments,
        focus: updatedTask.focus ?? t.focus,
      }
      return updatedTask.subtasks || !t.subtasks?.length
        ? { ...updatedTask, ...records }
        : { ...updatedTask, ...records, subtasks: t.subtasks }
    }
    if (t.subtasks) {
      const updatedSubtasks = t.subtasks.map((st) =>
        st.id === updatedTask.id ? updatedTask : st
      )
      if (updatedSubtasks !== t.subtasks) return { ...t, subtasks: updatedSubtasks }
    }
    return t
  })
  return nestSubtasks(updated)
}

function applyDelete(rows: Task[], deletedId: string): Task[] {
  // Rebuild the parent rather than splicing its array in place: these rows are
  // shared with the cache and with other instances' state.
  const out: Task[] = []
  for (const t of rows) {
    if (t.id === deletedId) continue
    if (t.subtasks?.some((st) => st.id === deletedId)) {
      out.push({ ...t, subtasks: t.subtasks.filter((st) => st.id !== deletedId) })
    } else {
      out.push(t)
    }
  }
  return out
}

/** Keep the cache in step with whatever just reached the instances. */
function patchCache(patch: (rows: Task[]) => Task[]): void {
  if (tasksCache) tasksCache = { ...tasksCache, rows: patch(tasksCache.rows) }
}

/** Test seam — module state outlives a single test. */
export function __resetTasksCache(): void {
  tasksCache = null
  tasksInFlight = null
  unreconciledTasks.clear()
}

/** Test seam — age the cache past its TTL without waiting a minute. */
export function __expireTasksCache(): void {
  if (tasksCache) tasksCache = { ...tasksCache, at: 0 }
}

/**
 * One trip to the database, shared by every instance that asks while it is in
 * flight. Fills the cache on success. Callers decide whether to show a spinner.
 */
async function loadTasks(
  userId: string,
  onError: (message: string) => void,
): Promise<Task[] | null> {
  if (tasksInFlight && tasksInFlight.userId === userId) return tasksInFlight.promise

  const request = (async (): Promise<Task[] | null> => {
    // RLS policies handle household sharing - no need to filter by user_id.
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      onError(error.message)
      showToast("Couldn't load tasks — check your connection", 'error', 5000)
      return null
    }

    // The records ride alongside. A failure here degrades to the cached
    // columns (legacy read path) rather than failing the whole load.
    let commitments: DbTaskCommitment[] | null = null
    let focus: DbTaskFocus[] | null = null
    try {
      const [cRes, fRes] = await Promise.all([
        supabase.from('task_commitments').select('*'),
        supabase.from('task_focus').select('*'),
      ])
      commitments = Array.isArray(cRes?.data) ? (cRes.data as DbTaskCommitment[]) : null
      focus = Array.isArray(fRes?.data) ? (fRes.data as DbTaskFocus[]) : null
      if (cRes?.error) logger.warn('[useSupabaseTasks] commitments failed to load:', cRes.error.message)
      if (fRes?.error) logger.warn('[useSupabaseTasks] focus failed to load:', fRes.error.message)
    } catch (e) {
      logger.warn('[useSupabaseTasks] records failed to load:', e instanceof Error ? e.message : String(e))
    }

    const rows = attachRecords(nestSubtasks((data as DbTask[]).map(dbTaskToTask)), commitments, focus)
    tasksCache = { userId, rows, at: Date.now() }
    return rows
  })()

  tasksInFlight = { userId, promise: request }
  try {
    return await request
  } finally {
    if (tasksInFlight?.promise === request) tasksInFlight = null
  }
}

// Nest subtasks under their parent tasks
function nestSubtasks(tasks: Task[]): Task[] {
  const taskMap = new Map<string, Task>()
  const subtasksByParent = new Map<string, Task[]>()
  const atTopLevel = new Set(tasks.map((t) => t.id))

  // First pass (a): children ALREADY nested from an earlier call. Without this,
  // re-nesting a half-nested list rebuilt each parent from the flat rows only
  // and dropped every child that had been nested by the previous write —
  // grouping two tasks in one gesture made the first one vanish until refresh.
  //
  // A child that also appears as a flat row is skipped here: that copy is the
  // fresher one (it is what the write just produced) and it decides where the
  // child now belongs — including out of this parent entirely.
  for (const task of tasks) {
    for (const child of task.subtasks ?? []) {
      if (atTopLevel.has(child.id)) continue
      const existing = subtasksByParent.get(task.id) || []
      existing.push(child)
      subtasksByParent.set(task.id, existing)
    }
  }

  // First pass (b): index all tasks and group the flat rows that name a parent.
  // Duplicate ids in the input (e.g. a realtime INSERT racing a refetch)
  // collapse to one.
  for (const task of tasks) {
    if (taskMap.has(task.id)) continue
    taskMap.set(task.id, { ...task })
    if (task.parentTaskId) {
      const existing = subtasksByParent.get(task.parentTaskId) || []
      existing.push(task)
      subtasksByParent.set(task.parentTaskId, existing)
    }
  }

  // Second pass: attach subtasks to parents and filter out subtasks from top level
  const result: Task[] = []
  const emitted = new Set<string>()
  for (const task of tasks) {
    if (!task.parentTaskId && !emitted.has(task.id)) {
      emitted.add(task.id)
      const taskWithSubtasks = taskMap.get(task.id)!
      const subtasks = subtasksByParent.get(task.id)
      if (subtasks && subtasks.length > 0) {
        // The fetch is newest-first; a checklist reads top-to-bottom in the
        // order its items were created, so flip to oldest-first here.
        taskWithSubtasks.subtasks = [...subtasks].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        )
      } else if (task.subtasks) {
        // It HAD children and none survived the merge — every one of them
        // turned up as a flat row, so they have been detached or moved. Leave
        // the array empty rather than stale. (A task that never had a subtasks
        // array keeps `undefined`, so "not loaded" stays distinguishable.)
        taskWithSubtasks.subtasks = []
      }
      result.push(taskWithSubtasks)
    }
  }

  return result
}

export function useSupabaseTasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers()

  // Always-current mirror of `tasks` for lookups inside stored closures.
  // Mutation callbacks (updateTask, pushTask, …) get captured by UI that
  // outlives a render — confirmation toasts, menus — and a lookup against the
  // closed-over `tasks` array misses tasks created after capture, silently
  // no-oping the write ("scheduled for today" that never lands). Refs don't
  // go stale.
  const tasksRef = useRef<Task[]>(tasks)
  tasksRef.current = tasks

  /** After a failed commitment/focus write: the database is the truth again.
   *  Returns the reconciled task (null = could not read), and updates tasksRef
   *  synchronously so a retry in the same tick plans from it. */
  const reconcileCommitments = useCallback(async (taskId: string): Promise<Task | null> => {
    const [{ data: cs, error: ce }, { data: fs, error: fe }] = await Promise.all([
      supabase.from('task_commitments').select('*').eq('task_id', taskId),
      supabase.from('task_focus').select('*').eq('task_id', taskId),
    ])
    if (ce || !cs) return null   // unread: the caller reverts to its snapshot and blocks retries
    const commitments = (cs as DbTaskCommitment[]).map(dbCommitmentToCommitment)
    // A focus read that failed keeps what we had; it is never "no focus".
    const focus = !fe && fs ? (fs as DbTaskFocus[]).map(dbFocusToFocus) : undefined
    const base = lookupTaskById(tasksRef.current, taskId)
    if (!base) return null
    const merged: Task = { ...base, commitments, ...(focus ? { focus } : {}) }
    const reconciled: Task = { ...merged, ...deriveCache(merged) }
    tasksRef.current = patchTaskRecords(tasksRef.current, taskId, () => reconciled)   // visible NOW
    setTasks((prev) => patchTaskRecords(prev, taskId, () => reconciled))              // and after the render
    return reconciled
  }, [])

  // Fetch tasks. Exposed as `refetch` so an external write (e.g. the assistant
  // creating a task server-side) can force an immediate refresh, since realtime
  // is not relied upon for those.
  const fetchTasks = useCallback(async (options?: { force?: boolean }) => {
    if (!user) {
      // Never hand one account's rows to the next.
      tasksInFlight = null
      tasksCache = null
      setTasks([])
      setLoading(false)
      return
    }

    const force = options?.force === true

    // The tab already has the list, and live writes have kept it in step.
    //
    // Serve it even past the TTL, then refresh behind the render. An expired
    // cache is not a reason to show a spinner: the detail panel mounts its own
    // instance and renders "Loading…" until it has the task, so waiting on a
    // fetch here is a blank panel — 30 seconds of one, on a contended
    // connection. Reported from real use. Stale-by-a-minute rows are worth far
    // more than an empty panel, and realtime corrects them within the tick.
    if (!force && tasksCache && tasksCache.userId === user.id) {
      const expired = Date.now() - tasksCache.at >= TASKS_CACHE_TTL_MS
      setTasks(cloneRows(tasksCache.rows))
      setLoading(false)
      if (!expired) return
      // Refresh behind the render — no spinner, rows already on screen.
      void loadTasks(user.id, setError).then((rows) => {
        if (rows) setTasks(cloneRows(rows))
      })
      return
    }

    setLoading(true)
    setError(null)
    try {
      const rows = await loadTasks(user.id, setError)
      if (rows) setTasks(cloneRows(rows))
    } finally {
      setLoading(false)
    }
  }, [user])

  /** An external write happened — go back to the database, ignoring the share. */
  const refetch = useCallback(() => fetchTasks({ force: true }), [fetchTasks])

  // Apply an incoming write (realtime payload or same-tab announcement) to this
  // instance's state. Insert/update/delete mirror the realtime semantics:
  // inserts dedupe against optimistic copies, updates match top-level tasks and
  // nested subtasks, deletes sweep both levels.
  const applyIncomingInsert = useCallback((newTask: Task) => {
    patchCache((rows) => applyInsert(rows, newTask))
    setTasks((prev) => applyInsert(prev, newTask))
  }, [])

  const applyIncomingUpdate = useCallback((updatedTask: Task) => {
    patchCache((rows) => applyUpdate(rows, updatedTask))
    setTasks((prev) => applyUpdate(prev, updatedTask))
  }, [])

  const applyIncomingDelete = useCallback((deletedId: string) => {
    patchCache((rows) => applyDelete(rows, deletedId))
    setTasks((prev) => applyDelete(prev, deletedId))
  }, [])

  // Fetch on mount / user change, then subscribe to realtime.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setTasks([])
      setLoading(false)
      return
    }

    fetchTasks()

    // Subscribe to real-time changes for tasks.
    // The topic MUST be unique per hook instance: several instances mount at
    // once (ShellLayout, ShellSearch, the active view, the detail panel), and
    // supabase-js returns the SAME channel object for a repeated topic — the
    // second .subscribe() errors, and any instance's unmount cleanup killed
    // the shared channel for everyone else. That was the "edits in the detail
    // panel don't appear in the list until refresh" bug.
    const channel = supabase
      .channel(`tasks-changes-${++tasksChannelSeq}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        (payload) => {
          logger.debug('[useSupabaseTasks] Real-time update:', payload)

          if (payload.eventType === 'INSERT') {
            applyIncomingInsert(dbTaskToTask(payload.new as DbTask))
          } else if (payload.eventType === 'UPDATE') {
            applyIncomingUpdate(dbTaskToTask(payload.new as DbTask))
          } else if (payload.eventType === 'DELETE') {
            applyIncomingDelete((payload.old as { id: string }).id)
          }
        }
      )
      // The supporting records: a commitment or focus row changing anywhere
      // (the other adult's tab, the DB trigger, the fold) patches the task
      // it belongs to. A DELETE payload carries only the key columns.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_commitments' },
        (payload) => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as DbTaskCommitment
          if (!row?.task_id) return
          const patch = (rows: Task[]) => applyCommitmentEvent(rows, payload.eventType, row)
          setTasks(patch)
          patchCache(patch)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_focus' },
        (payload) => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as DbTaskFocus
          if (!row?.task_id) return
          const patch = (rows: Task[]) => applyFocusEvent(rows, payload.eventType, row)
          setTasks(patch)
          patchCache(patch)
        }
      )
      .subscribe()

    // Same-tab writes from OTHER hook instances (see localTaskWrites above).
    // The acting instance re-applies its own announcement too — idempotent, it
    // matches the optimistic state already set.
    const onLocalWrite = (e: Event) => {
      const detail = (e as CustomEvent<LocalTaskWrite>).detail
      if (detail.kind === 'insert') applyIncomingInsert(detail.task)
      else if (detail.kind === 'update') applyIncomingUpdate(detail.task)
      else applyIncomingDelete(detail.id)
    }
    localTaskWrites.addEventListener('write', onLocalWrite)

    // A reconnect only resumes delivery going forward — every change made while
    // the socket was down was never sent and never will be. Without this the
    // list would look live again while quietly missing whatever it slept
    // through, which is worse than being visibly stale.
    const stopResumed = onRealtimeResumed(() => { void fetchTasks({ force: true }) })

    // Cleanup subscription on unmount
    return () => {
      channel.unsubscribe()
      localTaskWrites.removeEventListener('write', onLocalWrite)
      stopResumed()
    }
  }, [user, fetchTasks, applyIncomingInsert, applyIncomingUpdate, applyIncomingDelete])

  // Options for creating linked tasks
  interface AddTaskOptions {
    linkedTo?: LinkedActivity
    linkType?: LinkType
    assignedTo?: string | null  // Family member ID to assign task to (null = no assignment, undefined = use default)
    assignedToAll?: string[]  // Multiple family member IDs (for shared tasks)
    category?: TaskCategory  // What kind of family item
    context?: TaskContext | null  // Life domain for filtering (null = private/untagged)
    location?: string  // Address or place name
    locationPlaceId?: string  // Google Place ID for precise directions
    defaultAssigneeId?: string  // Default assignee if assignedTo is undefined
    isAllDay?: boolean  // Whether the task is all-day (no specific time)
    parentTaskId?: string  // Link as follow-up to a parent task (for context lineage)
    phoneNumber?: string  // Tap-to-call number (e.g. resolved from a linked contact)
    email?: string        // Tap-to-mail address
    /** Create directly into a horizon pool (week/month/quarter/someday). Doing it
     *  in the INSERT avoids the addTask-then-setBucket race: the follow-up write
     *  can hit tasksRef before the temp→real id swap has rendered, and be
     *  silently dropped ("Task not found"). Ignored when scheduledFor is set. */
    bucket?: TaskBucket
    /** Which week a bucket='week' creation belongs to (placement cascade: week
     *  rows must say WHICH week). Rides the INSERT — same race rationale as
     *  `bucket`. Ignored unless bucket is 'week'. */
    weekStart?: Date
    /** Which month a bucket='month' creation belongs to. Defaults to this month. */
    monthStart?: Date
    /** Which season a bucket='quarter' creation belongs to. Defaults to this season. */
    seasonStart?: Date
    /** A month/season goal: ticked, never placed. Ignored outside those buckets. */
    isGoal?: boolean
    /** Cascade lineage: the task this one is copied down from. */
    sourceId?: string
    /** Season pick: set when the created quarter item is immediately chosen as
     *  one of the season's picks (rides the INSERT — same race rationale as bucket). */
    pickedAt?: Date
    /** Cascade lineage: the annual goal this task serves (inherited by copies). */
    goalId?: string
    goalTaskId?: string
    /** Fun-audit mark. */
    isFun?: boolean
    /** Rich context carried on the INSERT. Same race rationale as `bucket`: a
     *  follow-up updateTask can reach findTaskById before the temp->real id swap
     *  has landed and be dropped whole ("Task not found"), which silently lost
     *  these fields on every undo/restore. */
    notes?: string
    links?: TaskLink[]
    needsDiscussion?: boolean
    discussionNote?: string
    /** The day this task was marked "needed today". Carried on restore so undo doesn't drop the mark. */
    neededOn?: Date
    /** The day this task is chosen for (Today's main list) — "Add to today" writes it. */
    plannedOn?: Date
    /** Use this id for the new row (idempotent create: a retry finds it). */
    id?: string
  }

  const addTask = useCallback(async (
    title: string,
    contactId?: string,
    projectId?: string,
    scheduledFor?: Date,
    options?: AddTaskOptions
  ): Promise<string | undefined> => {
    if (!user) {
      return undefined
    }

    // Determine assignment: explicit assignedTo takes precedence, then default, then null
    // This allows callers to explicitly pass null to create unassigned tasks
    const effectiveAssignedTo = options?.assignedTo !== undefined
      ? options.assignedTo
      : options?.defaultAssigneeId ?? null

    // Optimistic update
    const tempId = options?.id ?? crypto.randomUUID()
    const now = new Date()
    const optimisticTask: Task = {
      id: tempId,
      title,
      completed: false,
      bucket: scheduledFor ? 'timed' : options?.bucket ?? 'inbox',
      createdAt: now,
      updatedAt: now,
      userId: user.id,
      contactId,
      projectId,
      scheduledFor,
      weekStart: !scheduledFor && options?.bucket === 'week' ? options?.weekStart : undefined,
      monthStart: !scheduledFor && options?.bucket === 'month' ? (options?.monthStart ?? monthStartOf(now)) : undefined,
      seasonStart: !scheduledFor && options?.bucket === 'quarter' ? (options?.seasonStart ?? seasonStartFor(now, readSeasons())) : undefined,
      isGoal: !scheduledFor && (options?.bucket === 'month' || options?.bucket === 'quarter') && options?.isGoal === true,
      linkedTo: options?.linkedTo,
      linkType: options?.linkType,
      assignedTo: effectiveAssignedTo ?? undefined,
      assignedToAll: options?.assignedToAll,
      category: options?.category ?? 'task',
      context: options?.context ?? null,
      scope: scopeForDomain(
        options?.context ?? null,
        [effectiveAssignedTo, ...(options?.assignedToAll ?? [])],
        getCurrentUserMember()?.id,
      ),
      location: options?.location,
      locationPlaceId: options?.locationPlaceId,
      isAllDay: options?.isAllDay,
      parentTaskId: options?.parentTaskId,
      phoneNumber: options?.phoneNumber,
      email: options?.email,
      sourceId: options?.sourceId,
      goalId: options?.goalId,
      isFun: options?.isFun,
      pickedAt: options?.pickedAt,
      notes: options?.notes,
      links: options?.links,
      needsDiscussion: options?.needsDiscussion,
      discussionNote: options?.discussionNote,
      neededOn: options?.neededOn,
      // Chosen for a day = this person's focus row, never the shared column.
      focus: options?.plannedOn ? [{ userId: user.id, date: options.plannedOn }] : [],
      commitments: [],
    }
    setTasks((prev) => [optimisticTask, ...prev])

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        ...(options?.id ? { id: options.id } : {}),
        user_id: user.id,
        title,
        completed: false,
        bucket: scheduledFor ? 'timed' : options?.bucket ?? 'inbox',
        contact_id: contactId ?? null,
        project_id: projectId ?? null,
        scheduled_for: scheduledFor?.toISOString() ?? null,
        // `week_start` is a DATE column — localYmd, not toISOString (which shifts the day west of Greenwich).
        week_start: !scheduledFor && options?.bucket === 'week' && options?.weekStart ? localYmd(options.weekStart) : null,
        month_start: !scheduledFor && options?.bucket === 'month'
          ? localYmd(options?.monthStart ?? monthStartOf(now)) : null,
        season_start: !scheduledFor && options?.bucket === 'quarter'
          ? localYmd(options?.seasonStart ?? seasonStartFor(now, readSeasons())) : null,
        is_goal: !scheduledFor && (options?.bucket === 'month' || options?.bucket === 'quarter') && options?.isGoal === true,
        linked_activity_type: options?.linkedTo?.type ?? null,
        linked_activity_id: options?.linkedTo?.id ?? null,
        link_type: options?.linkType ?? null,
        assigned_to: effectiveAssignedTo,
        assigned_to_all: options?.assignedToAll ?? null,
        category: options?.category ?? 'task',
        context: options?.context ?? null,
        // Scope is DERIVED, never passed in: what the row is (its domain) plus
        // who it was handed to says exactly who may read it. See scopeForDomain.
        scope: scopeForDomain(
          options?.context ?? null,
          [effectiveAssignedTo, ...(options?.assignedToAll ?? [])],
          getCurrentUserMember()?.id,
        ),
        location: options?.location ?? null,
        location_place_id: options?.locationPlaceId ?? null,
        is_all_day: options?.isAllDay ?? null,
        parent_task_id: options?.parentTaskId ?? null,
        phone_number: options?.phoneNumber ?? null,
        email: options?.email ?? null,
        source_id: options?.sourceId ?? null,
        goal_id: options?.goalId ?? null,
        goal_task_id: options?.goalTaskId ?? null,
        is_fun: options?.isFun ?? false,
        picked_at: options?.pickedAt?.toISOString() ?? null,
        notes: options?.notes ?? null,
        links: options?.links ?? null,
        needs_discussion: options?.needsDiscussion ?? false,
        discussion_note: options?.discussionNote ?? null,
        needed_on: options?.neededOn ? localYmd(options.neededOn) : null,
      })
      .select()
      .single()

    if (insertError) {
      if (options?.id && insertError.code === '23505') {
        // Already created by an earlier attempt (a retried or interrupted save).
        // The placeholder shares the real id, so REPLACE it with the stored row —
        // filtering by id would remove the real task too, and no INSERT event
        // is coming to bring it back (review 2026-09-21).
        const { data: existing } = await supabase.from('tasks').select('*').eq('id', options.id).maybeSingle()
        if (existing) {
          const stored = dbTaskToTask(existing as DbTask)
          const had = tasksRef.current.find((t) => t.id === options.id && t !== optimisticTask)
          setTasks((prev) => {
            const rest = prev.filter((t) => t.id !== options.id)
            const held = prev.find((t) => t.id === options.id && t !== optimisticTask) ?? had
            return [{ ...stored, commitments: held?.commitments ?? stored.commitments, focus: held?.focus ?? stored.focus }, ...rest]
          })
          // A row this list never held arrives without its period records: read them.
          if (!had?.commitments) void reconcileCommitments(options.id)
          return options.id
        }
      }
      // Rollback on error. By identity: with a caller-given id the placeholder
      // shares its id with any real copy already in the list.
      setTasks((prev) => prev.filter((t) => t !== optimisticTask))
      setError(insertError.message)
      showToast('Failed to add task', 'error', 4000)
      return undefined
    }

    // The DB mirror trigger has already written the period commitment the
    // bucket implies; it reaches this list through realtime. Focus is ours
    // to write: one row for this person and this day.
    let focus: TaskFocusEntry[] = []
    if (options?.plannedOn) {
      const { error: focusError } = await supabase
        .from('task_focus')
        .upsert({ task_id: (data as DbTask).id, user_id: user.id, date: localYmd(options.plannedOn) }, { onConflict: 'task_id,user_id,date' })
      if (focusError) logger.warn('[addTask] focus row failed:', focusError.message)
      else focus = [{ userId: user.id, date: options.plannedOn }]
    }
    const createdTask: Task = { ...dbTaskToTask(data as DbTask), commitments: optimisticTask.commitments, focus }

    // Replace optimistic task with real one. Drop any copy the realtime
    // INSERT already delivered (it can land before this response), otherwise
    // the swap leaves the task in the list twice.
    // By identity, not id: with a caller-given id the placeholder and the
    // real row share one.
    setTasks((prev) =>
      prev
        .filter((t) => t.id !== createdTask.id || t === optimisticTask)
        .map((t) => (t === optimisticTask ? createdTask : t))
    )

    announceLocalWrite({ kind: 'insert', task: createdTask })

    return createdTask.id
  }, [user, getCurrentUserMember, reconcileCommitments])

  // Add a subtask to a parent task
  const addSubtask = useCallback(async (
    parentId: string,
    title: string,
    options?: { defaultAssigneeId?: string }
  ): Promise<string | undefined> => {
    if (!user) return undefined

    // Find parent to inherit properties
    const parent = tasks.find((t) => t.id === parentId)
    if (!parent) return undefined

    // Inherit assignedTo from parent, or use default if parent has no assignment
    const effectiveAssignedTo = parent.assignedTo ?? options?.defaultAssigneeId ?? null

    const tempId = crypto.randomUUID()
    const now = new Date()
    const optimisticSubtask: Task = {
      id: tempId,
      title,
      completed: false,
      bucket: 'inbox',
      createdAt: now,
      updatedAt: now,
      parentTaskId: parentId,
      projectId: parent.projectId,
      contactId: parent.contactId,
      assignedTo: effectiveAssignedTo ?? undefined,
    }

    // Optimistic: add subtask to parent's subtasks array
    setTasks((prev) =>
      prev.map((t) =>
        t.id === parentId
          ? { ...t, subtasks: [...(t.subtasks || []), optimisticSubtask] }
          : t
      )
    )

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        completed: false,
        parent_task_id: parentId,
        project_id: parent.projectId ?? null,
        contact_id: parent.contactId ?? null,
        assigned_to: effectiveAssignedTo,
        // A step inherits its parent's assignee, and RLS reads scope alone — so
        // derive it from the parent's domain + that assignee, or the person the
        // step was handed to cannot see it. The step's own `context` stays null:
        // it is a step of the parent, not a separate item on a domain surface.
        scope: scopeForDomain(parent.context ?? null, [effectiveAssignedTo], getCurrentUserMember()?.id),
      })
      .select()
      .single()

    if (insertError) {
      // Rollback
      setTasks((prev) =>
        prev.map((t) =>
          t.id === parentId
            ? { ...t, subtasks: (t.subtasks || []).filter((s) => s.id !== tempId) }
            : t
        )
      )
      setError(insertError.message)
      showToast('Failed to add subtask', 'error', 4000)
      return undefined
    }

    const createdSubtask = dbTaskToTask(data as DbTask)

    // Replace optimistic subtask with real one. Drop any copy the realtime
    // INSERT already delivered (it can land before this response).
    setTasks((prev) =>
      prev.map((t) =>
        t.id === parentId
          ? {
              ...t,
              subtasks: (t.subtasks || [])
                .filter((s) => s.id !== createdSubtask.id)
                .map((s) => (s.id === tempId ? createdSubtask : s)),
            }
          : t
      )
    )

    announceLocalWrite({ kind: 'insert', task: createdSubtask })

    return createdSubtask.id
  }, [user, tasks, getCurrentUserMember])

  // Helper to find a task by id, including in subtasks. The walk itself lives
  // in @/lib/findTaskById so callers outside this hook (HomeView's undo toast)
  // can agree with it about a subtask instead of scanning the list flat.
  const findTaskById = useCallback(
    (id: string): Task | undefined => lookupTaskById(tasksRef.current, id),
    [],
  )

  // Helper to find parent of a subtask
  const findParentOfSubtask = useCallback((subtaskId: string): Task | undefined => {
    return tasksRef.current.find((t) => t.subtasks?.some((s) => s.id === subtaskId))
  }, [])

  /**
   * The `self` scopeForDomain must exclude: the row's OWNER, never the editor.
   *
   * Iris opens Scott's personal task that he assigned to her (scope 'couple')
   * and re-tags it. With the editor as self, her own id filters out of the
   * assignee list, others=[] → 'individual', and she deletes her own access —
   * narrowing only, and silent. Resolve the owner from `tasks.user_id` instead.
   *
   * When the owner is not a member row we can see, fall back to the current
   * user only if the row IS the current user's (or predates `userId`); for
   * someone else's row answer undefined, which excludes nobody and can only
   * widen ('couple' rather than 'individual'). Over-share beats lock-out.
   */
  const selfMemberIdForOwner = useCallback((ownerUserId: string | undefined): string | undefined => {
    const owner = memberForAuthUser(familyMembers, ownerUserId)
    if (owner) return owner.id
    if (!ownerUserId || ownerUserId === user?.id) return getCurrentUserMember()?.id
    return undefined
  }, [familyMembers, getCurrentUserMember, user?.id])

  /**
   * Write a task's completion (or reopening) the way a tick always has:
   * a parent completes its open subtasks and drops its waiting/discussion
   * flags, and an errand spawned from a list item checks that item off.
   * True only when the task (and, on completing, its subtasks) wrote.
   */
  const writeCompletion = useCallback(async (task: Task, newCompleted: boolean): Promise<boolean> => {
    const id = task.id
    const isSubtask = !!task.parentTaskId

    if (isSubtask) {
      // Toggle subtask - update within parent's subtasks array
      const parent = findParentOfSubtask(id)
      if (!parent) return false

      setTasksNow(tasksRef, setTasks, (prev) =>
        prev.map((t) =>
          t.id === parent.id
            ? {
                ...t,
                subtasks: (t.subtasks || []).map((s) =>
                  s.id === id ? { ...s, completed: newCompleted } : s
                ),
              }
            : t
        )
      )

      const { error: updateError } = await supabase
        .from('tasks')
        .update({ completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
        .eq('id', id)

      if (updateError) {
        // Rollback
        setTasksNow(tasksRef, setTasks, (prev) =>
          prev.map((t) =>
            t.id === parent.id
              ? {
                  ...t,
                  subtasks: (t.subtasks || []).map((s) =>
                    s.id === id ? { ...s, completed: !newCompleted } : s
                  ),
                }
              : t
          )
        )
        setError(updateError.message)
        showToast('Failed to update task', 'error', 4000)
        return false
      }
      announceLocalWrite({ kind: 'update', task: { ...task, completed: newCompleted } })
      return true
    } else {
      // Toggle parent task
      const hasSubtasks = task.subtasks && task.subtasks.length > 0
      const incompleteSubtaskIds = hasSubtasks && newCompleted
        ? task.subtasks!.filter((s) => !s.completed).map((s) => s.id)
        : []

      // Optimistic update - complete parent and all subtasks if completing
      setTasksNow(tasksRef, setTasks, (prev) =>
        prev.map((t) => {
          if (t.id === id) {
            return {
              ...t,
              completed: newCompleted,
              // Clear waiting state when completing
              ...(newCompleted && t.isWaiting ? { isWaiting: false, waitingSince: undefined, waitingFor: undefined } : {}),
              // Clear discussion flag when completing
              ...(newCompleted && t.needsDiscussion ? { needsDiscussion: false, discussionNote: undefined } : {}),
              subtasks: newCompleted
                ? t.subtasks?.map((s) => ({ ...s, completed: true }))
                : t.subtasks,
            }
          }
          return t
        })
      )

      // Update parent in DB — also clear waiting state if completing
      // completed_at rides every completion write; cleared on reopen.
      const dbUpdate: Record<string, unknown> = { completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
      if (newCompleted && task.isWaiting) {
        dbUpdate.is_waiting = false
        dbUpdate.waiting_since = null
        dbUpdate.waiting_for = null
      }
      if (newCompleted && task.needsDiscussion) {
        dbUpdate.needs_discussion = false
        dbUpdate.discussion_note = null
      }
      const { error: updateError } = await supabase
        .from('tasks')
        .update(dbUpdate)
        .eq('id', id)

      if (updateError) {
        // Rollback
        setTasksNow(tasksRef, setTasks, (prev) =>
          prev.map((t) => (t.id === id ? task : t))
        )
        setError(updateError.message)
        showToast('Failed to update task', 'error', 4000)
        return false
      }

      // One-way sync for a task spawned FROM a list item (Needed Today's
      // "schedule a buy item" flow): completing the errand checks the item
      // off its list too. Deliberately only this direction, and only on
      // complete — un-completing the task never un-checks the item, and
      // checking the item at the store never touches the task. Fire and
      // forget: a failed list write must not fail the toggle.
      if (newCompleted && task.linkedTo?.type === 'list_item') {
        void supabase
          .from('list_items')
          .update({ completed: true, completed_at: new Date().toISOString() })
          .eq('id', task.linkedTo.id)
          .then(({ error }) => {
            if (!error) announceToBuyChanged()
          })
      }

      // Mirror the optimistic state for other instances.
      announceLocalWrite({
        kind: 'update',
        task: {
          ...task,
          completed: newCompleted,
          ...(newCompleted && task.isWaiting ? { isWaiting: false, waitingSince: undefined, waitingFor: undefined } : {}),
          ...(newCompleted && task.needsDiscussion ? { needsDiscussion: false, discussionNote: undefined } : {}),
          subtasks: newCompleted
            ? task.subtasks?.map((s) => ({ ...s, completed: true }))
            : task.subtasks,
        },
      })

      // If completing and has incomplete subtasks, complete them too
      if (incompleteSubtaskIds.length > 0) {
        const { error: subtaskError } = await supabase
          .from('tasks')
          .update({ completed: true })
          .in('id', incompleteSubtaskIds)

        if (subtaskError) {
          setError(subtaskError.message)
          return false
        }
      }
      return true
    }
  }, [findParentOfSubtask])

  /** Complete a task — everything a tick does (writeCompletion). True only
   *  when it wrote; an already-completed task is left alone and counts. */
  const completeTask = useCallback(async (id: string): Promise<boolean> => {
    const task = findTaskById(id)
    if (!task) return false
    if (task.completed) return true
    return writeCompletion(task, true)
  }, [findTaskById, writeCompletion])

  const toggleTask = useCallback(async (id: string) => {
    const task = findTaskById(id)
    if (!task) return
    if (!task.completed) { await completeTask(id); return }
    await writeCompletion(task, false)
  }, [findTaskById, completeTask, writeCompletion])

  const toggleWaiting = useCallback(async (id: string) => {
    const task = findTaskById(id)
    if (!task) return

    const newIsWaiting = !task.isWaiting
    const now = new Date()
    const isSubtask = !!task.parentTaskId
    const waitingUpdates = { isWaiting: newIsWaiting, waitingSince: newIsWaiting ? now : undefined }

    // Optimistic update — handle subtasks
    if (isSubtask) {
      const parent = findParentOfSubtask(id)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === parent?.id
            ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === id ? { ...s, ...waitingUpdates } : s) }
            : t
        )
      )
    } else {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, ...waitingUpdates } : t
        )
      )
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        is_waiting: newIsWaiting,
        waiting_since: newIsWaiting ? now.toISOString() : null,
      })
      .eq('id', id)

    if (updateError) {
      // Rollback
      if (isSubtask) {
        const parent = findParentOfSubtask(id)
        setTasks((prev) =>
          prev.map((t) =>
            t.id === parent?.id
              ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === id ? task : s) }
              : t
          )
        )
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? task : t))
        )
      }
      setError(updateError.message)
    } else {
      announceLocalWrite({ kind: 'update', task: { ...task, ...waitingUpdates } })
    }
  }, [findTaskById, findParentOfSubtask])

  const deleteTask = useCallback(async (id: string) => {
    // Save for rollback
    const taskToDelete = findTaskById(id)
    if (!taskToDelete) return

    const isSubtask = !!taskToDelete.parentTaskId

    // Optimistic update — handle subtasks
    if (isSubtask) {
      const parent = findParentOfSubtask(id)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === parent?.id
            ? { ...t, subtasks: (t.subtasks || []).filter((s) => s.id !== id) }
            : t
        )
      )
    } else {
      setTasks((prev) => prev.filter((t) => t.id !== id))
    }

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (deleteError) {
      // Rollback on error
      if (isSubtask) {
        const parent = findParentOfSubtask(id)
        setTasks((prev) =>
          prev.map((t) =>
            t.id === parent?.id
              ? { ...t, subtasks: [...(t.subtasks || []), taskToDelete] }
              : t
          )
        )
      } else {
        setTasks((prev) => [...prev, taskToDelete])
      }
      setError(deleteError.message)
      showToast('Failed to delete task', 'error', 4000)
    } else {
      announceLocalWrite({ kind: 'delete', id })
    }
  }, [findTaskById, findParentOfSubtask])

  /**
   * Write a placement plan's supporting records (task_commitments, task_focus)
   * after the row itself has been written. The row write already carried the
   * cached bucket/stamps, and the DB mirror trigger has ensured the commitment
   * that bucket implies — so `ensure` is a harmless upsert here and `remove` /
   * `carry` are the writes that only the app can express. `done` / `reopen`
   * are the completion trigger's job.
   *
   * Sequential on purpose: two ops on the same row race the sync trigger.
   *
   * True only when every op wrote. On any failure the task's records are
   * re-read (the optimistic state never outlives a failed write); if that read
   * fails too, the task goes back to `before` and is marked unreconciled, so
   * the next placement write must re-read before it may send.
   */
  const writePlacementOps = useCallback(async (taskId: string, plan: PlacementPlan, before?: Task): Promise<boolean> => {
    const now = new Date().toISOString()
    let allOk = true
    for (const op of plan.commitmentOps) {
      const key = commitmentRow(taskId, op)
      let error: { message: string } | null | undefined
      try {
        if (op.op === 'ensure') {
          ;({ error } = await supabase
            .from('task_commitments')
            .upsert({ ...key, status: 'open', ended_at: null, created_by: user?.id ?? null }, { onConflict: 'task_id,level,period_start' }))
        } else if (op.op === 'remove') {
          ;({ error } = await supabase
            .from('task_commitments')
            .update({ status: 'removed', ended_at: now })
            .eq('task_id', key.task_id).eq('level', key.level).eq('period_start', key.period_start).eq('status', 'open'))
        } else if (op.op === 'carry') {
          ;({ error } = await supabase
            .from('task_commitments')
            .update({ status: 'carried', carried_to: localYmd(op.to), ended_at: now })
            .eq('task_id', key.task_id).eq('level', key.level).eq('period_start', key.period_start).eq('status', 'open'))
        }
      } catch (e) {
        error = { message: e instanceof Error ? e.message : String(e) }
      }
      if (error) {
        allOk = false
        console.error('[placement] commitment write failed:', op, error.message)
        showToast('Saved, but its period list may be out of date — refresh to check', 'error', 4000)
      }
    }
    for (const op of plan.focusOps) {
      let error: { message: string } | null | undefined
      try {
        if (op.op === 'set') {
          ;({ error } = await supabase
            .from('task_focus')
            .upsert({ task_id: taskId, user_id: op.userId, date: localYmd(op.date) }, { onConflict: 'task_id,user_id,date' }))
        } else {
          let q = supabase.from('task_focus').delete().eq('task_id', taskId).eq('user_id', op.userId)
          if (op.date) q = q.eq('date', localYmd(op.date))
          ;({ error } = await q)
        }
      } catch (e) {
        error = { message: e instanceof Error ? e.message : String(e) }
      }
      if (error) {
        allOk = false
        console.error('[placement] focus write failed:', op, error.message)
        showToast("Couldn't save your choice for the day", 'error', 4000)
      }
    }
    if (!allOk) {
      const read = await reconcileCommitments(taskId)
      if (!read) {
        // Unknown ≠ optimistic: go back to what we had before this write, and
        // make every later placement write re-read before it may send.
        if (before) setTasksNow(tasksRef, setTasks, (prev) => patchTaskRecords(prev, taskId, () => before))
        unreconciledTasks.add(taskId)
      }
    }
    return allOk
  }, [user, reconcileCommitments])

  /** A task whose last write failed and could not be re-read may not be written
   *  from local state. Returns the task to plan from: the RECONCILED one when a
   *  re-read was needed, the current one otherwise, or null = refuse the write. */
  const ensureReconciled = useCallback(async (taskId: string): Promise<Task | null> => {
    if (!unreconciledTasks.has(taskId)) return findTaskById(taskId) ?? null
    const fresh = await reconcileCommitments(taskId)
    if (!fresh) {
      showToast("Couldn't check this task's plan. Try again in a moment.", 'error', 4000)
      return null
    }
    unreconciledTasks.delete(taskId)
    return fresh
  }, [reconcileCommitments, findTaskById])

  /**
   * The look-back's "Keep": the SAME row — task OR goal — carried into the
   * next period. This period's commitment is marked carried ("→ Carried to
   * October"); the next period gets an open one. The id never changes, so
   * notes, steps, attachments and threads all stay put.
   *
   * A GOAL keeps its open steps too. Carrying "Transform the porch" into
   * October and leaving "buy new chairs" behind in September would empty the
   * goal of the work that defines it, and re-deciding four steps one at a time
   * is deliberation the cadence already spent on the goal itself. Finished
   * steps stay behind: they are September's record. So does a step already
   * placed lower, which is carrying on on its own.
   *
   * `from` names the period being carried FROM. Without it planKeep carries
   * the LATEST open commitment — after a half-failed Keep that is the
   * destination the mirror trigger already opened, so a retry would "carry"
   * October and leave September open. Callers that know the source pass it.
   *
   * Returns the task's own id (callers used to receive the copy's), or
   * undefined unless the task AND every step it carries were written.
   */
  const keepForward = useCallback(async (id: string, period: { monthStart?: Date; seasonStart?: Date }, from?: Date): Promise<string | undefined> => {
    const task = findTaskById(id)
    if (!task) return undefined
    const level: PlacementLevel | null = period.monthStart ? 'month' : period.seasonStart ? 'season' : null
    const to = period.monthStart ?? period.seasonStart
    if (!level || !to) return undefined

    const keepOne = async (taskId: string) => {
      const t = await ensureReconciled(taskId)
      if (!t) return false
      const plan = planKeep(t, level, to, from)
      const before = t
      setTasksNow(tasksRef, setTasks, (prev) => prev.map((x) => (x.id === t.id ? plan.local : x)))
      const dbRow: Record<string, unknown> = {
        bucket: plan.row.bucket,
        week_start: plan.row.weekStart ? localYmd(plan.row.weekStart) : null,
        month_start: plan.row.monthStart ? localYmd(plan.row.monthStart) : null,
        season_start: plan.row.seasonStart ? localYmd(plan.row.seasonStart) : null,
      }
      const { error } = await supabase.from('tasks').update(dbRow).eq('id', t.id)
      if (error) {
        setTasksNow(tasksRef, setTasks, (prev) => prev.map((x) => (x.id === t.id ? before : x)))
        showToast('Failed to keep it forward', 'error', 4000)
        return false
      }
      if (!(await writePlacementOps(t.id, plan, before))) return false
      announceLocalWrite({ kind: 'update', task: plan.local })
      return true
    }

    if (!(await keepOne(id))) return undefined
    let allStepsOk = true
    if (task.isGoal) {
      // Only steps still OPEN in the source period: a step carried by an earlier
      // attempt is done, and is not carried again on a retry.
      // Legacy-aware: committedTo answers from records when a row has them and
      // from bucket + stamp when it doesn't (a step with September's monthStart
      // and no commitment rows is still on September) — review 2026-09-21.
      const steps = stepsThatCarryForward(task.id, tasksRef.current, level).filter((st) => {
        if (!from) return true
        const c = committedTo(st, level, from, { isCurrent: false })
        return c === 'legacy' || (c !== undefined && c.status === 'open')
      })
      for (const step of steps) if (!(await keepOne(step.id))) allStepsOk = false
    }
    // Undefined until the goal AND every step carried: the session keeps the
    // verdict and retries; the goal's own carry is idempotent (planKeep sees
    // the source already carried and only ensures the destination).
    return allStepsOk ? task.id : undefined
  }, [findTaskById, ensureReconciled, writePlacementOps])

  /** Drop: end ONE period commitment. The task is kept (spec: guided planning). */
  const dropCommitment = useCallback(async (id: string, level: PlacementLevel, periodStart: Date): Promise<boolean> => {
    const task = await ensureReconciled(id)
    if (!task) return false
    const plan = planDropCommitment(task, level, periodStart)
    if (plan.commitmentOps.length === 0) return true
    const before = task
    setTasksNow(tasksRef, setTasks, (prev) => prev.map((x) => (x.id === id ? plan.local : x)))
    const { error } = await supabase.from('tasks').update({
      bucket: plan.row.bucket,
      week_start: plan.row.weekStart ? localYmd(plan.row.weekStart) : null,
      month_start: plan.row.monthStart ? localYmd(plan.row.monthStart) : null,
      season_start: plan.row.seasonStart ? localYmd(plan.row.seasonStart) : null,
    }).eq('id', id)
    if (error) {
      setTasksNow(tasksRef, setTasks, (prev) => prev.map((x) => (x.id === id ? before : x)))
      showToast("Couldn't drop it from that period", 'error', 4000)
      return false
    }
    if (!(await writePlacementOps(id, plan, before))) return false
    announceLocalWrite({ kind: 'update', task: plan.local })
    return true
  }, [ensureReconciled, writePlacementOps])

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    logger.debug('[updateTask] Called with:', { id, updates })
    let task = findTaskById(id)
    if (!task) {
      // Should be rare now that lookups read tasksRef — surface it loudly so a
      // dropped write is never silent again.
      console.warn('[updateTask] Task not found, write dropped:', id, updates)
      return false
    }

    // A goal is an outcome you tick, never a thing you place. Refusing here,
    // in the one writer every placement funnels through, covers pushTask,
    // setBucket, scheduleTask, the drag handlers and DomainGate without each
    // of them having to remember. Edits that don't move it — title, tick,
    // domain, notes — pass straight through.
    if (task.isGoal && isPlacement(updates)) {
      logger.debug('[updateTask] placement refused: row is a goal', { id, updates })
      showToast("Goals aren't scheduled — tick it off when it's done", 'info')
      return false
    }

    // A placement plans from the database's records when the last write left
    // them unknown; if they still can't be read, nothing is sent.
    if (isPlacementWrite(updates)) {
      const fresh = await ensureReconciled(id)
      if (!fresh) return false
      task = fresh
    }

    // ONE enduring action (2026-09-21). Whatever dialect the caller speaks —
    // `{ bucket: 'week', weekStart }`, `{ scheduledFor }`, `{ plannedOn }` —
    // the placement module turns it into commitment and focus records on this
    // same row, plus the cached columns the row must carry. Nothing is copied.
    const plan = planPlacement(task, updates, { now: new Date(), userId: user?.id ?? null })
    updates = { ...plan.row, commitments: plan.local.commitments, focus: plan.local.focus }

    // Scope is DERIVED. Recompute whenever anything it depends on moves; a
    // caller-supplied `scope` is ignored on purpose (it is not a choice — the
    // row's domain and its assignees say exactly who may read it).
    //
    // Both directions matter. The old rule only ever widened: assignment
    // pushed a row to 'couple' and nothing walked it back, and a family row
    // re-tagged `personal` kept scope='compound' — so a partner kept read
    // access to medical and job-search items every surface now called private.
    if ('context' in updates || 'assignedTo' in updates || 'assignedToAll' in updates || 'scope' in updates) {
      const next = { ...task, ...updates }
      // A STEP has no domain of its own — addSubtask leaves its context null on
      // purpose — so its scope follows its PARENT's domain. Deriving from the
      // step's own null read every step of a family task as private: assigning
      // one, or answering the (now removed) domain gate, narrowed it to
      // 'individual' and the partner lost a step of a task they share.
      //
      // But `parentTaskId` also links a task into a Today GROUP wrapper
      // (types/task.ts, groupTasks.ts) — nesting a Family task under a
      // Personal wrapper is not the same as making it a step of it. Only fall
      // back to the parent's domain when this row has NO context of its own
      // (a real step, or an untagged task dragged into a group). A row that
      // carries its own context — grouped or not — always derives from
      // itself; the parent's domain never overrides a tag the row already has.
      const parent = task.parentTaskId ? findParentOfSubtask(id) : undefined
      const domain = (parent && next.context == null) ? (parent.context ?? null) : (next.context ?? null)
      const derived = scopeForDomain(
        domain,
        [next.assignedTo, ...(next.assignedToAll ?? [])],
        selfMemberIdForOwner(task.userId),
      )
      if (derived === 'couple' && task.scope !== 'couple') {
        const assignee = familyMembers.find((m) => m.id === next.assignedTo)
        if (assignee) showToast(`Shared with ${assignee.name}`, 'info', 2500)
      }
      updates = { ...updates, scope: derived }
    }

    // The date ⇄ bucket invariants (a date means 'timed'; no date, no 'timed')
    // now live in planPlacement's deriveCache: an unscheduled row falls back to
    // its week or period list, not to the inbox.

    // A group moves as a UNIT: rescheduling a parent carries its children.
    //
    // Without this, moving "Yard optimization" to All day today left its two
    // subtasks dated yesterday — they stayed in the carried-over list, read as
    // belonging to whatever unrelated row sorted above them, and looked lost.
    // Reported from real use, twice. Only the scheduling fields travel; a
    // child's own title, context and assignee are its own.
    const movesSchedule =
      'scheduledFor' in updates || 'isAllDay' in updates || 'bucket' in updates
    const childrenToMove = movesSchedule ? (task.subtasks ?? []) : []
    const childMove: Partial<Task> = {}
    if ('scheduledFor' in updates) childMove.scheduledFor = updates.scheduledFor
    if ('isAllDay' in updates) childMove.isAllDay = updates.isAllDay
    if ('bucket' in updates) childMove.bucket = updates.bucket

    // Optimistic update — handle both top-level tasks and nested subtasks
    const isSubtask = !!task.parentTaskId
    if (isSubtask) {
      const parent = findParentOfSubtask(id)
      setTasksNow(tasksRef, setTasks, (prev) =>
        prev.map((t) =>
          t.id === parent?.id
            ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === id ? { ...s, ...updates } : s) }
            : t
        )
      )
    } else {
      setTasksNow(tasksRef, setTasks, (prev) =>
        prev.map((t) => (t.id === id
          ? {
              ...t,
              ...updates,
              subtasks: childrenToMove.length > 0
                ? (t.subtasks ?? []).map((s) => ({ ...s, ...childMove }))
                : t.subtasks,
            }
          : t))
      )
    }

    // Convert Task updates to DB format
    // Use 'key in updates' to detect when a field is explicitly set (even to undefined)
    const dbUpdates: Record<string, unknown> = {}
    if ('title' in updates) dbUpdates.title = updates.title
    if ('completed' in updates) {
      dbUpdates.completed = updates.completed
      dbUpdates.completed_at = updates.completed ? new Date().toISOString() : null
    }
    if ('bucket' in updates) dbUpdates.bucket = updates.bucket ?? 'inbox'
    if ('scheduledFor' in updates) {
      dbUpdates.scheduled_for = updates.scheduledFor?.toISOString() ?? null
    }
    if ('deferredUntil' in updates) {
      dbUpdates.deferred_until = updates.deferredUntil
        ? updates.deferredUntil.toISOString()
        : null
    }
    if ('deferCount' in updates) dbUpdates.defer_count = updates.deferCount ?? 0
    if ('isAllDay' in updates) dbUpdates.is_all_day = updates.isAllDay ?? null
    if ('isSomeday' in updates) dbUpdates.is_someday = updates.isSomeday ?? false
    if ('context' in updates) dbUpdates.context = updates.context ?? null
    // Whatever `scope` is on `updates` by now is scopeForDomain's answer (see
    // the recompute above), never a caller's.
    if ('scope' in updates) dbUpdates.scope = updates.scope
    if ('category' in updates) dbUpdates.category = updates.category ?? 'task'
    if ('notes' in updates) dbUpdates.notes = updates.notes ?? null
    if ('links' in updates) dbUpdates.links = updates.links ?? null
    if ('phoneNumber' in updates) dbUpdates.phone_number = updates.phoneNumber ?? null
    if ('email' in updates) dbUpdates.email = updates.email ?? null
    if ('contactId' in updates) dbUpdates.contact_id = updates.contactId ?? null
    if ('assignedTo' in updates) dbUpdates.assigned_to = updates.assignedTo ?? null
    if ('assignedToAll' in updates) dbUpdates.assigned_to_all = updates.assignedToAll ?? null
    if ('projectId' in updates) dbUpdates.project_id = updates.projectId ?? null
    if ('parentTaskId' in updates) dbUpdates.parent_task_id = updates.parentTaskId ?? null
    // group_members is `jsonb NOT NULL DEFAULT '[]'` — clearing it must write []
    // (not null), unlike the nullable FK columns above.
    if ('groupMembers' in updates) dbUpdates.group_members = updates.groupMembers ?? []
    if ('linkedEventId' in updates) dbUpdates.linked_event_id = updates.linkedEventId ?? null
    if ('linkedTo' in updates) {
      dbUpdates.linked_activity_type = updates.linkedTo?.type ?? null
      dbUpdates.linked_activity_id = updates.linkedTo?.id ?? null
    }
    if ('linkType' in updates) dbUpdates.link_type = updates.linkType ?? null
    if ('estimatedDuration' in updates) dbUpdates.estimated_duration = updates.estimatedDuration ?? null
    if ('location' in updates) dbUpdates.location = updates.location ?? null
    if ('locationPlaceId' in updates) dbUpdates.location_place_id = updates.locationPlaceId ?? null
    if ('directions' in updates) dbUpdates.directions = updates.directions ?? null
    if ('isWaiting' in updates) dbUpdates.is_waiting = updates.isWaiting ?? false
    if ('waitingSince' in updates) dbUpdates.waiting_since = updates.waitingSince?.toISOString() ?? null
    if ('waitingFor' in updates) dbUpdates.waiting_for = updates.waitingFor?.trim() || null
    if ('needsDiscussion' in updates) dbUpdates.needs_discussion = updates.needsDiscussion ?? false
    if ('discussionNote' in updates) dbUpdates.discussion_note = updates.discussionNote ?? null
    // `needed_on` is a DATE column — localYmd, not toISOString (see week_start above).
    if ('neededOn' in updates) dbUpdates.needed_on = updates.neededOn ? localYmd(updates.neededOn) : null
    // Same `in` rule as needed_on: `{ plannedOn: undefined }` must CLEAR the choice.
    if ('plannedOn' in updates) dbUpdates.planned_on = updates.plannedOn ? localYmd(updates.plannedOn) : null
    if ('sourceId' in updates) dbUpdates.source_id = updates.sourceId ?? null
    if ('goalId' in updates) dbUpdates.goal_id = updates.goalId ?? null
    if ('goalTaskId' in updates) dbUpdates.goal_task_id = updates.goalTaskId ?? null
    if ('isFun' in updates) dbUpdates.is_fun = updates.isFun ?? false
    if ('weekDeferredAt' in updates) dbUpdates.week_deferred_at = updates.weekDeferredAt?.toISOString() ?? null
    // `week_start` is a DATE column — localYmd, not toISOString (which shifts the day west of Greenwich).
    if ('weekStart' in updates) dbUpdates.week_start = updates.weekStart ? localYmd(updates.weekStart) : null
    if ('monthStart' in updates) dbUpdates.month_start = updates.monthStart ? localYmd(updates.monthStart) : null
    if ('seasonStart' in updates) dbUpdates.season_start = updates.seasonStart ? localYmd(updates.seasonStart) : null
    if ('isGoal' in updates) dbUpdates.is_goal = updates.isGoal === true
    if ('pickedAt' in updates) dbUpdates.picked_at = updates.pickedAt?.toISOString() ?? null
    if ('sortOrder' in updates) dbUpdates.sort_order = updates.sortOrder ?? null

    logger.debug('[updateTask] Sending to DB:', { id, dbUpdates })
    // A records-only write (choosing a task for today, un-choosing it) names
    // no column on `tasks`; an empty UPDATE would return no row and the
    // records would never be written (found in the first walkthrough). A
    // stated focus list that changes nothing (un-choosing a day that was not
    // chosen) names no column either — no empty UPDATE for that.
    const recordsOnly = Object.keys(dbUpdates).length === 0
    const { data, error: updateError, status, count } = recordsOnly
      ? { data: [{ id }] as unknown[], error: null, status: 200, count: 1 }
      : await supabase
        .from('tasks')
        .update(dbUpdates)
        .eq('id', id)
        .select()

    logger.debug('[updateTask] DB response:', { data, status, count, error: updateError?.message })

    let opsOk = true
    if (updateError) {
      console.error('[updateTask] DB error:', updateError.message)
      showToast('Failed to update task', 'error', 3000)
      // Rollback on error — handle subtasks correctly
      if (isSubtask) {
        const parent = findParentOfSubtask(id)
        setTasksNow(tasksRef, setTasks, (prev) =>
          prev.map((t) =>
            t.id === parent?.id
              ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === id ? task : s) }
              : t
          )
        )
      } else {
        setTasksNow(tasksRef, setTasks, (prev) =>
          prev.map((t) => (t.id === id ? task : t))
        )
      }
      setError(updateError.message)
    } else if (data && data.length > 0) {
      logger.debug('[updateTask] DB update successful, returned notes:', (data[0] as DbTask).notes)
      // The supporting records follow the row.
      if (plan.commitmentOps.length || plan.focusOps.length) opsOk = await writePlacementOps(id, plan, task)
      // Fan out to other instances. Announce the merged LOCAL object, not the
      // returned flat row — a parent's nested subtasks must survive the swap.
      // Only when the records wrote: after a failed commitment/focus write the
      // local task has been reconciled (or restored), and announcing the
      // optimistic records would overwrite that truth here and everywhere
      // (review 2026-09-21, same rule as keepForward/dropCommitment).
      if (opsOk) announceLocalWrite({ kind: 'update', task: { ...task, ...updates } })
    } else {
      console.warn('[updateTask] DB update returned no data!')
    }

    // Carry the children only once the parent's own move actually landed.
    if (!updateError && childrenToMove.length > 0) {
      const childDb: Record<string, unknown> = {}
      if ('bucket' in childMove) childDb.bucket = childMove.bucket ?? 'inbox'
      if ('scheduledFor' in childMove) {
        childDb.scheduled_for = childMove.scheduledFor?.toISOString() ?? null
      }
      if ('isAllDay' in childMove) childDb.is_all_day = childMove.isAllDay ?? null
      const childIds = childrenToMove.map((c) => c.id)
      const { error: childError } = await supabase
        .from('tasks')
        .update(childDb)
        .in('id', childIds)
      if (childError) {
        // The parent moved and the children did not — say so, because a silent
        // half-move is exactly the state that looked like lost tasks.
        console.error('[updateTask] Group children failed to follow:', childError.message)
        showToast('Group moved, but its items stayed behind', 'error', 4000)
      } else {
        for (const child of childrenToMove) {
          announceLocalWrite({ kind: 'update', task: { ...child, ...childMove } })
        }
      }
    }
    // True only when the row itself AND its commitment/focus records were
    // written: callers such as the notes panel say "Saved" on it. An
    // RLS-filtered UPDATE returns no row.
    return !updateError && !!data && data.length > 0 && opsOk
  }, [tasks, familyMembers, findTaskById, findParentOfSubtask, selfMemberIdForOwner, user, writePlacementOps, ensureReconciled])

  // Bulk update multiple tasks at once
  const updateTasksBulk = useCallback(async (requestedIds: string[], updates: Partial<Task>) => {
    // Goals aren't placed. A bulk placement that includes some drops them,
    // says so once, and writes the rest — the same refusal updateTask makes
    // for a single row.
    let taskIds = requestedIds
    if (isPlacement(updates)) {
      const goals = requestedIds.filter((id) => findTaskById(id)?.isGoal)
      if (goals.length) {
        taskIds = requestedIds.filter((id) => !goals.includes(id))
        showToast(`${goals.length} goal${goals.length === 1 ? '' : 's'} stay${goals.length === 1 ? 's' : ''} on the list — goals aren't scheduled`, 'info')
      }
    }
    if (taskIds.length === 0) return

    // A placement is per ROW: each task's commitments differ, so one payload
    // cannot express it. Route each through updateTask (the one placement
    // funnel); the bulk path below is for the fields a selection shares.
    if (isPlacement(updates) || 'plannedOn' in updates) {
      for (const id of taskIds) await updateTask(id, updates)
      return
    }

    logger.debug('[updateTasksBulk] Called with:', { taskIds, updates })

    // Save original tasks for rollback
    const tasksToUpdate = tasks.filter(t => taskIds.includes(t.id))
    const rollbackMap = new Map(tasksToUpdate.map(t => [t.id, { ...t }]))

    logger.debug('[updateTasksBulk] Tasks to update:', tasksToUpdate.length)

    // Scope is DERIVED per ROW, so one bulk payload cannot express it: two rows
    // in the same selection can have different assignees and land on different
    // scopes. Compute each row's scope up front, then write one UPDATE per
    // distinct answer (below). A caller-supplied `scope` is ignored, exactly as
    // in updateTask.
    const derivesScope =
      'context' in updates || 'assignedTo' in updates || 'assignedToAll' in updates || 'scope' in updates
    const scopeById = new Map<string, Scope>()
    if (derivesScope) {
      for (const t of tasksToUpdate) {
        const next = { ...t, ...updates }
        // Per row, `self` is that row's OWNER — see selfMemberIdForOwner.
        scopeById.set(t.id, scopeForDomain(
          next.context ?? null,
          [next.assignedTo, ...(next.assignedToAll ?? [])],
          selfMemberIdForOwner(t.userId),
        ))
      }
    }
    /** The row as it will be after this write, scope included. */
    const merged = (t: Task): Task => {
      const scope = scopeById.get(t.id)
      return scope ? { ...t, ...updates, scope } : { ...t, ...updates }
    }

    // Optimistic update
    setTasks(prev => prev.map(t =>
      taskIds.includes(t.id) ? merged(t) : t
    ))

    // Convert Task updates to DB format (same logic as updateTask)
    const dbUpdates: Record<string, unknown> = {}
    if ('title' in updates) dbUpdates.title = updates.title
    if ('completed' in updates) {
      dbUpdates.completed = updates.completed
      dbUpdates.completed_at = updates.completed ? new Date().toISOString() : null
    }
    if ('bucket' in updates) dbUpdates.bucket = updates.bucket ?? 'inbox'
    if ('scheduledFor' in updates) {
      dbUpdates.scheduled_for = updates.scheduledFor?.toISOString() ?? null
    }
    if ('deferredUntil' in updates) {
      dbUpdates.deferred_until = updates.deferredUntil
        ? updates.deferredUntil.toISOString()
        : null
    }
    if ('deferCount' in updates) dbUpdates.defer_count = updates.deferCount ?? 0
    if ('isAllDay' in updates) dbUpdates.is_all_day = updates.isAllDay ?? null
    if ('isSomeday' in updates) dbUpdates.is_someday = updates.isSomeday ?? false
    if ('context' in updates) dbUpdates.context = updates.context ?? null
    // `scope` is NOT set here — it rides each per-scope UPDATE below.
    if ('category' in updates) dbUpdates.category = updates.category ?? 'task'
    if ('notes' in updates) dbUpdates.notes = updates.notes ?? null
    if ('links' in updates) dbUpdates.links = updates.links ?? null
    if ('phoneNumber' in updates) dbUpdates.phone_number = updates.phoneNumber ?? null
    if ('email' in updates) dbUpdates.email = updates.email ?? null
    if ('contactId' in updates) dbUpdates.contact_id = updates.contactId ?? null
    if ('assignedTo' in updates) dbUpdates.assigned_to = updates.assignedTo ?? null
    if ('assignedToAll' in updates) dbUpdates.assigned_to_all = updates.assignedToAll ?? null
    if ('projectId' in updates) dbUpdates.project_id = updates.projectId ?? null
    if ('parentTaskId' in updates) dbUpdates.parent_task_id = updates.parentTaskId ?? null
    // group_members is `jsonb NOT NULL DEFAULT '[]'` — clearing it must write []
    // (not null), unlike the nullable FK columns above.
    if ('groupMembers' in updates) dbUpdates.group_members = updates.groupMembers ?? []
    if ('linkedEventId' in updates) dbUpdates.linked_event_id = updates.linkedEventId ?? null
    if ('linkedTo' in updates) {
      dbUpdates.linked_activity_type = updates.linkedTo?.type ?? null
      dbUpdates.linked_activity_id = updates.linkedTo?.id ?? null
    }
    if ('linkType' in updates) dbUpdates.link_type = updates.linkType ?? null
    if ('estimatedDuration' in updates) dbUpdates.estimated_duration = updates.estimatedDuration ?? null
    if ('location' in updates) dbUpdates.location = updates.location ?? null
    if ('locationPlaceId' in updates) dbUpdates.location_place_id = updates.locationPlaceId ?? null
    if ('directions' in updates) dbUpdates.directions = updates.directions ?? null
    if ('isWaiting' in updates) dbUpdates.is_waiting = updates.isWaiting ?? false
    if ('waitingSince' in updates) dbUpdates.waiting_since = updates.waitingSince?.toISOString() ?? null
    if ('waitingFor' in updates) dbUpdates.waiting_for = updates.waitingFor?.trim() || null
    if ('needsDiscussion' in updates) dbUpdates.needs_discussion = updates.needsDiscussion ?? false
    if ('discussionNote' in updates) dbUpdates.discussion_note = updates.discussionNote ?? null
    // `needed_on` is a DATE column — localYmd, not toISOString (see week_start above).
    if ('neededOn' in updates) dbUpdates.needed_on = updates.neededOn ? localYmd(updates.neededOn) : null
    // Same `in` rule as needed_on: `{ plannedOn: undefined }` must CLEAR the choice.
    if ('plannedOn' in updates) dbUpdates.planned_on = updates.plannedOn ? localYmd(updates.plannedOn) : null
    if ('sourceId' in updates) dbUpdates.source_id = updates.sourceId ?? null
    if ('goalId' in updates) dbUpdates.goal_id = updates.goalId ?? null
    if ('goalTaskId' in updates) dbUpdates.goal_task_id = updates.goalTaskId ?? null
    if ('isFun' in updates) dbUpdates.is_fun = updates.isFun ?? false
    if ('weekDeferredAt' in updates) dbUpdates.week_deferred_at = updates.weekDeferredAt?.toISOString() ?? null
    // `week_start` is a DATE column — localYmd, not toISOString (which shifts the day west of Greenwich).
    if ('weekStart' in updates) dbUpdates.week_start = updates.weekStart ? localYmd(updates.weekStart) : null
    if ('monthStart' in updates) dbUpdates.month_start = updates.monthStart ? localYmd(updates.monthStart) : null
    if ('seasonStart' in updates) dbUpdates.season_start = updates.seasonStart ? localYmd(updates.seasonStart) : null
    if ('isGoal' in updates) dbUpdates.is_goal = updates.isGoal === true
    if ('pickedAt' in updates) dbUpdates.picked_at = updates.pickedAt?.toISOString() ?? null
    if ('sortOrder' in updates) dbUpdates.sort_order = updates.sortOrder ?? null

    logger.debug('[updateTasksBulk] Sending to DB:', { taskIds, dbUpdates })

    // One `.in()` UPDATE per distinct derived scope. Rows this hook has never
    // seen (not in `tasks`) still get the non-scope half of the payload — they
    // were covered by the old single bulk write and must not silently drop out.
    const groups = new Map<Scope | null, string[]>()
    const push = (scope: Scope | null, id: string) => {
      const ids = groups.get(scope)
      if (ids) ids.push(id)
      else groups.set(scope, [id])
    }
    if (derivesScope) {
      const known = new Set(tasksToUpdate.map(t => t.id))
      for (const t of tasksToUpdate) push(scopeById.get(t.id)!, t.id)
      // An id this instance doesn't hold (`tasks` is the top-level list only)
      // still gets the domain half of the derivation, because `family` decides
      // the scope by itself and needs nothing from the row. Leaving it in the
      // scope-less group is the original bug: context='family' written beside
      // an untouched scope='individual' — on every family surface for its
      // owner, unreadable by the rest of the household.
      const unknownScope: Scope | null = updates.context === 'family' ? 'compound' : null
      for (const id of taskIds) if (!known.has(id)) push(unknownScope, id)
    } else {
      groups.set(null, taskIds)
    }

    // Never `upsert`: PostgREST compiles it to INSERT … ON CONFLICT, and a
    // partial row fails tasks' NOT NULL columns (see updateTaskOrders).
    let updateError: { message: string } | null = null
    for (const [scope, ids] of groups) {
      if (ids.length === 0) continue
      const payload = scope === null ? dbUpdates : { ...dbUpdates, scope }
      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .in('id', ids)
      if (error) { updateError = error; break }
    }

    logger.debug('[updateTasksBulk] DB response:', { error: updateError?.message })

    if (updateError) {
      console.error('[updateTasksBulk] DB error:', updateError.message)
      // Rollback all tasks
      setTasks(prev => prev.map(t => rollbackMap.get(t.id) || t))
      setError(updateError.message)
      showToast('Failed to update tasks', 'error', 4000)
      throw updateError
    }

    for (const t of tasksToUpdate) {
      announceLocalWrite({ kind: 'update', task: merged(t) })
    }
  }, [tasks, selfMemberIdForOwner, findTaskById, updateTask])

  /**
   * Write a different sort_order to each of several tasks. `updateTasksBulk`
   * cannot express this — it applies ONE update object to every id. Optimistic
   * first (the list must not visibly lurch), then one narrow UPDATE per row,
   * issued concurrently; on any failure the previous orders are restored.
   *
   * Deliberately NOT an upsert. PostgREST compiles `.upsert()` into
   * `INSERT … ON CONFLICT DO UPDATE`, and Postgres validates NOT NULL and the
   * RLS INSERT `WITH CHECK` against the *proposed* tuple before it ever probes
   * for the conflict. `tasks.title` and `tasks.user_id` are NOT NULL with no
   * default, so a partial `{ id, sort_order }` row fails with 23502 even though
   * the row already exists. Per-row UPDATE is the file's own idiom and can
   * never be reinterpreted as an insert.
   *
   * Row count is small by design: `reorderTasksByDrag` returns exactly ONE
   * write in the common case; only the renormalise path fans out, bounded by
   * the visible untimed list (~27).
   *
   * Unlike `updateTasksBulk` this does NOT `setError()` or rethrow: a failed
   * drag is a self-healing local event (toast + rollback), not app-level
   * breakage. Returns `true` when every row persisted, `false` when the order
   * was rolled back, so a caller that needs to know can still branch.
   */
  const updateTaskOrders = useCallback(async (writes: OrderWrite[]): Promise<boolean> => {
    if (writes.length === 0) return true

    const byId = new Map(writes.map((w) => [w.id, w.sortOrder]))
    // Read from tasksRef, not the closed-over `tasks` array — this callback
    // can outlive the render that created it (e.g. captured by a drag
    // handler), and a stale closure would silently roll back to stale values.
    // Also snapshot the post-write task objects here, before the optimistic
    // setTasks below — tasksRef only mirrors `tasks` again after a render, so
    // it can't be used to build the announced tasks afterward.
    //
    // Both levels of the tree: `tasks` is nested (nestSubtasks lifts children
    // out of the top level onto `parent.subtasks`), and sortOrder governs group
    // members too — a top-level-only walk would silently no-op every reorder
    // inside a group. Same two-level shape as updateTask.
    const previous = new Map<string, number | null>()
    const updatedTasks: Task[] = []
    const record = (t: Task) => {
      if (!byId.has(t.id)) return
      previous.set(t.id, t.sortOrder ?? null)
      updatedTasks.push({ ...t, sortOrder: byId.get(t.id)! })
    }
    for (const t of tasksRef.current) {
      record(t)
      for (const st of t.subtasks ?? []) record(st)
    }

    const apply = (orders: Map<string, number | null>) =>
      setTasks((prev) =>
        prev.map((t) => {
          const self = orders.has(t.id) ? { ...t, sortOrder: orders.get(t.id)! } : t
          if (!t.subtasks?.length) return self
          let touched = false
          const subtasks = t.subtasks.map((st) => {
            if (!orders.has(st.id)) return st
            touched = true
            return { ...st, sortOrder: orders.get(st.id)! }
          })
          if (!touched) return self
          return { ...self, subtasks }
        }))

    apply(byId)

    // One narrow UPDATE per row, in flight together.
    //
    // Every result is inspected — a partial failure rolls back THE LOCAL LIST.
    // The database is genuinely half-written in that case, and local state
    // re-diverges when the realtime echo for the succeeded rows lands. That is
    // self-healing toward DB truth, and the common path is a single write, so
    // it is acceptable — but the rollback's reach is local, not global.
    //
    // The try/catch is not decoration: supabase-js normally RESOLVES { error },
    // but a transport failure rejects. Without this the rejection escaped with
    // the optimistic order still applied, so the list showed an order the
    // database never took and nothing said so.
    let results: { error: unknown }[]
    try {
      results = await Promise.all(
        writes.map((w) =>
          supabase.from('tasks').update({ sort_order: w.sortOrder }).eq('id', w.id))
      )
    } catch (err) {
      apply(previous)
      showToast("Couldn't save the new order", 'warning')
      logger.error('[updateTaskOrders] rejected:', err)
      return false
    }
    const failure = results.find((r) => r.error)?.error

    if (failure) {
      apply(previous)
      showToast("Couldn't save the new order", 'warning')
      logger.error('[updateTaskOrders] failed:', failure)
      return false
    }

    // Fan out to other instances, same as updateTasksBulk — one announcement
    // per affected task, sent only once the write is confirmed (an earlier,
    // optimistic announcement here would have no way to be un-announced if
    // the write then failed).
    for (const t of updatedTasks) {
      announceLocalWrite({ kind: 'update', task: t })
    }
    return true
  }, [])

  // Schedule a task to a specific date — sets bucket to 'timed'
  // Scheduling a day touches only the day; the row's period commitments stay.
  const scheduleTask = useCallback(async (id: string, date: Date, isAllDay?: boolean) => {
    await updateTask(id, { scheduledFor: date, isAllDay: isAllDay ?? true })
  }, [updateTask])

  // Move a task to a bucket (week, month, quarter) or reschedule to a date
  const pushTask = useCallback(async (id: string, target: Date | 'week' | 'month' | 'quarter') => {
    // A push is a deliberate act of deferral, so it is what defer_count counts.
    // Passive slippage is covered by age instead (expiry is read-side and
    // preserves scheduled_for, so "245 days" stays knowable without a write).
    // Until now this column was READ in five places — urgency.ts, useReviewData,
    // coachLines, overdueSuggestions and proactive-engine Rule 6 — and
    // incremented nowhere, so every `>= 3` branch in the app was dead code.
    const task = findTaskById(id)
    const deferCount = (task?.deferCount ?? 0) + 1

    if (target === 'week' || target === 'month' || target === 'quarter') {
      // Commit to the period that contains now (planPlacement stamps it) and
      // take it off its day. Descending keeps the higher commitments;
      // ascending releases the lower ones.
      await updateTask(id, { bucket: target, scheduledFor: undefined, deferCount })
    } else {
      // Reschedule to a specific date
      const newScheduledFor = new Date(target)

      // Check if task is overdue (scheduled before today)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const isOverdue = task?.scheduledFor && new Date(task.scheduledFor) < today

      if (!isOverdue && task?.isAllDay === false && task?.scheduledFor) {
        // Preserve original time for non-overdue tasks
        newScheduledFor.setHours(task.scheduledFor.getHours(), task.scheduledFor.getMinutes(), 0, 0)
      }

      // If the target date has a specific time set (not midnight), respect it.
      // A day with no time means "all-day" — this MUST be persisted, or the
      // task gets a midnight scheduledFor with isAllDay left undefined, which
      // every timeline view mishandles: Today buckets it as 'unscheduled'
      // instead of "All day", and the Week grid drops it at the 00:00 row
      // (top-left) instead of the all-day strip. Always write a real boolean.
      const hasSpecificTime = newScheduledFor.getHours() !== 0 || newScheduledFor.getMinutes() !== 0
      await updateTask(id, {
        bucket: 'timed',
        scheduledFor: newScheduledFor,
        isAllDay: !hasSpecificTime,
        deferCount,
      })
    }
  }, [findTaskById, updateTask])

  // Set a task's bucket directly (for triage: inbox → week, month, etc.)
  //
  // "This week" MEANS this week, so moving into the week bucket stamps the
  // week. Without it, the one fate the weekly review most needs — "carry it
  // forward" on a move left behind by an earlier week — was a no-op: the task
  // was already bucket='week', so the update changed nothing and the item came
  // back marked stale, forever. Every other bucket has no week, so clear it
  // (otherwise something sent to the month keeps a secret week).
  const setBucket = useCallback(async (id: string, bucket: TaskBucket, scheduledFor?: Date, isAllDay?: boolean) => {
    const updates: Partial<Task> = { bucket }
    if (bucket === 'timed' && scheduledFor) {
      updates.scheduledFor = scheduledFor
      updates.isAllDay = isAllDay ?? true
    } else if (bucket !== 'timed') {
      updates.scheduledFor = undefined
    }
    // The period is the one containing now; planPlacement stamps it and keeps
    // or releases the other commitments by direction (see lib/placement).
    await updateTask(id, updates)
  }, [updateTask])

  /**
   * Mark a month/season item as a goal (ticked, never placed) or back into a
   * task. Only month/quarter rows can be goals — a week row is a task by
   * definition, so it's refused rather than written into an unplaceable state.
   */
  const setGoal = useCallback(async (id: string, isGoal: boolean) => {
    const task = findTaskById(id)
    if (!task) return
    if (isGoal && task.bucket !== 'month' && task.bucket !== 'quarter') {
      showToast('Only a month or season item can be a goal', 'info')
      return
    }
    await updateTask(id, { isGoal })
  }, [findTaskById, updateTask])

  // Add a prep task linked to an event (e.g., "Defrost chicken" for a dinner event)
  const addPrepTask = useCallback(async (
    title: string,
    linkedEventId: string,
    scheduledFor: Date
  ): Promise<string | undefined> => {
    if (!user) return undefined

    // Optimistic update
    const tempId = crypto.randomUUID()
    const now = new Date()
    const optimisticTask: Task = {
      id: tempId,
      title,
      completed: false,
      bucket: 'timed',
      createdAt: now,
      updatedAt: now,
      scheduledFor,
      linkedEventId,
    }
    setTasks((prev) => [optimisticTask, ...prev])

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        completed: false,
        bucket: 'timed',
        scheduled_for: scheduledFor.toISOString(),
        linked_event_id: linkedEventId,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback on error
      setTasks((prev) => prev.filter((t) => t.id !== tempId))
      setError(insertError.message)
      showToast('Failed to add task', 'error', 4000)
      return undefined
    }

    const createdTask = dbTaskToTask(data as DbTask)

    // Replace optimistic task with real one. Drop any copy the realtime
    // INSERT already delivered (it can land before this response), otherwise
    // the swap leaves the task in the list twice.
    setTasks((prev) =>
      prev
        .filter((t) => t.id !== createdTask.id)
        .map((t) => (t.id === tempId ? createdTask : t))
    )

    announceLocalWrite({ kind: 'insert', task: createdTask })

    return createdTask.id
  }, [user])

  // Get prep tasks for a specific event (legacy - use getLinkedTasks for new code)
  const getPrepTasks = useCallback((eventId: string): Task[] => {
    return tasks.filter((t) => t.linkedEventId === eventId)
  }, [tasks])

  // Get all linked tasks (prep and followup) for any activity type
  const getLinkedTasks = useCallback((
    activityType: LinkedActivityType,
    activityId: string
  ): { prep: Task[], followup: Task[] } => {
    const linked = tasks.filter(t =>
      t.linkedTo?.type === activityType &&
      t.linkedTo?.id === activityId
    )
    return {
      prep: linked.filter(t => t.linkType === 'prep'),
      followup: linked.filter(t => t.linkType === 'followup'),
    }
  }, [tasks])

  // `userId`: whose focus rows count on a day (task_focus is per person).
  return { tasks, loading, error, refetch, addTask, addSubtask, addPrepTask, getPrepTasks, getLinkedTasks, toggleTask, toggleWaiting, deleteTask, updateTask, updateTasksBulk, updateTaskOrders, scheduleTask, pushTask, setBucket, setGoal, keepForward, dropCommitment, completeTask, userId: user?.id ?? null }
}
