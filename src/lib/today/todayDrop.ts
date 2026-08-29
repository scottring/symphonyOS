import type { TimelineItem } from '@/types/timeline'
import type { GroupMemberRef, Task } from '@/types/task'
import type { DaySection } from '@/lib/timeUtils'
import { DAY_SECTION_BOUNDS } from '@/lib/timeUtils'
import { reorderTasksToIndex, type OrderWrite } from './taskOrdering'
import { wasWritten } from '@/hooks/useGatedTaskActions'

/**
 * Today's drop rules, as pure functions.
 *
 * The dnd-kit layer knows only how to report "this id was dropped on that id";
 * every decision — refusals, band times, reorder maths, grouping — lives here so
 * it can be tested without a DOM. That split is deliberate: the Stage 2a review
 * found that the one defect that mattered was invisible to both `tsc` and a
 * 4,000-test suite because it lived in an untestable seam.
 *
 * The drop-target vocabulary:
 *   today-band-<section>        → give the item a TIME (or make it all-day)
 *   today-gap-<section>:<index> → REORDER to that position
 *   today-row-<itemId>          → GROUP with that item
 *
 * A row cannot mean both "reorder here" and "group with me", so the gap decides.
 * The alternative — hovering a row for ~600ms to switch modes — needs a timer,
 * an extra visual state, and makes a slow drag do something unasked for.
 */

export const BAND_PREFIX = 'today-band-'
export const GAP_PREFIX = 'today-gap-'
export const ROW_PREFIX = 'today-row-'

/**
 * The name a drag-created group starts with. It is a placeholder, not a guess:
 * the UI drops straight into an inline rename with this text selected, so the
 * first thing you type replaces it.
 */
export const NEW_GROUP_NAME = 'New Group'

export function bandDropId(section: DaySection): string {
  return `${BAND_PREFIX}${section}`
}
export function gapDropId(section: DaySection, index: number): string {
  return `${GAP_PREFIX}${section}:${index}`
}
export function rowDropId(itemId: string): string {
  return `${ROW_PREFIX}${itemId}`
}

export type DropIntent =
  | { kind: 'set-time'; itemId: string; when: Date }
  | { kind: 'make-all-day'; itemId: string }
  | { kind: 'reorder'; writes: OrderWrite[] }
  | {
      kind: 'create-group'
      groupName: string
      taskIds: string[]
      memberRefs: GroupMemberRef[]
      date: Date
      isAllDay: boolean
    }
  | {
      kind: 'add-to-group'
      wrapperId: string
      taskIds: string[]
      memberRefs: GroupMemberRef[]
      date: Date
      isAllDay: boolean
    }
  | { kind: 'remove-from-group'; taskId: string }
  | { kind: 'refuse'; reason: string }

export interface DropContext {
  activeId: string
  overId: string
  /** The RENDERED sections — what the user can see and aim at. */
  sections: Record<DaySection, TimelineItem[]>
  /**
   * Every untimed RAW task id in a section, including rows the domain or
   * assignee filter hides. Reorder must renormalise against this, not the
   * rendered subset: renormalising a subset resets it to 0…n×1000 while its
   * hidden siblings keep their old values and interleave on the next render
   * (Stage 2a residual 3).
   */
  fullOrderIds: Partial<Record<DaySection, string[]>>
  /** Raw task id → its current sortOrder. Keys match `fullOrderIds`. */
  orders: Map<string, number | null>
  viewedDate: Date
  isReadOnlyEvent: (item: TimelineItem) => boolean
  /** The wrapper's CURRENT group_members, read fresh at drop time (residual 4). */
  groupMembersOf: (wrapperRawId: string) => GroupMemberRef[]
}

/** Raw entity id for a timeline id (`task-abc` → `abc`, `routine-r1#2` → `r1#2`). */
function rawId(timelineId: string): string {
  const dash = timelineId.indexOf('-')
  return dash === -1 ? timelineId : timelineId.slice(dash + 1)
}

/** The bare routine id, dose suffix stripped (`r1#2` → `r1`). */
function bareRoutineId(timelineId: string): string {
  return rawId(timelineId).split('#')[0]
}

/**
 * Why this item cannot be dragged, or null if it can.
 *
 * Each of these would otherwise accept the gesture and then fail silently,
 * which is the worst outcome — the item springs back for no visible reason and
 * the user learns to distrust the whole surface.
 */
export function refusalFor(
  item: TimelineItem,
  isReadOnlyEvent: (i: TimelineItem) => boolean,
): string | null {
  if (String(item.id).startsWith('meal:')) {
    return 'Meals come from the meal plan — change it there.'
  }
  if (item.type === 'routine-collection') {
    return 'Open the routine to give its steps times.'
  }
  if (item.type === 'routine' && String(item.id).includes('#')) {
    // grouping.ts applies a deferred_to time override by BARE id only, so a
    // dosed step's override would silently land on the wrong dose.
    return 'This routine has more than one dose — set its times on the routine.'
  }
  if (item.type === 'event' && isReadOnlyEvent(item)) {
    return "That calendar is read-only — this event can't be moved here."
  }
  return null
}

