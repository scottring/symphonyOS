// Pure page model for a family member's wall day page. Turns raw routines,
// today's timeline items, and recent actionable-instance history into what
// a kid's day looks like: standalone routines banded by time-of-day,
// collections (parent + steps) rendered as their own titled cards, and
// assigned tasks bucketed by their timeline section.
//
// PURE: no React, no Supabase, no hidden clock reads — everything derives
// from the `date` and `now` arguments passed in (`date` is the day being
// rendered; `now` is the wall clock, which only the evening "needed
// tomorrow" rule reads).

import type { Routine, ActionableInstance, TargetUnit } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import type { DaySection } from '@/lib/timeUtils'
import type { FamilyMember } from '@/types/family'
import type { Layer } from '@/lib/domains'
import { resolveRoutine, routineOwners, effectiveTimeOfDay, matchesRecurrenceForDate } from '@/lib/routineUtils'
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { stepAppliesOnDate } from '@/lib/today/stepSchedule'
import { neededWindow } from '@/lib/today/neededToday'
import { isSameDay } from '@/lib/dateUtils'
import { homeworkDue, sortHomework, homeworkOwners } from '@/lib/wall/homeworkLabel'
import type { WallNotice } from '@/hooks/useWallData'
import { matchesName, titleForMember, hasPerPersonSegments } from '@/components/wall-v2/wallEventAttribution'

export type KidBandKey = 'morning' | 'afternoon' | 'evening' | 'anytime'

export interface KidRowTarget {
  amount: number
  unit: TargetUnit
  progress: number
  streak: number
}

export interface KidRow {
  entityType: 'routine' | 'task'
  id: string // raw entity uuid (no prefix)
  title: string
  done: boolean
  timeOfDay: string | null // 'HH:MM' or null
  target: KidRowTarget | null // null = plain checkbox row
}

export interface KidCollection {
  id: string
  title: string
  timeOfDay: string | null
  rows: KidRow[]
}

/** A row of the "Needed today" card — a task marked `needed_on`, which has no
 *  `scheduled_for` and so never reaches the timeline (or a band). */
export interface KidNeededRow {
  id: string // raw task uuid — the view prefixes it once for onToggleTask
  title: string
  /** True for the evening preview of the next day's needs. */
  tomorrow: boolean
}

/** A row of the "Homework" card — open homework assigned to this member,
 *  until it is checked off. Due label and order come from homeworkLabel,
 *  shared with the board, so the two can never disagree about "Fri". */
export interface KidHomeworkRow {
  id: string // raw task uuid — the view prefixes it once for onToggleTask
  title: string
  /** 'Today' | 'Tomorrow' | 'Fri' | 'Sep 9' | 'Late' | null when undated */
  due: string | null
  late: boolean
  /** Supporting detail (what the form is, the $12), or null. */
  notes: string | null
}

/** A row of the "From school" card. Information, never work. */
export interface KidNoticeRow {
  id: string
  text: string
  senderLabel: string | null
  receivedOn: Date
}

/** The day's school facts a kid actually asks about. */
export interface KidSchoolDay {
  /** "PE" — this kid's half of the Specials rotation, or null. */
  special: string | null
  /** The sentence in the rotation's description that names this kid: "Ella has PE — sneakers." */
  hint: string | null
  /** From the evening: tomorrow's special, so the bag gets packed. */
  tomorrowSpecial: string | null
  /** Who collects them and when. `who` null = nobody has claimed it yet. */
  pickup: { time: string; who: string | null } | null
}

export interface MemberDayModel {
  /** Rendered first, above the collections — today's needs, then tomorrow's. */
  needed: KidNeededRow[]
  /**
   * The reading target ("Read", 20 min), pulled out of the bands to be the
   * page's own card. Null when this member has no such routine.
   */
  reading: KidRow | null
  /** Today at school — null on a day with no school on the calendar. */
  school: KidSchoolDay | null
  homework: KidHomeworkRow[]
  notices: KidNoticeRow[]
  collections: KidCollection[]
  bands: Record<KidBandKey, KidRow[]>
  isEmpty: boolean
}

