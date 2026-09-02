import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useAuth } from '@/hooks/useAuth'
import { resolveRoutine, effectiveTimeOfDay, type LastCompletionMap } from '@/lib/routineUtils'
import type { Layer } from '@/lib/domains'
import {
  taskToTimelineItem,
  eventToTimelineItem,
  routineToTimelineItem,
} from '@/types/timeline'
import { groupByDaySection, type DaySection } from '@/lib/timeUtils'
import { isQuietHours } from '@/lib/quietHours'
import { graceFloor } from '@/lib/today/taskPools'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { addDays } from '@/lib/dateUtils'
import { resolveFetchOutcome } from '@/hooks/wallDataCommit'
import { instanceKey, seriesKey } from '@/lib/today/eventFree'
import { computeScreenTimeSummaries, type ChildScreenTimeSummary } from '@/hooks/useScreenTime'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

export const WALL_POLL_INTERVAL_MS = 12 * 60 * 1000 // 12 minutes — wall is glanceable, not live

// The wall shows only the Family layer — it has no domain-lens UI of its own
// (see resolveRoutine's rung 4 call below).
const FAMILY_LAYER: ReadonlySet<Layer> = new Set(['family'])

// Only the columns the wall actually renders. Avoids `select('*')`, which pulls
// heavy/unused columns (links jsonb, codes, etc.) on every poll and dominates egress.
const TASK_COLUMNS =
  'id, title, completed, created_at, updated_at, scheduled_for, needed_on, is_all_day, is_waiting, context, category, notes, phone_number, contact_id, assigned_to, project_id, parent_task_id, location, location_place_id'

/** One snake_case → Task mapper for every task query on the wall, so a column
 *  added to TASK_COLUMNS can't reach one list and silently miss another. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTask(t: any): Task {
  return {
    id: t.id,
    title: t.title,
    completed: t.completed,
    createdAt: new Date(t.created_at),
    updatedAt: new Date(t.updated_at),
    scheduledFor: t.scheduled_for ? new Date(t.scheduled_for) : undefined,
    // `needed_on` is a DATE column — parse it as a local day, never `new
    // Date(str)` (which reads it as UTC midnight and can land yesterday).
    neededOn: t.needed_on ? parseLocalYmd(t.needed_on) : undefined,
    isAllDay: t.is_all_day ?? undefined,
    isWaiting: t.is_waiting ?? undefined,
    context: t.context ?? null,
    category: t.category ?? 'task',
    notes: t.notes ?? undefined,
    phoneNumber: t.phone_number ?? undefined,
    contactId: t.contact_id ?? undefined,
    assignedTo: t.assigned_to ?? undefined,
    projectId: t.project_id ?? undefined,
    parentTaskId: t.parent_task_id ?? undefined,
    location: t.location ?? undefined,
    locationPlaceId: t.location_place_id ?? undefined,
  }
}

export interface BirthdayItem {
  name: string
  date: Date
}

export interface MilestoneItem {
  goalName: string
  title: string
  date: Date
}

export interface WallDayData {
  date: Date
  isToday: boolean
  items: Record<DaySection, TimelineItem[]>
  birthdays: BirthdayItem[]
  milestones: MilestoneItem[]
}

export interface UseWallDataReturn {
  days: WallDayData[]
  familyMembers: FamilyMember[]
  calendarEvents: CalendarEvent[]
  /** True when the calendar fetch failed (not merely empty) — surface a reconnect hint. */
  calendarUnavailable: boolean
  screenTimeSummaries: ChildScreenTimeSummary[]
  overdueTasks: TimelineItem[]
  /** Raw Task[] for surfaces (e.g. WallNow) that need real Task shape, not TimelineItem. */
  tasks: Task[]
  /**
   * Incomplete tasks marked `needed_on` today or tomorrow. A SEPARATE query,
   * not a slice of `tasks`: a needed-on row (a school-email subtask, say) has
   * no `scheduled_for`, so the date-ranged task query above cannot see it and
   * it never becomes a timeline item. Consumed by the kid day view's
   * "Needed today" card.
   */
  neededTasks: Task[]
  /**
   * Raw fetched routine rows — BEFORE the wall's effectiveTimeOfDay remap
   * (a Step's time_of_day stays null here, not filled from its collection
   * parent) and before the two shallow overrides applied at the dayRoutines
   * call site. For consumers (e.g. a per-member wall page) that need to
   * resolve parents/steps themselves rather than consume the wall's own
   * derived days[].items. Committed alongside `days`/`tasks` (gated behind
   * the same commitData check) so a failed poll freezes this array too,
   * instead of a consumer joining it against a frozen `days[].items` seeing
   * ids that resolve against a wiped-out routines list.
   */
  routines: Routine[]
  loading: boolean
  error: string | null
  lastRefresh: Date | null
  refetch: () => Promise<void>
}