/**
 * Where a drop onto a band lands. Band start when empty; otherwise straight
 * after whatever is already there — the same rule a gap drop uses, so there is
 * one rule rather than two. Never leaves its own band: a 20:45 item in Evening
 * must not push the next drop into Night.
 */
export function computeBandDropTime(
  section: DaySection,
  itemsInBand: TimelineItem[],
  viewedDate: Date,
): Date {
  const bound = DAY_SECTION_BOUNDS.find((b) => b.section === section)
  const start = new Date(viewedDate)
  start.setHours(bound ? bound.startHour : 8, 0, 0, 0)
  if (!bound) return start

  const cap = new Date(viewedDate)
  cap.setHours(bound.endHour, 30, 0, 0)

  let latest = start
  for (const it of itemsInBand) {
    const end = it.endTime ?? it.startTime
    if (end && new Date(end) > latest) latest = new Date(end)
  }
  return latest > cap ? cap : latest
}

/** Midnight on the given day, without mutating the input. */
function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/** The group_members ref for a non-task item, or null if it is a task. */
function memberRefFor(item: TimelineItem): GroupMemberRef | null {
  if (item.type === 'event') return { type: 'event', id: rawId(item.id) }
  if (item.type === 'routine') return { type: 'routine', id: bareRoutineId(item.id) }
  return null
}

function findItem(sections: Record<DaySection, TimelineItem[]>, id: string): TimelineItem | null {
  for (const list of Object.values(sections)) {
    const found = list.find((i) => i.id === id)
    if (found) return found
  }
  return null
}

/** Is any rendered row a child of this task? Then the task is already a group. */
function hasRenderedChildren(
  sections: Record<DaySection, TimelineItem[]>,
  wrapperRawId: string,
): boolean {
  for (const list of Object.values(sections)) {
    if (list.some((i) => i.isSubtask && i.parentTaskId === wrapperRawId)) return true
  }
  return false
}

function sectionOf(sections: Record<DaySection, TimelineItem[]>, id: string): DaySection | null {
  for (const key of Object.keys(sections) as DaySection[]) {
    if (sections[key].some((i) => i.id === id)) return key
  }
  return null
}

function parseBand(overId: string): DaySection | null {
  if (!overId.startsWith(BAND_PREFIX)) return null
  return overId.slice(BAND_PREFIX.length) as DaySection
}

function parseGap(overId: string): { section: DaySection; index: number } | null {
  if (!overId.startsWith(GAP_PREFIX)) return null
  const rest = overId.slice(GAP_PREFIX.length)
  const colon = rest.lastIndexOf(':')
  if (colon === -1) return null
  const index = Number(rest.slice(colon + 1))
  if (!Number.isFinite(index)) return null
  return { section: rest.slice(0, colon) as DaySection, index }
}

const TIMED = new Set<DaySection>(DAY_SECTION_BOUNDS.map((b) => b.section))

