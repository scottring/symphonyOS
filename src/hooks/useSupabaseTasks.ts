import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useFamilyMembers } from './useFamilyMembers'
import { showToast } from './useToast'
import { logger } from '@/lib/logger'
import type { Task, TaskBucket, TaskLink, TaskContext, TaskCategory, TaskCaptureMeta, LinkedActivity, LinkType, LinkedActivityType, GroupMemberRef } from '@/types/task'
import type { TaskDirections } from '@/types/directions'
import { defaultScopeForArea, scopeForContextChange, type Scope } from '@/lib/scope'
import { localYmd, parseLocalYmd, weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { weekStartForBucket } from '@/lib/today/weekPlacement'
import { onRealtimeResumed } from '@/lib/realtime/keepAlive'
// `import type` on purpose: erased at compile time, so it does NOT drag
// taskOrdering's @dnd-kit/sortable dependency into this hook's runtime bundle.
import type { OrderWrite } from '@/lib/today/taskOrdering'

// Monotonic suffix so every hook instance gets its own realtime channel topic.
let tasksChannelSeq = 0

/** Start of the week we're in now, per the user's weekStartsOn. What "this
 *  week" resolves to for every triage surface that says those words. */
function currentWeekStart(): Date {
  return weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)
}

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

export interface DbTask {
  id: string
  user_id: string
  title: string
  completed: boolean
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
  week_deferred_at: string | null
  week_start: string | null
  picked_at: string | null
  capture_meta: { status?: string; storage_path?: string; suggested_task_id?: string } | null
  source_id: string | null
  goal_id: string | null
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
    weekDeferredAt: dbTask.week_deferred_at ? new Date(dbTask.week_deferred_at) : undefined,
    // A `date` column — parse to LOCAL midnight, never `new Date(str)` (that's UTC).
    weekStart: dbTask.week_start ? parseLocalYmd(dbTask.week_start) : undefined,
    pickedAt: dbTask.picked_at ? new Date(dbTask.picked_at) : undefined,
    sourceId: dbTask.source_id ?? undefined,
    goalId: dbTask.goal_id ?? undefined,
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
    if (t.id === updatedTask.id) return updatedTask
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