function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDateRange(): { startDate: Date; endDate: Date; dates: Date[] } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dates: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    dates.push(d)
  }

  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + 6)
  endDate.setHours(23, 59, 59, 999)

  return { startDate: today, endDate, dates }
}

export function useWallData(): UseWallDataReturn {
  const { user } = useAuth()
  const { isConnected, fetchEvents } = useGoogleCalendar()

  const [days, setDays] = useState<WallDayData[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [calendarEventsState, setCalendarEventsState] = useState<CalendarEvent[]>([])
  const [calendarUnavailable, setCalendarUnavailable] = useState(false)
  const [screenTimeSummaries, setScreenTimeSummaries] = useState<ChildScreenTimeSummary[]>([])
  const [overdueTasks, setOverdueTasks] = useState<TimelineItem[]>([])
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [neededTasks, setNeededTasks] = useState<Task[]>([])
  const [rawRoutines, setRawRoutines] = useState<Routine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const mountedRef = useRef(true)
  // Tracked in a ref, not read from `days`, so fetchAllData keeps a stable identity
  // and the poll interval isn't torn down and rebuilt on every data change.
  const hasRenderedDataRef = useRef(false)

  const fetchAllData = useCallback(async () => {
    if (!user) return

    try {
      // Track whether the calendar fetch *failed* (vs genuinely returned no events),
      // so the wall can surface a "calendar unavailable" state instead of silently
      // showing an empty schedule (which masked a rotted kiosk session, 2026-06-17).
      let calendarFailed = false
      const { startDate, endDate, dates } = getDateRange()
      const startStr = toDateString(startDate)
      const endStr = toDateString(dates[6])
      const todayStr = toDateString(new Date())
      // Expiry floor — mirrors Today's grace window so the wall and the laptop
      // agree. Without it the wall pulled every past-dated family task ever
      // created; on 2026-08-03 that was 50 rows, the oldest 245 days old.
      const overdueFloor = graceFloor(startDate)

      // Fetch all data sources in parallel
      const [
        membersRes,
        tasksRes,
        routinesRes,
        instancesRes,
        contactsRes,
        milestonesRes,
        calendarEvents,
        stBudgetsRes,
        stEntriesRes,
        stAdjustmentsRes,
        overdueRes,
        routineCompletionsRes,
        neededRes,
        freeEventNotesRes,
      ] = await Promise.all([
        // 1. Family members
        supabase.from('family_members').select('*').order('display_order'),

        // 2. Tasks in date range (family only for kiosk)
        supabase
          .from('tasks')
          .select(TASK_COLUMNS)
          .gte('scheduled_for', startDate.toISOString())
          .lte('scheduled_for', endDate.toISOString())
          .eq('context', 'family'),

        // 3. Routines. Deliberately NOT filtered to visibility 'active' in
        // SQL: a routine collection is 'reference' (it never renders itself)
        // but it carries the hour its Steps happen at, and without the parent
        // row every Step looks untimed. Filtered to active below, after the
        // parent times have been read off. 17 extra rows on this household.
        supabase
          .from('routines')
          .select('*'),

        // 4. Actionable instances for date range
        supabase
          .from('actionable_instances')
          .select('*')
          .gte('date', startStr)
          .lte('date', endStr),

        // 5. Contacts with birthdays
        supabase
          .from('contacts')
          .select('id, name, birthday')
          .not('birthday', 'is', null),

        // 6. Goal milestones in date range
        supabase
          .from('goal_milestones')
          .select('id, title, target_date, status, goal_id, goals!inner(name)')
          .gte('target_date', startStr)
          .lte('target_date', endStr)
          .in('status', ['pending', 'in_progress']),

        // 7. Calendar events (family calendars only for kiosk — excludes work)
        isConnected
          ? fetchEvents(startDate, endDate, 'family').catch(() => {
              calendarFailed = true
              return [] as CalendarEvent[]
            })
          : Promise.resolve([] as CalendarEvent[]),

        // 8–10. Screen time data (today only)
        supabase.from('screen_time_budgets').select('*'),
        supabase.from('screen_time_entries').select('*').eq('date', todayStr),
        supabase.from('screen_time_adjustments').select('*').eq('date', todayStr),

        // 11. Overdue tasks (scheduled before today, not completed, family only)
        supabase
          .from('tasks')
          .select(TASK_COLUMNS)
          .lt('scheduled_for', startDate.toISOString())
          .gte('scheduled_for', overdueFloor.toISOString())
          .eq('completed', false)
          .eq('context', 'family'),

        // (An inbox-count query used to sit here. It filtered on `is_someday`,
        //  a column that no longer exists — someday is `bucket = 'someday'`
        //  now — so it returned 400 on EVERY poll. Nothing consumed the count
        //  (ShellLayout and TodayView each derive their own from `bucket`),
        //  but it was in the dataError reduction below, so its failure fed a
        //  permanent error into the freshness signal. Deleted rather than
        //  repaired: a query nobody reads shouldn't cost the wall egress.)

        // 12. Most-recent completion per routine (no date filter — needed
        // for 'since_last' recurrence which depends on history beyond the
        // 7-day wall window).
        supabase
          .from('actionable_instances')
          .select('entity_id, date')
          .eq('entity_type', 'routine')
          .eq('status', 'completed')
          .order('date', { ascending: false }),

        // 13. Needed-on tasks for today and tomorrow. Query 2 is ranged on
        // `scheduled_for` and a needed-on row has none, so these would be
        // invisible to the wall without their own read. Two days, never a
        // range: the evening "tomorrow" rule lives in neededWindow, and this
        // query only has to make sure the rows are in hand when it fires.
        supabase
          .from('tasks')
          .select(TASK_COLUMNS)
          .eq('completed', false)
          .eq('context', 'family')
          .in('needed_on', [todayStr, localYmd(addDays(new Date(), 1))]),

        // 14. "Free" events (informational-only — no prep/handoff). event_notes
        // is shared within the household, so this reads every member's flags,
        // not just the kiosk account's own. A recurring series' flag lives on a
        // note keyed by recurring_event_id, so this key can be an instance OR a
        // series id — resolved below alongside the instance id per event.
        supabase.from('event_notes').select('google_event_id').eq('is_free', true),
      ])

      if (!mountedRef.current) return

      // Surface per-query failures. PostgREST returns { data, error } rather than
      // throwing, so a failed query would otherwise become silent empty data and
      // the wall would render a partial schedule with no indication anything broke.
      // We still render whatever data did arrive (graceful degradation) but set the
      // error so the already-rendered banner tells the family the wall is stale.
      const dataError = [
        membersRes, tasksRes, routinesRes, instancesRes, contactsRes,
        milestonesRes, stBudgetsRes, stEntriesRes, stAdjustmentsRes,
        overdueRes, routineCompletionsRes, neededRes, freeEventNotesRes,
      ].find((r) => r.error)?.error?.message ?? null

      const members = (membersRes.data || []) as FamilyMember[]
      setFamilyMembers(members)

      // Transform snake_case DB rows to camelCase Task objects
      const tasks: Task[] = (tasksRes.data || []).map(rowToTask)
      const needed: Task[] = (neededRes.data || []).map(rowToTask)

      // Every routine row, keyed by id — the lookup a Step uses to find the
      // hour on its collection. Built before any filtering, because a parent
      // is typically 'reference' and may carry a different context than its
      // Steps ("After camp routine" is context null, its Steps are family).
      const allRoutines = (routinesRes.data || []) as Routine[]
      const routinesById = new Map(allRoutines.map(r => [r.id, r]))
      const routines = allRoutines
        .map(r => ({ ...r, time_of_day: effectiveTimeOfDay(r, routinesById) }))
      const instances = (instancesRes.data || []) as ActionableInstance[]
      const events = (calendarEvents || []) as CalendarEvent[]
      const contacts = (contactsRes.data || []) as { id: string; name: string; birthday: string }[]

      // "Free" flags — a key can be an instance id OR a series (recurring_event_id) id.
      const freeKeys = new Set(
        ((freeEventNotesRes.data || []) as { google_event_id: string }[]).map((r) => r.google_event_id),
      )

      // Supabase !inner join returns goals as object or array depending on version
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const milestones = (milestonesRes.data || []).map((m: any) => ({
        id: m.id as string,
        title: m.title as string,
        target_date: m.target_date as string,
        goalName: Array.isArray(m.goals) ? m.goals[0]?.name : m.goals?.name || 'Goal',
      }))

      // Build instance lookup: entityId+date → instance
      const instanceMap = new Map<string, ActionableInstance>()
      for (const inst of instances) {
        instanceMap.set(`${inst.entity_id}:${inst.date}`, inst)
      }

      // Build last-completion map for 'since_last' recurrence. Rows are sorted
      // desc by date in the query, so first-seen-wins gives the most recent.
      const lastCompletionByRoutine: LastCompletionMap = new Map()
      for (const row of (routineCompletionsRes.data || []) as Array<{ entity_id: string; date: string }>) {
        if (lastCompletionByRoutine.has(row.entity_id)) continue
        const d = new Date(row.date)
        if (!isNaN(d.getTime())) lastCompletionByRoutine.set(row.entity_id, d)
      }

      // Build per-day data
      const wallDays: WallDayData[] = dates.map(date => {
        const dateStr = toDateString(date)
        const isToday = dateStr === todayStr

        // Filter tasks for this day
        const dayTasks = tasks.filter(t => {
          if (!t.scheduledFor) return false
          return toDateString(new Date(t.scheduledFor)) === dateStr
        })

        // Get routines for this day. Two overrides at this ONE call site,
        // both TEMPORARY:
        //  - show_on_timeline: true — the kids' morning and bedtime routines
        //    use that flag as a Today-declutter workaround, so honouring it
        //    here would delete them from the wall. Comes out with the
        //    show_on_timeline data audit — see
        //    docs/superpowers/specs/assets/2026-08-26-show-on-timeline-audit.md
        //  - parent_routine_id: null — days[].items still needs to carry
        //    routine Steps for the board's own downstream filters
        //    (wallGantt.itemsFor, wallV2Adapter.dedupeRoutines), which
        //    already de-dupe/collapse them there; filtering here too buys
        //    nothing and costs those two screens. (The original kid-checklist
        //    consumer this override was written for — a pair of retired
        //    per-ritual kiosk routes that read Steps off days[].items via an
        //    assignedTo filter — has since been replaced by KidDayView,
        //    which reads collections directly off the raw `routines` array
        //    instead. KidDayView only reads days[].items for plain assigned
        //    tasks, filtering out
        //    routine-type items, so it no longer depends on this override.)
        const dayRoutines = routines.filter(
          (r) =>
            resolveRoutine(
              { ...r, show_on_timeline: true, parent_routine_id: null },
              {
                date,
                prefs: { hideRoutines: false, layers: FAMILY_LAYER },
                lastCompletedAt: lastCompletionByRoutine.get(r.id) ?? null,
              },
            ).shows,
        )

        // Filter events for this day
        const dayEvents = events.filter(event => {
          const startStr = event.start_time || event.startTime
          if (!startStr) return false
          const eventDate = new Date(startStr)
          return toDateString(eventDate) === dateStr
        })

        // Convert to timeline items
        const taskItems = dayTasks.map(taskToTimelineItem)
        const eventItems = dayEvents.map(eventToTimelineItem)
        const routineItems = dayRoutines.map(r => {
          const item = routineToTimelineItem(r, date)
          const inst = instanceMap.get(`${r.id}:${dateStr}`)
          if (inst) {
            item.completed = inst.status === 'completed'
            item.skipped = inst.status === 'skipped'
          }
          return item
        })

        // Apply instance status to events
        for (const item of eventItems) {
          if (item.originalEvent) {
            const eventId = item.originalEvent.google_event_id || item.originalEvent.id
            const inst = instanceMap.get(`${eventId}:${dateStr}`)
            if (inst) {
              item.completed = inst.status === 'completed'
              item.skipped = inst.status === 'skipped'
            }
            // "Free" resolves instance-then-series, same precedence as Today.
            const ev = item.originalEvent
            const series = seriesKey(ev)
            item.isFree = freeKeys.has(instanceKey(ev)) || (series ? freeKeys.has(series) : false)
          }
        }

        // Combine and group (filter out skipped items)
        const allItems = [...taskItems, ...eventItems, ...routineItems]
          .filter(item => !item.skipped)
        const grouped = groupByDaySection(allItems)

        // Find birthdays for this day (match month+day)
        const dayBirthdays: BirthdayItem[] = contacts
          .filter(c => {
            if (!c.birthday) return false
            const bday = new Date(c.birthday + 'T00:00:00')
            return bday.getMonth() === date.getMonth() && bday.getDate() === date.getDate()
          })
          .map(c => ({ name: c.name, date }))

        // Find milestones for this day
        const dayMilestones: MilestoneItem[] = milestones
          .filter(m => m.target_date === dateStr)
          .map(m => ({
            goalName: m.goalName,
            title: m.title,
            date,
          }))

        return {
          date,
          isToday,
          items: grouped,
          birthdays: dayBirthdays,
          milestones: dayMilestones,
        }
      })

      // Compute screen time summaries for today
      const stSummaries = computeScreenTimeSummaries(
        stBudgetsRes.data || [],
        stEntriesRes.data || [],
        stAdjustmentsRes.data || [],
        members,
        todayStr,
      )

      // Transform overdue tasks to timeline items
      const overdueItems: TimelineItem[] = (overdueRes.data || []).map((t) => taskToTimelineItem(rowToTask(t)))

      // Sort overdue by scheduled date (most recent first)
      overdueItems.sort((a, b) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0
        return bTime - aTime
      })

      if (mountedRef.current) {
        // A failed fetch used to blank the wall (every failed query yields
        // `data: null`, which collapsed to empty arrays) *and* still advance the
        // refresh clock — so the kiosk showed nothing while reporting itself
        // freshly updated. Keep the last good render and freeze the clock instead.
        const { commitData, advanceLastRefresh } = resolveFetchOutcome({
          dataError,
          hasRenderedData: hasRenderedDataRef.current,
        })

        if (commitData) {
          hasRenderedDataRef.current = wallDays.length > 0
          setDays(wallDays)
          setCalendarEventsState(events)
          setScreenTimeSummaries(stSummaries)
          setOverdueTasks(overdueItems)
          setAllTasks(tasks)
          setNeededTasks(needed)
          setRawRoutines(allRoutines)
        }
        setCalendarUnavailable(calendarFailed)
        setError(dataError)
        if (advanceLastRefresh) setLastRefresh(new Date())
        setLoading(false)
      }
    } catch (err) {
      console.error('Wall data fetch error:', err)
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
        setLoading(false)
      }
    }
  }, [user, isConnected, fetchEvents])

  // Initial fetch + polling. Skip polls while the tab is hidden (backgrounded
  // laptop/phone tabs) to avoid needless egress; refetch immediately on return
  // so the view is fresh when someone comes back to it. The always-on wall TV
  // stays visible, so it keeps polling at the normal interval.
  useEffect(() => {
    mountedRef.current = true
    fetchAllData()

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      // The always-on wall never goes hidden; skip overnight polls to cut the
      // egress floor. Manual refresh + visibility-return below still refetch.
      if (isQuietHours()) return
      fetchAllData()
    }, WALL_POLL_INTERVAL_MS)

    const onVisibility = () => {
      if (!document.hidden) fetchAllData()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mountedRef.current = false
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchAllData])

  return { days, familyMembers, calendarEvents: calendarEventsState, calendarUnavailable, screenTimeSummaries, overdueTasks, tasks: allTasks, neededTasks, routines: rawRoutines, loading, error, lastRefresh, refetch: fetchAllData }
}
