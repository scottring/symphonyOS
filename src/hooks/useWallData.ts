import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useAuth } from '@/hooks/useAuth'
import { getRoutinesForDatePure } from '@/lib/routineUtils'
import {
  taskToTimelineItem,
  eventToTimelineItem,
  routineToTimelineItem,
} from '@/types/timeline'
import { groupByDaySection, type DaySection } from '@/lib/timeUtils'
import { computeScreenTimeSummaries, type ChildScreenTimeSummary } from '@/hooks/useScreenTime'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const POLL_INTERVAL_MS = 3 * 60 * 1000 // 3 minutes

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
  screenTimeSummaries: ChildScreenTimeSummary[]
  overdueTasks: TimelineItem[]
  inboxCount: number
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
  const [screenTimeSummaries, setScreenTimeSummaries] = useState<ChildScreenTimeSummary[]>([])
  const [overdueTasks, setOverdueTasks] = useState<TimelineItem[]>([])
  const [inboxCount, setInboxCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const mountedRef = useRef(true)

  const fetchAllData = useCallback(async () => {
    if (!user) return

    try {
      const { startDate, endDate, dates } = getDateRange()
      const startStr = toDateString(startDate)
      const endStr = toDateString(dates[6])
      const todayStr = toDateString(new Date())

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
        inboxCountRes,
      ] = await Promise.all([
        // 1. Family members
        supabase.from('family_members').select('*').order('display_order'),

        // 2. Tasks in date range (family context only for kiosk)
        supabase
          .from('tasks')
          .select('*')
          .gte('scheduled_for', startDate.toISOString())
          .lte('scheduled_for', endDate.toISOString())
          .eq('context', 'family'),

        // 3. Active routines
        supabase
          .from('routines')
          .select('*')
          .eq('visibility', 'active'),

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

        // 7. Calendar events (fetch ALL calendars for kiosk, no domain filtering)
        isConnected
          ? fetchEvents(startDate, endDate, 'all').catch(() => [] as CalendarEvent[])
          : Promise.resolve([] as CalendarEvent[]),

        // 8–10. Screen time data (today only)
        supabase.from('screen_time_budgets').select('*'),
        supabase.from('screen_time_entries').select('*').eq('date', todayStr),
        supabase.from('screen_time_adjustments').select('*').eq('date', todayStr),

        // 11. Overdue tasks (scheduled before today, not completed, family only)
        supabase
          .from('tasks')
          .select('*')
          .lt('scheduled_for', startDate.toISOString())
          .eq('completed', false)
          .eq('context', 'family'),

        // 12. Inbox count (unscheduled, not completed, not someday, family only)
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .is('scheduled_for', null)
          .eq('completed', false)
          .or('is_someday.is.null,is_someday.eq.false')
          .eq('context', 'family'),
      ])

      if (!mountedRef.current) return

      const members = (membersRes.data || []) as FamilyMember[]
      setFamilyMembers(members)

      // Transform snake_case DB rows to camelCase Task objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tasks: Task[] = (tasksRes.data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
        createdAt: new Date(t.created_at),
        updatedAt: new Date(t.updated_at),
        scheduledFor: t.scheduled_for ? new Date(t.scheduled_for) : undefined,
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
      }))

      const routines = ((routinesRes.data || []) as Routine[]).filter(r => r.context === 'family')
      const instances = (instancesRes.data || []) as ActionableInstance[]
      const events = (calendarEvents || []) as CalendarEvent[]
      const contacts = (contactsRes.data || []) as { id: string; name: string; birthday: string }[]

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

      // Build per-day data
      const wallDays: WallDayData[] = dates.map(date => {
        const dateStr = toDateString(date)
        const isToday = dateStr === todayStr

        // Filter tasks for this day
        const dayTasks = tasks.filter(t => {
          if (!t.scheduledFor) return false
          return toDateString(new Date(t.scheduledFor)) === dateStr
        })

        // Get routines for this day
        const dayRoutines = getRoutinesForDatePure(routines, date)
          .filter(r => r.show_on_timeline !== false)

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const overdueItems: TimelineItem[] = (overdueRes.data || []).map((t: any) => taskToTimelineItem({
        id: t.id,
        title: t.title,
        completed: t.completed,
        createdAt: new Date(t.created_at),
        updatedAt: new Date(t.updated_at),
        scheduledFor: t.scheduled_for ? new Date(t.scheduled_for) : undefined,
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
      }))

      // Sort overdue by scheduled date (most recent first)
      overdueItems.sort((a, b) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0
        return bTime - aTime
      })

      if (mountedRef.current) {
        setDays(wallDays)
        setCalendarEventsState(events)
        setScreenTimeSummaries(stSummaries)
        setOverdueTasks(overdueItems)
        setInboxCount(inboxCountRes.count ?? 0)
        setError(null)
        setLastRefresh(new Date())
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

  // Initial fetch + polling
  useEffect(() => {
    mountedRef.current = true
    fetchAllData()

    const interval = setInterval(fetchAllData, POLL_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [fetchAllData])

  return { days, familyMembers, calendarEvents: calendarEventsState, screenTimeSummaries, overdueTasks, inboxCount, loading, error, lastRefresh, refetch: fetchAllData }
}