    const rows = nestSubtasks((data as DbTask[]).map(dbTaskToTask))
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
    scope?: Scope  // Who can see it (individual/couple/compound); defaults from area
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
    /** Cascade lineage: the task this one is copied down from. */
    sourceId?: string
    /** Season pick: set when the created quarter item is immediately chosen as
     *  one of the season's picks (rides the INSERT — same race rationale as bucket). */
    pickedAt?: Date
    /** Cascade lineage: the annual goal this task serves (inherited by copies). */
    goalId?: string
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
    const tempId = crypto.randomUUID()
    const now = new Date()
    const optimisticTask: Task = {
      id: tempId,
      title,
      completed: false,
      bucket: scheduledFor ? 'timed' : options?.bucket ?? 'inbox',
      createdAt: now,
      updatedAt: now,
      contactId,
      projectId,
      scheduledFor,
      weekStart: !scheduledFor && options?.bucket === 'week' ? options?.weekStart : undefined,
      linkedTo: options?.linkedTo,
      linkType: options?.linkType,
      assignedTo: effectiveAssignedTo ?? undefined,
      assignedToAll: options?.assignedToAll,
      category: options?.category ?? 'task',
      context: options?.context ?? null,
      scope: options?.scope ?? defaultScopeForArea(options?.context ?? null),
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
    }
    setTasks((prev) => [optimisticTask, ...prev])

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        completed: false,
        bucket: scheduledFor ? 'timed' : options?.bucket ?? 'inbox',
        contact_id: contactId ?? null,
        project_id: projectId ?? null,
        scheduled_for: scheduledFor?.toISOString() ?? null,
        // `week_start` is a DATE column — localYmd, not toISOString (which shifts the day west of Greenwich).
        week_start: !scheduledFor && options?.bucket === 'week' && options?.weekStart ? localYmd(options.weekStart) : null,
        linked_activity_type: options?.linkedTo?.type ?? null,
        linked_activity_id: options?.linkedTo?.id ?? null,
        link_type: options?.linkType ?? null,
        assigned_to: effectiveAssignedTo,
        assigned_to_all: options?.assignedToAll ?? null,
        category: options?.category ?? 'task',
        context: options?.context ?? null,
        scope: options?.scope ?? defaultScopeForArea(options?.context ?? null),
        location: options?.location ?? null,
        location_place_id: options?.locationPlaceId ?? null,
        is_all_day: options?.isAllDay ?? null,
        parent_task_id: options?.parentTaskId ?? null,
        phone_number: options?.phoneNumber ?? null,
        email: options?.email ?? null,
        source_id: options?.sourceId ?? null,
        goal_id: options?.goalId ?? null,
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
  }, [user, tasks])

  // Helper to find a task by id, including in subtasks
  const findTaskById = useCallback((id: string): Task | undefined => {
    for (const task of tasksRef.current) {
      if (task.id === id) return task
      if (task.subtasks) {
        const subtask = task.subtasks.find((s) => s.id === id)
        if (subtask) return subtask
      }
    }
    return undefined
  }, [])

  // Helper to find parent of a subtask
  const findParentOfSubtask = useCallback((subtaskId: string): Task | undefined => {
    return tasksRef.current.find((t) => t.subtasks?.some((s) => s.id === subtaskId))
  }, [])

  const toggleTask = useCallback(async (id: string) => {
    const task = findTaskById(id)
    if (!task) return

    const newCompleted = !task.completed
    const isSubtask = !!task.parentTaskId

    if (isSubtask) {
      // Toggle subtask - update within parent's subtasks array
      const parent = findParentOfSubtask(id)
      if (!parent) return

      setTasks((prev) =>
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
        .update({ completed: newCompleted })
        .eq('id', id)

      if (updateError) {
        // Rollback
        setTasks((prev) =>
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
      } else {
        announceLocalWrite({ kind: 'update', task: { ...task, completed: newCompleted } })
      }
    } else {
      // Toggle parent task
      const hasSubtasks = task.subtasks && task.subtasks.length > 0
      const incompleteSubtaskIds = hasSubtasks && newCompleted
        ? task.subtasks!.filter((s) => !s.completed).map((s) => s.id)
        : []

      // Optimistic update - complete parent and all subtasks if completing
      setTasks((prev) =>
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
      const dbUpdate: Record<string, unknown> = { completed: newCompleted }
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
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? task : t))
        )
        setError(updateError.message)
        showToast('Failed to update task', 'error', 4000)
        return
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
        }
      }
    }
  }, [findTaskById, findParentOfSubtask])

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

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    logger.debug('[updateTask] Called with:', { id, updates })
    const task = findTaskById(id)
    if (!task) {
      // Should be rare now that lookups read tasksRef — surface it loudly so a
      // dropped write is never silent again.
      console.warn('[updateTask] Task not found, write dropped:', id, updates)
      return
    }

    // Handing an item to someone answers WHO DOES IT. It does not say what part
    // of life the item belongs to, and it is not a request to publish it.
    //
    // This used to stamp context='family' on any assignment to a household
    // member — with no self-exclusion, so assigning your own item to yourself
    // relabelled it, and scopeForContextChange then dragged scope to
    // 'compound'. That is how a private "Reschedule colo" became a family-area
    // row readable by the whole household, one tap after capture.
    //
    // What assignment genuinely requires is that the assignee can READ the row,
    // and RLS grants that on scope alone (2026-06-07_scope_axis.sql:35 —
    // `scope IN ('couple','compound')`). So raise a private item to 'couple',
    // the minimum share, and leave the life area alone. 'couple' also keeps it
    // off the kitchen wall, which needs compound. Assigning to yourself needs
    // no share at all and changes nothing.
    if ('assignedTo' in updates && updates.assignedTo && !('scope' in updates)) {
      const assignee = familyMembers.find(m => m.id === updates.assignedTo)
      const isSelf = updates.assignedTo === getCurrentUserMember()?.id
      // Where the row's scope lands on its own. A context set in this same
      // update carries its own coupling (family -> compound), and that wins —
      // only step in when nothing else shared the row.
      const scopeWithoutUs = 'context' in updates
        ? scopeForContextChange(task.context, updates.context, task.scope) ?? task.scope
        : task.scope
      if (assignee && !isSelf && scopeWithoutUs === 'individual') {
        logger.debug('[updateTask] Sharing with assignee (scope -> couple)')
        updates = { ...updates, scope: 'couple' }
        showToast(`Shared with ${assignee.name}`, 'info', 2500)
      }
    }

    // Invariant: bucket 'timed' requires a scheduled date (the timed pool only
    // shows tasks with a date; the inbox pool only shows bucket 'inbox'). A
    // clear-date update would otherwise strand the task invisible until a
    // refetch — send it back to the inbox instead.
    if (
      'scheduledFor' in updates && !updates.scheduledFor &&
      (updates.bucket === 'timed' || (!('bucket' in updates) && task.bucket === 'timed'))
    ) {
      updates = { ...updates, bucket: 'inbox', isAllDay: false }
    }
    // Inverse invariant: a scheduled date implies bucket 'timed' (types/task.ts
    // documents scheduledFor as "only set when bucket='timed'"). A caller that
    // sets a date without flipping the bucket would leave the task dated but
    // absent from every day view.
    if ('scheduledFor' in updates && updates.scheduledFor && !('bucket' in updates) && task.bucket !== 'timed') {
      updates = { ...updates, bucket: 'timed' }
    }

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
      setTasks((prev) =>
        prev.map((t) =>
          t.id === parent?.id
            ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === id ? { ...s, ...updates } : s) }
            : t
        )
      )
    } else {
      setTasks((prev) =>
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
    if ('completed' in updates) dbUpdates.completed = updates.completed
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
    // Scope follows area unless explicitly set (default-coupling). This used to
    // run one way only — family made a row compound and nothing ever walked it
    // back — which leaked: re-tagging a shared household task as `personal`
    // left scope='compound', so a partner kept read access to items every
    // surface now called private. scopeForContextChange applies both halves and
    // leaves a deliberately-chosen scope (e.g. `couple`) alone.
    if ('scope' in updates) dbUpdates.scope = updates.scope ?? 'individual'
    else if ('context' in updates) {
      const nextScope = scopeForContextChange(task.context, updates.context, task.scope)
      if (nextScope) dbUpdates.scope = nextScope
    }
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
    if ('sourceId' in updates) dbUpdates.source_id = updates.sourceId ?? null
    if ('goalId' in updates) dbUpdates.goal_id = updates.goalId ?? null
    if ('isFun' in updates) dbUpdates.is_fun = updates.isFun ?? false
    if ('weekDeferredAt' in updates) dbUpdates.week_deferred_at = updates.weekDeferredAt?.toISOString() ?? null
    // `week_start` is a DATE column — localYmd, not toISOString (which shifts the day west of Greenwich).
    if ('weekStart' in updates) dbUpdates.week_start = updates.weekStart ? localYmd(updates.weekStart) : null
    if ('pickedAt' in updates) dbUpdates.picked_at = updates.pickedAt?.toISOString() ?? null
    if ('sortOrder' in updates) dbUpdates.sort_order = updates.sortOrder ?? null

    logger.debug('[updateTask] Sending to DB:', { id, dbUpdates })
    const { data, error: updateError, status, count } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', id)
      .select()

    logger.debug('[updateTask] DB response:', { data, status, count, error: updateError?.message })

    if (updateError) {
      console.error('[updateTask] DB error:', updateError.message)
      showToast('Failed to update task', 'error', 3000)
      // Rollback on error — handle subtasks correctly
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
    } else if (data && data.length > 0) {
      logger.debug('[updateTask] DB update successful, returned notes:', (data[0] as DbTask).notes)
      // Fan out to other instances. Announce the merged LOCAL object, not the
      // returned flat row — a parent's nested subtasks must survive the swap.
      announceLocalWrite({ kind: 'update', task: { ...task, ...updates } })
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
  }, [tasks, familyMembers, getCurrentUserMember, findTaskById, findParentOfSubtask])

  // Bulk update multiple tasks at once
  const updateTasksBulk = useCallback(async (taskIds: string[], updates: Partial<Task>) => {
    if (taskIds.length === 0) return

    logger.debug('[updateTasksBulk] Called with:', { taskIds, updates })

    // Same schedule/bucket invariants as updateTask (see comments there).
    if (updates.bucket === 'timed' && 'scheduledFor' in updates && !updates.scheduledFor) {
      updates = { ...updates, bucket: 'inbox', isAllDay: false }
    }
    if ('scheduledFor' in updates && updates.scheduledFor && !('bucket' in updates)) {
      updates = { ...updates, bucket: 'timed' }
    }

    // Save original tasks for rollback
    const tasksToUpdate = tasks.filter(t => taskIds.includes(t.id))
    const rollbackMap = new Map(tasksToUpdate.map(t => [t.id, { ...t }]))

    logger.debug('[updateTasksBulk] Tasks to update:', tasksToUpdate.length)

    // Optimistic update
    setTasks(prev => prev.map(t =>
      taskIds.includes(t.id) ? { ...t, ...updates } : t
    ))

    // Convert Task updates to DB format (same logic as updateTask)
    const dbUpdates: Record<string, unknown> = {}
    if ('title' in updates) dbUpdates.title = updates.title
    if ('completed' in updates) dbUpdates.completed = updates.completed
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
    // Scope follows area unless explicitly set (default-coupling). Bulk writes
    // one payload for many rows, so the per-row unshare (see updateTask) can't
    // be expressed here — a second, narrower update below handles it.
    if ('scope' in updates) dbUpdates.scope = updates.scope ?? 'individual'
    else if ('context' in updates && updates.context === 'family') dbUpdates.scope = 'compound'
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
    if ('sourceId' in updates) dbUpdates.source_id = updates.sourceId ?? null
    if ('goalId' in updates) dbUpdates.goal_id = updates.goalId ?? null
    if ('isFun' in updates) dbUpdates.is_fun = updates.isFun ?? false
    if ('weekDeferredAt' in updates) dbUpdates.week_deferred_at = updates.weekDeferredAt?.toISOString() ?? null
    // `week_start` is a DATE column — localYmd, not toISOString (which shifts the day west of Greenwich).
    if ('weekStart' in updates) dbUpdates.week_start = updates.weekStart ? localYmd(updates.weekStart) : null
    if ('pickedAt' in updates) dbUpdates.picked_at = updates.pickedAt?.toISOString() ?? null
    if ('sortOrder' in updates) dbUpdates.sort_order = updates.sortOrder ?? null

    logger.debug('[updateTasksBulk] Sending to DB:', { taskIds, dbUpdates })

    // Bulk update with .in()
    const { error: updateError } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .in('id', taskIds)

    logger.debug('[updateTasksBulk] DB response:', { error: updateError?.message })

    if (updateError) {
      console.error('[updateTasksBulk] DB error:', updateError.message)
      // Rollback all tasks
      setTasks(prev => prev.map(t => rollbackMap.get(t.id) || t))
      setError(updateError.message)
      showToast('Failed to update tasks', 'error', 4000)
      throw updateError
    }

    // The unshare half of the coupling, which one bulk payload can't express:
    // only the rows that were family+compound lose the share, and only when
    // the new area is a private one. Bulk-tagging a mixed selection `personal`
    // otherwise leaves the previously-family rows readable by the household.
    if (!('scope' in updates) && 'context' in updates && updates.context !== 'family') {
      const toUnshare = tasksToUpdate
        .filter((t) => scopeForContextChange(t.context, updates.context, t.scope) === 'individual')
        .map((t) => t.id)
      if (toUnshare.length > 0) {
        const { error: unshareError } = await supabase
          .from('tasks')
          .update({ scope: 'individual' })
          .in('id', toUnshare)
        if (unshareError) {
          // The area change already landed; report rather than roll back, so a
          // still-shared row is visible instead of silent.
          console.error('[updateTasksBulk] unshare failed:', unshareError.message)
          showToast('Updated, but some items may still be shared', 'error', 4000)
        }
      }
    }

    for (const t of tasksToUpdate) {
      announceLocalWrite({ kind: 'update', task: { ...t, ...updates } })
    }
  }, [tasks])

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
  const scheduleTask = useCallback(async (id: string, date: Date, isAllDay?: boolean) => {
    await updateTask(id, {
      bucket: 'timed',
      scheduledFor: date,
      isAllDay: isAllDay ?? true,
    })
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
      // Move to pool — clear scheduled date, and settle the week (see setBucket:
      // "to the week" means THIS week; every other bucket has no week at all).
      await updateTask(id, {
        bucket: target,
        scheduledFor: undefined,
        weekStart: weekStartForBucket(target, currentWeekStart()),
        deferCount,
      })
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
    updates.weekStart = weekStartForBucket(bucket, currentWeekStart())
    await updateTask(id, updates)
  }, [updateTask])

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

  return { tasks, loading, error, refetch, addTask, addSubtask, addPrepTask, getPrepTasks, getLinkedTasks, toggleTask, toggleWaiting, deleteTask, updateTask, updateTasksBulk, updateTaskOrders, scheduleTask, pushTask, setBucket }
}