/** Resolve one drop into the writes it implies. An empty array means do nothing. */
export function resolveDrop(ctx: DropContext): DropIntent[] {
  const active = findItem(ctx.sections, ctx.activeId)
  if (!active) return []

  const refusal = refusalFor(active, ctx.isReadOnlyEvent)
  if (refusal) return [{ kind: 'refuse', reason: refusal }]

  const leavingGroup: DropIntent[] =
    active.isSubtask && active.parentTaskId && active.type === 'task'
      ? [{ kind: 'remove-from-group', taskId: rawId(active.id) }]
      : []

  // ── Band: give it a time ────────────────────────────────────────────────
  const band = parseBand(ctx.overId)
  if (band) {
    // Unscheduled holds routine instances with no time to write, so it is not a
    // target. Guarded here as well as by not registering the droppable.
    if (band === 'unscheduled') return []
    if (band === 'allday') return [...leavingGroup, { kind: 'make-all-day', itemId: active.id }]
    if (!TIMED.has(band)) return []
    return [
      ...leavingGroup,
      {
        kind: 'set-time',
        itemId: active.id,
        when: computeBandDropTime(band, ctx.sections[band] ?? [], ctx.viewedDate),
      },
    ]
  }

  // ── Gap: reorder (untimed) or retime (timed) ────────────────────────────
  const gap = parseGap(ctx.overId)
  if (gap) {
    if (TIMED.has(gap.section)) {
      // Reordering a timed item REWRITES its time, so vertical position keeps
      // meaning something. No cascade: untouched items keep their times.
      const before = (ctx.sections[gap.section] ?? [])
        .filter((i) => i.id !== active.id)
        .slice(0, gap.index)
      return [
        ...leavingGroup,
        {
          kind: 'set-time',
          itemId: active.id,
          when: computeBandDropTime(gap.section, before, ctx.viewedDate),
        },
      ]
    }
    if (gap.section === 'allday') {
      const ids = ctx.fullOrderIds.allday ?? (ctx.sections.allday ?? []).map((i) => rawId(i.id))
      const writes = reorderTasksToIndex(ids, rawId(active.id), gap.index, ctx.orders)
      return writes.length > 0 ? [{ kind: 'reorder', writes }] : []
    }
    return []
  }

  // ── Row: group ──────────────────────────────────────────────────────────
  if (ctx.overId.startsWith(ROW_PREFIX)) {
    const targetId = ctx.overId.slice(ROW_PREFIX.length)
    if (targetId === ctx.activeId) return []
    const target = findItem(ctx.sections, targetId)
    if (!target) return []
    // Grouping onto a refused item would reparent nothing and silently do half
    // the job, so refuse the pairing outright.
    if (refusalFor(target, ctx.isReadOnlyEvent)) return []

    const activeRef = memberRefFor(active)
    const activeTaskIds = active.type === 'task' ? [rawId(active.id)] : []
    const activeRefs = activeRef ? [activeRef] : []
    const isAllDay = sectionOf(ctx.sections, targetId) === 'allday'

    // The group inherits the TARGET's moment, never "now".
    //
    // `viewedDate` is a live `new Date()` — it carries the current wall-clock
    // time, not midnight. Passing it straight through stamped the group and
    // every member with the instant the drop happened: a 7:00 PM commitment
    // silently became 9:09 PM. Caught by dragging on :5173, on real data,
    // where it retimed an actual task.
    const groupDate = isAllDay
      ? startOfDay(ctx.viewedDate)
      : target.startTime
        ? new Date(target.startTime)
        : startOfDay(ctx.viewedDate)

    // Dropping onto a group that ALREADY exists joins it — never nests a second
    // group inside the first. That's true whether you aim at the group's own
    // header row or at one of its children.
    if (target.type === 'task') {
      const targetRawId = rawId(target.id)
      const isWrapper =
        (target.subtaskCount ?? 0) > 0 ||
        ctx.groupMembersOf(targetRawId).length > 0 ||
        // Rendered children are the authority: a wrapper whose subtasks are on
        // screen is a group whether or not the task carries a count.
        hasRenderedChildren(ctx.sections, targetRawId)
      const existingWrapperId = target.isSubtask && target.parentTaskId
        ? target.parentTaskId
        : isWrapper
          ? targetRawId
          : null
      if (existingWrapperId) {
        return [{
          kind: 'add-to-group',
          wrapperId: existingWrapperId,
          taskIds: activeTaskIds,
          memberRefs: activeRefs,
          date: groupDate,
          isAllDay,
        }]
      }
    }

    // Two loose cards become a NEW group holding both as peers.
    //
    // The wrapper is named neutrally on purpose. Naming it after the target put
    // the target's title on two rows at once — the wrapper and its own child —
    // which reads on screen as the dragged item duplicating and the target being
    // replaced (reported from real use). It is also the wrong claim: neither
    // card is the parent of the other, and the group is a thing you name.
    const targetTaskIds = target.type === 'task' ? [rawId(target.id)] : []
    const targetRef = target.type === 'task' ? null : memberRefFor(target)
    return [{
      kind: 'create-group',
      groupName: NEW_GROUP_NAME,
      taskIds: [...activeTaskIds, ...targetTaskIds],
      memberRefs: [...activeRefs, ...(targetRef ? [targetRef] : [])],
      date: groupDate,
      isAllDay,
    }]
  }

  return []
}

/**
 * Write a drop-intent's move (a 'set-time' or 'make-all-day' drag onto the
 * timeline), then register the undo ONLY if the write actually happened.
 *
 * `onUpdateTask` is the GATED handler: an Unsorted task's move first pops the
 * DomainGate dialog ("Where does this belong?"), and a cancelled gate
 * resolves `false` — nothing was written. Registering the undo (and the
 * "Moved · Undo" toast it drives) unconditionally, before/regardless of the
 * gate's answer, is exactly the bug this guards against: dragging an
 * Unsorted task claimed a move that never happened, and its undo would have
 * written stale "previous" values back over whatever the gate dialog
 * produced. Shared by TodayView's 'set-time' and 'make-all-day' applyIntents
 * branches so they can't diverge.
 */
export async function writeMoveAndRegisterUndo(
  onUpdateTask: ((id: string, u: Partial<Task>) => void | Promise<void | boolean>) | undefined,
  taskId: string,
  next: Partial<Task>,
  previous: Partial<Task> | undefined,
  message: string,
  registerUndo: ((message: string, undo: () => void) => void) | undefined,
): Promise<boolean> {
  const ok = await wasWritten(onUpdateTask?.(taskId, next))
  if (ok && previous) {
    registerUndo?.(message, () => { onUpdateTask?.(taskId, previous) })
  }
  return ok
}
