// src/hooks/useHomeBearings.ts
//
// What Home (/overview) reads. Every list and number here goes through the
// same area filter (useDomain) and people filter (useAssigneeFilter) as the
// pages it links to, with the same selectors, so "October · five lines" here
// is the five lines on October's page in the same lens. Needs GoalsProvider
// above it (year goals live in the goals table).

import { useEffect, useMemo } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { usePlanningSession, monthToken, weekToken } from '@/hooks/usePlanningSession'
import { useGoalsContext } from '@/contexts/GoalsContext'
import { useGoogleCalendar, type CalendarEvent } from '@/hooks/useGoogleCalendar'
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings'
import { useEventNotes } from '@/hooks/useEventNotes'
import { useHiddenCalendarEvents } from '@/hooks/useHiddenCalendarEvents'
import { useDiscussionInbox } from '@/hooks/useDiscussionInbox'
import { ALL_LAYERS } from '@/lib/domains'
import { filterEventsForLayers, filterInboxTasksForLayers, filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { withDefaultEventAssignees } from '@/components/home/eventAssigneeDefaults'
import { dedupeCalendarEvents } from '@/lib/calendar/dedupeEvents'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { seasonToken } from '@/lib/cadence/seasons'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { isCurrentPeriod, periodBounds, selectPeriodTasks } from '@/lib/planning/periodPage'
import { closeOutCandidates, lineFate } from '@/lib/planning/v2/planV2'
import { weekListTasks } from '@/lib/planning/weekList'
import { linkedLine } from '@/lib/week/monthLinks'
import { count, numberWord, type BearingsFacts, type LevelFacts } from '@/lib/home/bearings'
import type { Task } from '@/types/task'
import type { InboxRow } from '@/lib/discussions/inbox'

const DAY = 86_400_000
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** A look-back is offered while the period it hands to is young (as the guide does). */
const REVIEW_WINDOW_DAYS = 14

export interface Rung {
  level: 'year' | 'season' | 'month' | 'week' | 'today'
  name: string
  /** "Reference · four intentions", "Not planned yet · three waiting". */
  status: string
  /** The rung asks for attention (an unplanned week). */
  attention: boolean
  /** One line from its list, to recognise it by. */
  sample: string | null
  to: string
}

export interface TodayRow { id: string; title: string; start: Date; end: Date }
export interface ChosenRow { id: string; title: string; forLine: string | null }

export interface HomeBearings {
  loaded: boolean
  facts: BearingsFacts
  rungs: Rung[]
  events: TodayRow[]
  allDay: string[]
  chosen: ChosenRow[]
  /** Discussions with something new for you, in the current lens. */
  discussions: InboxRow[]
  calendarConnected: boolean
  firstName: string | null
}

const eventStart = (e: CalendarEvent) => e.start_time ?? e.startTime
const eventEnd = (e: CalendarEvent) => e.end_time ?? e.endTime
const isAllDay = (e: CalendarEvent) => !!(e.all_day ?? e.allDay)
const sameDay = (a: Date | undefined, b: Date) => !!a && a.toDateString() === b.toDateString()
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function useHomeBearings(now: Date): HomeBearings {
  const { tasks, loading: tasksLoading } = useSupabaseTasks()
  const { layers } = useDomain()
  const { getCurrentUserMember } = useFamilyMembers()
  const me = getCurrentUserMember()
  const meId = me?.id ?? null
  const [selectedPeople] = useAssigneeFilter()
  const lens = useMemo(() => planPeopleLens(selectedPeople, meId), [selectedPeople, meId])
  const { seasons, loading: seasonsLoading } = useHouseholdSeasons()
  const { goals, loading: goalsLoading } = useGoalsContext()
  const wso = readCadenceConfig().weekStartsOn

  const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now])
  const dayKey = ymd(today)
  const weekStart = useMemo(() => weekStartAnchor(today, wso), [today, wso])
  const month = useMemo(() => periodBounds('month', today, seasons), [today, seasons])
  const season = useMemo(() => periodBounds('season', today, seasons), [today, seasons])

  const weekSession = usePlanningSession('weekly', weekToken(weekStart))
  const monthSession = usePlanningSession('monthly', monthToken(month.start))
  const seasonSession = usePlanningSession('seasonal', seasonToken(season.start, seasons))

  // ── Calendar: today's events, through the area and people filters Today uses.
  const { isConnected, events, fetchEvents } = useGoogleCalendar()
  useEffect(() => {
    if (!isConnected) return
    const start = new Date(`${dayKey}T00:00:00`)
    void fetchEvents(start, new Date(start.getTime() + DAY))
    // fetchEvents is stable per connection; the day key is the real input.
  }, [isConnected, dayKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const { getDomainForCalendar } = useCalendarDomainMappings()
  const { isHidden } = useHiddenCalendarEvents()
  const todaysEvents = useMemo(() => dedupeCalendarEvents(events.filter((e) => {
    const s = eventStart(e)
    if (!s) return false
    const start = new Date(s)
    const end = new Date(eventEnd(e) ?? s)
    // An all-day event's end date is exclusive; a timed one counts if any of it is today.
    if (isAllDay(e)) return ymd(start) === dayKey || (ymd(start) <= dayKey && dayKey < ymd(end))
    return sameDay(start, today) || (start < today && end > today)
  })), [events, dayKey, today])
  const eventIds = useMemo(() => todaysEvents.map((e) => e.google_event_id || e.id), [todaysEvents])
  const { notes: eventNotes } = useEventNotes(eventIds)
  const visibleEvents = useMemo(() => {
    const overrides = new Map<string, NonNullable<Task['context']>>()
    for (const [id, note] of eventNotes) if (note.context) overrides.set(id, note.context)
    const notes = withDefaultEventAssignees(eventNotes, todaysEvents, meId)
    const people = makeAssigneeFilter(selectedPeople)
    return filterEventsForLayers(todaysEvents, layers, { eventContextOverrides: overrides, getDomainForCalendar, eventNotesMap: eventNotes })
      .filter((e) => !isHidden(e.google_event_id || e.id))
      .filter((e) => {
        if (selectedPeople.length === 0) return true
        const note = notes.get(e.google_event_id || e.id)
        return people(note?.assignedTo, note?.assignedToAll)
      })
  }, [todaysEvents, eventNotes, meId, selectedPeople, layers, getDomainForCalendar, isHidden])

  // ── Tasks, in the area lens, then the people lens.
  const layered = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])
  const inbox = useMemo(
    () => filterInboxTasksForLayers(tasks, layers).filter((t) => t.bucket === 'inbox' && !t.completed).length,
    [tasks, layers],
  )

  const level = (lvl: 'month' | 'season', b: typeof month, planned: boolean): LevelFacts & { lines: Task[] } => {
    const lines = selectPeriodTasks(layered, lvl, b.start, isCurrentPeriod(b, today), lens.scopeId, seasons).filter(lens.keep)
    const open = lines.filter((t) => lineFate(t, lvl, b.start, b.end) === 'open')
    const prev = periodBounds(lvl, b.prev, seasons)
    const young = (today.getTime() - b.start.getTime()) / DAY <= REVIEW_WINDOW_DAYS
    const review = young
      ? closeOutCandidates(selectPeriodTasks(layered, lvl, prev.start, false, lens.scopeId, seasons).filter(lens.keep), lvl, prev.start, prev.end).length
      : 0
    const name = lvl === 'month' ? b.start.toLocaleDateString('en-US', { month: 'long' }) : b.label.replace(/\s+\d{4}$/, '')
    const reviewName = lvl === 'month' ? prev.start.toLocaleDateString('en-US', { month: 'long' }) : prev.label.replace(/\s+\d{4}$/, '')
    return { name, open: open.length, planned, review, reviewName, lines: open }
  }
  const monthFacts = useMemo(() => level('month', month, !!monthSession.saved),
    [layered, month, today, lens, seasons, monthSession.saved]) // eslint-disable-line react-hooks/exhaustive-deps
  const seasonFacts = useMemo(() => level('season', season, !!seasonSession.saved),
    [layered, season, today, lens, seasons, seasonSession.saved]) // eslint-disable-line react-hooks/exhaustive-deps

  const weekItems = useMemo(
    () => weekListTasks(layered, weekStart, lens.scopeId, { isCurrent: true }).filter(lens.keep),
    [layered, weekStart, lens],
  )
  const chosenTasks = useMemo(
    () => layered.filter((t) => !t.completed && (sameDay(t.plannedOn, today) || sameDay(t.scheduledFor, today))).filter(lens.keep),
    [layered, today, lens],
  )
  const yearGoals = useMemo(
    () => goals.filter((g) => g.year === today.getFullYear() && g.status === 'active' && matchesLayers(g.context, layers)),
    [goals, today, layers],
  )

  // ── Discussions waiting on you. A thread about a task follows that task's
  // area; one about an event or routine shows only with every area on, since
  // its area is not known here.
  const { rows: threads } = useDiscussionInbox()
  const discussions = useMemo(() => {
    const visible = new Set(layered.map((t) => t.id))
    const everything = [...ALL_LAYERS].every((l) => layers.has(l))
    return threads.filter((r) => r.unread && (r.entityType === 'task' ? visible.has(r.entityId) : everything))
  }, [threads, layered, layers])

  const timed: TodayRow[] = useMemo(() => visibleEvents.filter((e) => !isAllDay(e)).map((e) => ({
    id: e.google_event_id || e.id, title: e.title, start: new Date(eventStart(e)!), end: new Date(eventEnd(e) ?? eventStart(e)!),
  })).sort((a, b) => a.start.getTime() - b.start.getTime()), [visibleEvents])
  const allDay = useMemo(() => visibleEvents.filter(isAllDay).map((e) => e.title), [visibleEvents])

  const facts: BearingsFacts = {
    now,
    weekDaysLeft: Math.max(1, 7 - Math.round((today.getTime() - weekStart.getTime()) / DAY)),
    week: { planned: !!weekSession.saved, open: weekItems.filter((t) => !t.completed).length, done: weekItems.filter((t) => t.completed).length },
    month: monthFacts,
    season: seasonFacts,
    inbox,
    todayChosen: chosenTasks.length,
    eventsAhead: timed.filter((e) => e.end > now).length,
  }

  const firstOpen = (list: Task[]) => list.find((t) => !t.completed)?.title ?? null
  const weekNo = weekOfYear(today, wso)
  const lines = (n: number) => count(n, 'line')
  const words = numberWord
  const rungs: Rung[] = [
    {
      level: 'year', name: String(today.getFullYear()), to: '/year', attention: false,
      status: yearGoals.length ? `Reference · ${words(yearGoals.length)} ${yearGoals.length === 1 ? 'intention' : 'intentions'}` : 'Nothing written yet',
      sample: yearGoals[0]?.name ?? null,
    },
    {
      level: 'season', name: seasonFacts.name, to: '/season', attention: false,
      status: seasonFacts.open ? `Brainstorm · ${lines(seasonFacts.open)}` : 'Nothing yet — a season can stay unwritten',
      sample: firstOpen(seasonFacts.lines),
    },
    {
      level: 'month', name: monthFacts.name, to: '/month', attention: false,
      status: `${monthFacts.planned ? 'Planned' : monthFacts.open ? 'Written' : 'Nothing yet'}${monthFacts.open ? ` · ${lines(monthFacts.open)}` : ''}`,
      sample: firstOpen(monthFacts.lines),
    },
    {
      level: 'week', name: `Week ${weekNo}`, to: '/week', attention: !facts.week.planned && facts.weekDaysLeft >= 3,
      status: facts.week.planned
        ? `Planned · ${facts.week.open ? `${words(facts.week.open)} to do` : 'all done'}`
        : `Not planned yet${facts.week.open ? ` · ${words(facts.week.open)} waiting` : ''}`,
      sample: firstOpen(weekItems),
    },
    {
      level: 'today', name: 'Today', to: '/today', attention: false,
      status: `${timed.length + allDay.length ? capital(count(timed.length + allDay.length, 'event')) : 'No events'} · ${chosenTasks.length ? `${words(chosenTasks.length)} chosen` : 'nothing chosen'}`,
      sample: chosenTasks[0]?.title ?? null,
    },
  ]

  const chosen: ChosenRow[] = chosenTasks.map((t) => {
    const line = linkedLine(t, tasks)
    return { id: t.id, title: t.title, forLine: line ? line.title : null }
  })

  const loaded = !tasksLoading && !seasonsLoading && !goalsLoading && !weekSession.loading && !monthSession.loading && !seasonSession.loading
  const firstName = (me?.name ?? '').trim().split(/\s+/)[0] || null
  return { loaded, facts, rungs, events: timed, allDay, chosen, discussions, calendarConnected: isConnected, firstName }
}