// The wall's no-lens domain settings, copied verbatim from useWallData.ts's
// resolveRoutine call site (only the hide-daily field differs — false here so
// everyday routines always show on this page). Rung 4 is a practical no-op:
// every routine reaching this page is already family-context.
const FAMILY_LAYER: ReadonlySet<Layer> = new Set(['family'])

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatHHMM(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Rule 4: null → anytime; hour < 12 → morning; hour < 17 → afternoon; else → evening. */
export function bandForTime(timeOfDay: string | null): KidBandKey {
  if (timeOfDay == null) return 'anytime'
  const hour = Number(timeOfDay.slice(0, 2))
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

/**
 * Rule 8: walk back day by day from `today` (capped at 30 days total,
 * including skipped days). A day where the routine doesn't recur
 * (`matchesRecurrenceForDate` false) is skipped — it neither counts nor
 * breaks the streak. A recurring day counts when its instance is "met"
 * (target routines: progress >= target_amount OR status === 'completed';
 * plain routines: status === 'completed'). Today itself counts if met, but
 * an unmet today is skipped rather than breaking the streak — the day isn't
 * over yet. The first unmet PAST recurring day ends the walk.
 */
export function streakFor(routine: Routine, history: ActionableInstance[], today: Date): number {
  const target = routine.target_amount ?? null
  let streak = 0
  for (let i = 0; i < 30; i++) {
    const day = new Date(today)
    day.setDate(day.getDate() - i)
    if (!matchesRecurrenceForDate(routine, day, null)) continue // non-recurring day: skip, don't break

    const dateStr = toDateStr(day)
    const dayInstance = history.find((h) => h.entity_id === routine.id && h.date === dateStr)
    const met =
      target != null
        ? (dayInstance?.progress ?? 0) >= target || dayInstance?.status === 'completed'
        : dayInstance?.status === 'completed'

    if (met) {
      streak += 1
      continue
    }
    if (i === 0) continue // today unmet: the day isn't over, doesn't break
    break // first unmet past recurring day ends the walk
  }
  return streak
}

function instanceFor(routineId: string, dateStr: string, history: ActionableInstance[]): ActionableInstance | undefined {
  return history.find((h) => h.entity_id === routineId && h.date === dateStr)
}

function buildRow(
  routine: Routine,
  byId: Map<string, Pick<Routine, 'id' | 'time_of_day'>>,
  date: Date,
  todayStr: string,
  history: ActionableInstance[],
): KidRow {
  const dayInstance = instanceFor(routine.id, todayStr, history)
  let target: KidRowTarget | null = null
  if (routine.target_amount != null && routine.target_unit != null) {
    target = {
      amount: routine.target_amount,
      unit: routine.target_unit,
      progress: dayInstance?.progress ?? 0,
      streak: streakFor(routine, history, date),
    }
  }
  return {
    entityType: 'routine',
    id: routine.id,
    title: routine.name,
    done: dayInstance?.status === 'completed',
    timeOfDay: effectiveTimeOfDay(routine, byId),
    target,
  }
}

/** Rule 5: which band a task's timeline section rolls into. */
function sectionBand(section: DaySection): KidBandKey {
  switch (section) {
    case 'allday':
    case 'unscheduled':
      return 'anytime'
    case 'earlyMorning':
    case 'morning':
      return 'morning'
    case 'afternoon':
      return 'afternoon'
    case 'evening':
    case 'night':
      return 'evening'
  }
}

export function buildMemberDayModel(input: {
  member: FamilyMember
  date: Date
  /** The wall clock. Only the evening "needed tomorrow" rule reads it. */
  now: Date
  routines: Routine[]
  todayItems: Record<DaySection, TimelineItem[]>
  /**
   * Incomplete tasks carrying a `needed_on` date. NOT timeline items — a
   * needed-on row has no `scheduled_for`, so it never appears in
   * `todayItems` and the wall fetches it with its own narrow query.
   */
  neededTasks: Task[]
  /** Open homework, any date (useWallData.homeworkTasks). Optional so
   *  callers that predate the card keep working. */
  homeworkTasks?: Task[]
  /** Standing info from school (useWallData.notices). */
  notices?: WallNotice[]
  /** Tomorrow's items, for the evening "tomorrow's special" line. */
  tomorrowItems?: Record<DaySection, TimelineItem[]>
  /** The roster, to name who is on a pickup. */
  members?: FamilyMember[]
  history: ActionableInstance[]
}): MemberDayModel {
  const { member, date, now, routines, todayItems, neededTasks, history } = input
  const homeworkTasks = input.homeworkTasks ?? []
  const noticeInput = input.notices ?? []
  const members = input.members ?? [member]
  const todayStr = toDateStr(date)
  const byId = new Map<string, Pick<Routine, 'id' | 'time_of_day'>>(routines.map((r) => [r.id, r]))

  const bands: Record<KidBandKey, KidRow[]> = { morning: [], afternoon: [], evening: [], anytime: [] }
  let reading: KidRow | null = null

  // Rules 1 + 2: loose (parentless) routines — membership by owner, then the
  // full resolver ladder with the show_on_timeline declutter-hack override.
  const { collections: rawCollections, standalone } = groupRoutineSteps(routines)
  for (const r of standalone) {
    if (!routineOwners(r).includes(member.id)) continue
    const resolution = resolveRoutine(
      { ...r, show_on_timeline: true },
      { date, member: [member.id], prefs: { hideRoutines: false, layers: FAMILY_LAYER } },
    )
    if (!resolution.shows) continue
    const row = buildRow(r, byId, date, todayStr, history)
    // The reading target is the page's own card, not a line in "Anytime".
    if (reading == null && isReadingTarget(r)) { reading = row; continue }
    bands[bandForTime(row.timeOfDay)].push(row)
  }

  // Rule 3: collections — parent owners + recurrence, parent visibility
  // check deliberately skipped (collection parents are 'reference' on
  // purpose), at least one step must apply today.
  const collections: KidCollection[] = []
  for (const c of rawCollections) {
    if (!routineOwners(c).includes(member.id)) continue
    if (!matchesRecurrenceForDate(c, date, null)) continue
    const applicableSteps = c.steps.filter((s) => s.visibility === 'active' && stepAppliesOnDate(s, date))
    if (applicableSteps.length === 0) continue
    collections.push({
      id: c.id,
      title: c.name,
      timeOfDay: c.time_of_day,
      rows: applicableSteps.map((s) => buildRow(s, byId, date, todayStr, history)),
    })
  }
  // Rule 4: collections are NOT banded — ordered by timeOfDay, nulls last.
  collections.sort((a, b) => {
    if (a.timeOfDay == null && b.timeOfDay == null) return 0
    if (a.timeOfDay == null) return 1
    if (b.timeOfDay == null) return -1
    return a.timeOfDay < b.timeOfDay ? -1 : a.timeOfDay > b.timeOfDay ? 1 : 0
  })

  // Rule 5: assigned tasks, banded by their timeline section. Never targets.
  for (const section of Object.keys(todayItems) as DaySection[]) {
    for (const item of todayItems[section]) {
      if (item.type !== 'task') continue
      if (item.assignedTo !== member.id) continue
      // The Homework card owns homework rows — one row per item on the page.
      if (item.category === 'homework') continue
      const row: KidRow = {
        entityType: 'task',
        // taskToTimelineItem prefixes the timeline id (`task-${task.id}`) —
        // strip it back off so KidRow.id honors its "raw entity uuid, no
        // prefix" contract for task rows too. The view re-prefixes once when
        // it calls onToggleTask.
        id: item.id.replace(/^task-/, ''),
        title: item.title,
        done: item.completed,
        timeOfDay: item.startTime ? formatHHMM(item.startTime) : null,
        target: null,
      }
      bands[sectionBand(section)].push(row)
    }
  }

  // Needed-on rows. The evening rule is NOT re-derived here — `neededWindow`
  // is the one place it lives, shared with the Needed Today note, so the wall
  // and the phone can never disagree about when tomorrow starts showing.
  const window = neededWindow(date, now)
  const neededOnDay = (t: Task, day: Date) => !!t.neededOn && isSameDay(t.neededOn, day)
  // Homework is excluded here too: a form due today is still the Homework
  // card's row, not a second one under "Needed today".
  const forMember = neededTasks.filter((t) => !t.completed && t.assignedTo === member.id && t.category !== 'homework')
  const needed: KidNeededRow[] = [
    ...forMember.filter((t) => neededOnDay(t, window.today)).map((t) => ({ id: t.id, title: t.title, tomorrow: false })),
    ...(window.tomorrow
      ? forMember
          .filter((t) => neededOnDay(t, window.tomorrow!))
          .map((t) => ({ id: t.id, title: t.title, tomorrow: true }))
      : []),
  ]

  // Homework: the card owns these rows. Owner, order and label all come from
  // homeworkLabel so the page and the board never disagree about whose it is
  // or about "Fri". A class-wide sheet is one row naming every child.
  const rosterIds = new Set(members.map((m) => m.id))
  const mine = homeworkTasks.filter((t) => !t.completed && homeworkOwners(t, rosterIds).includes(member.id))
  const homework: KidHomeworkRow[] = sortHomework(mine, now).map((t) => {
    const due = homeworkDue(t.neededOn, now)
    return { id: t.id, title: t.title, due: due.label, late: due.late, notes: t.notes?.trim() || null }
  })

  // Notices: addressed to this member or to everyone. Newest first. They are
  // information, not work, so they never count toward isEmpty.
  const notices: KidNoticeRow[] = noticeInput
    .filter((n) => n.familyMemberId === null || n.familyMemberId === member.id)
    .sort((a, b) => b.receivedOn.getTime() - a.receivedOn.getTime() || a.text.localeCompare(b.text))
    .map((n) => ({ id: n.id, text: n.text, senderLabel: n.senderLabel, receivedOn: n.receivedOn }))

  const school = buildSchoolDay(member, members, todayItems, input.tomorrowItems, now)

  // Rule 9. Reading and school are the page's furniture, not its list — a
  // kid with a reading target and nothing else still sees the card, but the
  // page is honest that the list is empty.
  const isEmpty =
    needed.length === 0 &&
    homework.length === 0 &&
    collections.length === 0 &&
    Object.values(bands).every((rows) => rows.length === 0)

  return { needed, reading, school, homework, notices, collections, bands, isEmpty }
}

/** A minutes target whose name is about reading: "Read", "Read 20 min", "Reading". */
export function isReadingTarget(r: Routine): boolean {
  return r.target_amount != null && r.target_unit === 'minutes' && /\bread(ing)?\b/i.test(r.name)
}

const SPECIALS = /^specials?\b/i
const PICKUP = /\bpick(s|ed)?[ -]?up\b/i

function clock(d: Date): string {
  const h24 = d.getHours()
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  const m = d.getMinutes()
  return `${h}${m ? ':' + String(m).padStart(2, '0') : ''}${h24 < 12 ? 'a' : 'p'}`
}

function allItems(items: Record<DaySection, TimelineItem[]> | undefined): TimelineItem[] {
  return items ? (Object.values(items) as TimelineItem[][]).flat() : []
}

/** This kid's special on a day: the rotation row split to their half. */
function specialFor(member: FamilyMember, members: FamilyMember[], items: TimelineItem[]): TimelineItem | null {
  return items.find((it) =>
    it.type === 'event' && it.allDay && (SPECIALS.test(it.title) || hasPerPersonSegments(it.title, members))
    && matchesName(it.title, member.name)) ?? null
}

/** The sentence of a description that names this kid. */
function sentenceNaming(text: string | undefined, name: string): string | null {
  if (!text) return null
  const first = name.trim().split(/\s+/)[0]
  const sentences = text.replace(/<[^>]+>/g, ' ').split(/(?<=[.!?])\s+|\n+/)
  const hit = sentences.map((x) => x.trim()).find((x) => x && matchesName(x, first))
  return hit ?? null
}

function buildSchoolDay(
  member: FamilyMember,
  members: FamilyMember[],
  todayItems: Record<DaySection, TimelineItem[]>,
  tomorrowItems: Record<DaySection, TimelineItem[]> | undefined,
  now: Date,
): KidSchoolDay | null {
  const today = allItems(todayItems)
  const rotation = specialFor(member, members, today)
  const special = rotation ? titleForMember(rotation.title, member.name) : null
  const hint = rotation ? sentenceNaming(rotation.googleDescription, member.name) : null

  // The pickup is a handoff about this kid: "Pick up Ella & Kaleb from FFG"
  // (claimed by a parent or not) or "Grampappa picks up Ella & Kaleb".
  const pickupItem = today
    .filter((it) => it.type === 'event' && !!it.startTime && !it.allDay && PICKUP.test(it.title) && matchesName(it.title, member.name))
    .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())[0]
  let pickup: KidSchoolDay['pickup'] = null
  if (pickupItem) {
    const assignee = pickupItem.assignedTo ? members.find((m) => m.id === pickupItem.assignedTo)?.name ?? null : null
    // "Grampappa picks up …" already says who.
    const named = assignee ?? pickupItem.title.match(/^([A-Z][\w'-]*)\s+picks?\s+up\b/)?.[1] ?? null
    pickup = { time: clock(pickupItem.startTime!), who: named }
  }

  const evening = now.getHours() >= 17
  const tomorrowRotation = evening ? specialFor(member, members, allItems(tomorrowItems)) : null
  const tomorrowSpecial = tomorrowRotation ? titleForMember(tomorrowRotation.title, member.name) : null

  if (!special && !pickup && !tomorrowSpecial) return null
  return { special, hint, tomorrowSpecial, pickup }
}
