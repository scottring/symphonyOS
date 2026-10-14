import { useAlongsideWorkspace } from '@/components/plan/constellation/AlongsideContext'
import { publishViewedDay } from '@/lib/viewedDaySignal'
import { DesktopControlsContext } from '@/components/layout/DesktopNavigation'
/**
 * TodayView — editorial Today shell.
 *
 * Drop-in replacement for TodaySchedule (same TodayScheduleProps interface).
 * Composes: TodayHeader, TodayOverflowMenu, WeatherChip,
 *           ScheduleItem.
 *
 * NOT wired to the route yet — that happens in R4.
 */
import { useContext, createElement, useMemo, useCallback, useRef, useState, useEffect, useLayoutEffect } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { TimelineCaptureResult } from '@/components/schedule/TimelineQuickInput'
import type { ParserContext } from '@/lib/quickInputParser'
import type { HomeViewType } from '@/types/homeView'
import type { DaySection } from '@/lib/timeUtils'
import type { TimelineItem } from '@/types/timeline'

import { parseRoutineTimelineId } from '@/lib/today/doseExpansion'
import { readCollapsed, setCollapsed, onCollapsedChange, sectionKey } from '@/lib/today/sectionCollapse'
import { useMobile } from '@/hooks/useMobile'
import { useTodayData } from '@/hooks/useTodayData'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useTimelineInsert } from '@/hooks/useTimelineInsert'
import { useDomain } from '@/hooks/useDomain'
import { MobilePlanControls } from '@/components/layout/PlanNavigation'
import { PhoneFilterControl } from '@/components/layout/PhoneFilterControl'

import { Eye, EyeOff, Printer, GripVertical, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { splitTodayJournal, splitCompletedFocus } from '@/lib/today/journalSplit'
import { panelActionsFor } from '@/components/reference/DayPlanPanel'
import { useColumnsFitWindow } from '@/hooks/useColumnsFitWindow'
import { TodayWeekColumn } from './TodayWeekColumn'
import { CalendarReconnectBanner } from '@/components/home/CalendarReconnectBanner'
import { TodayComingUp } from './TodayComingUp'
import { ServesLine } from './ServesLine'
import { parentLinkOf } from '@/lib/planning/parentLink'
import { nextWeekEntries } from '@/lib/today/dayPlan'
import { unhomedRoutines } from '@/lib/week/unhomedRoutines'
import { useWeekInstances } from '@/components/home/week/useWeekInstances'
import { useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { makePlanActions } from '@/lib/planning/planActions'
import { localYmd } from '@/lib/cadence/config'
import { planDropHandlers } from '@/lib/planning/planDrag'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { findTaskById } from '@/lib/findTaskById'
import { showToast } from '@/hooks/useToast'
import { useNavigate } from 'react-router-dom'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { ALL_LAYERS } from '@/lib/domains'

import { NeededTodayNote } from './NeededTodayNote'
import { TodayAddInput } from './TodayAddInput'
import { PhoneCaptureBar } from '@/components/layout/PhoneCaptureBar'
import { DailyEditionPreview, useEditionPreview } from './DailyEditionPreview'
import { TodaySectionList, findTimelineItem } from './TodaySectionList'
import { TodayDragProvider } from './TodayDragProvider'
import { TodayDayScale, type DayScaleHandle } from './TodayDayScale'
import { ForTodayDropZone } from './TodayDropZones'
import { resolveDrop, writeMoveAndRegisterUndo, SCALE_DROP_ID, type DropIntent } from '@/lib/today/todayDrop'
import { useCalendarPermissions } from '@/hooks/useCalendarPermissions'
import { selectUpNext, formatUpNextStatus } from '@/lib/today/upNext'
import { comingUp } from '@/lib/today/forwardLook'
import { NeedsYourOK } from './NeedsYourOK'
import { selectHorizonPool } from '@/lib/today/horizons'
import { monthStartOf } from '@/lib/planning/periodPlacement'
import { doableBy } from '@/lib/planning/poolViews'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { placementFate } from '@/lib/planning/lineage'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { TodayOverflowMenu } from './TodayOverflowMenu'
import { HorizonPoolDropdown } from './HorizonPoolDropdown'
import { DayNavCluster } from './DayNavCluster'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { readPlanView, writePlanView, type PlanView } from '@/lib/planning/v2/planV2'
import { GuideAnchor } from '@/components/guide/GuideBar'
import { useGuidedPlan } from '@/hooks/useGuidedPlan'
import { currentStep } from '@/lib/guide/guidedPlan'
import { ViewSwitch } from '@/components/plan/v2/ViewSwitch'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { WeatherChip } from './WeatherChip'
import { parseSpecials } from '@/lib/today/specials'
import { DEFAULT_START } from '@/lib/today/dayScale'
import { useUnreviewedCaptures } from '@/hooks/useUnreviewedCaptures'
import { TimelineNoteComposer } from './TimelineNoteComposer'

import { discussionItems } from '@/lib/discussionItems'
import { PrintableDayList } from './PrintableDayList'
import { LoadFailedNotice } from '@/components/common/LoadFailedNotice'
import { daySentence, type DaySentenceItem } from '@/lib/today/daySentence'
import { effectiveStartTime } from '@/lib/timeUtils'
import { useConversationWalk } from '@/components/canvas/conversationWalk'
import { useAssistantLauncher } from '@/contexts/AssistantLaunchContext'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { todayPreview, markForRow, type TodayPreview } from './todayPreview'
import { readHideRoutines, writeHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { useShareToFamilyNudges } from '@/lib/today/shareNudges'
import { PLANNING_PAGE_CLASS } from '@/components/layout/pageLayout'

// ─── Props: identical to TodayScheduleProps ───────────────────────────────────

interface TodayViewProps {
  // View-specific data
  tasks: Task[]
  /** Whose Today this is — focus (task_focus) is per person. */
  userId?: string | null
  events: CalendarEvent[]
  routines?: Routine[]
  /** Every active routine, not only the day's: the Planning sheet lists
   *  weekly routines with no day of their own, which no single day carries. */
  allRoutines?: Routine[]
  /**
   * The UNFILTERED task list, for the day tiles' counts only.
   *
   * `tasks` above is what this view draws, already narrowed to the reader's
   * layers and assignee. Density is universal — a day is full regardless of
   * which domain filled it — so counting the drawn list would call a day free
   * that is not. Omitted, the tiles fall back to `tasks` and under-count
   * exactly as much as the view is filtered.
   */
  densityTasks?: Task[]
  dateInstances?: ActionableInstance[]
  projects?: Project[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  loading?: boolean
  /** The task read failed and nothing arrived: say so, never "Nothing chosen yet." */
  tasksLoadFailed?: boolean
  /** Reload the tasks (the tasks hook's refetch). */
  onRetryTasks?: () => void
  viewedDate: Date
  onDateChange: (date: Date) => void
  // Undo-wrapped handlers from HomeView
  onToggleTask: (taskId: string) => void
  onCompleteRoutine?: (routineId: string, completed: boolean, completedAt?: Date) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  // Assignee filter (managed by HomeView) — multi-select union; [] = everyone
  selectedAssignees?: string[]
  onSelectAssignees?: (ids: string[]) => void
  assigneesWithTasks?: FamilyMember[]
  hasUnassignedTasks?: boolean
  // Panel state
  panelOpen?: boolean
  bothPanelsOpen?: boolean
  onClosePanel?: () => void
  /** Opens plan-from-paper (photo of the written plan → placed tasks). */
  /** Page chrome (domain chooser, assistant toggle) rendered in the day card's
   *  top-right corner. Passed in rather than read from context so TodayView
   *  stays renderable without an AppShell around it. */
  headerControls?: React.ReactNode
  /** Drawn after the Schedule block — the quiet place for a planning
   *  reminder (Scott via Codex, 2026-09-22: weekly planning is secondary,
   *  so its line sits below the day, never above the date). */
  afterSchedule?: React.ReactNode
  // Bulk actions (managed by HomeView)
  onUpdateTasksBulk?: (taskIds: string[], updates: Partial<Task>) => Promise<void>
  // Timeline insert points — fall back to context
  onCreateTaskAt?: (r: TimelineCaptureResult) => void
  onCreateEventAt?: (r: TimelineCaptureResult) => void
  onCreateRoutineAt?: (r: TimelineCaptureResult) => void
  onCreateNoteAt?: (content: string, anchor: Date | null) => void
  onAppendNoteAt?: (id: string, block: string, anchor: Date | null) => void
  onLinkNote?: (id: string) => void
  timelineNotes?: { id: string; title?: string; content: string; timelineAt?: Date }[]
  // D/W/M view switcher — threaded from HomeView
  currentHomeView?: HomeViewType
  onHomeViewChange?: (view: HomeViewType) => void
}

// ─── Component ─────────────────────────────────────────────────────────────────

/** Tasks: the day's untimed work — every task dated today plus what was chosen (chosen rows lead); then untimed occurrences. */
const FOCUS_SECTIONS: DaySection[] = ['allday', 'unscheduled']
/** The timed day, drawn to scale (TodayDayScale). */
const TIMED_SECTIONS: DaySection[] = ['earlyMorning', 'morning', 'afternoon', 'evening', 'night']

/** The bar's walk on today's page (spec 2026-10-14): plan in the morning,
 *  review from 4 pm. Each ends in one change card. */
const PLAN_WALK = { label: 'Plan my day', message: 'Plan my day.' }
const REVIEW_WALK = { label: 'Review my day', message: 'Review my day.' }


const HIDE_EARLIER_KEY = 'symphony-today-hide-earlier'
function readHideEarlier(): boolean {
  try { return localStorage.getItem(HIDE_EARLIER_KEY) === '1' } catch { return false }
}
function writeHideEarlier(v: boolean) {
  try { if (v) localStorage.setItem(HIDE_EARLIER_KEY, '1'); else localStorage.removeItem(HIDE_EARLIER_KEY) } catch { /* private window */ }
}

export function TodayView({
  tasks,
  userId,
  events,
  routines = [],
  allRoutines,
  dateInstances = [],
  projects = [],
  selectedItemId,
  onSelectItem,
  onToggleTask,
  onCompleteRoutine,
  onCompleteEvent,
  loading,
  tasksLoadFailed = false,
  onRetryTasks,
  viewedDate,
  onDateChange,
  selectedAssignees,
  onSelectAssignees,
  assigneesWithTasks,
  hasUnassignedTasks,
  panelOpen,
  onClosePanel,
  headerControls,
  afterSchedule,
  onCreateNoteAt: onCreateNoteAtProp,
  onAppendNoteAt: onAppendNoteAtProp,
  onLinkNote: onLinkNoteProp,
  timelineNotes: timelineNotesProp,
}: TodayViewProps) {
  useLayoutEffect(() => { publishViewedDay(viewedDate) }, [viewedDate])
  useLayoutEffect(() => () => publishViewedDay(null), [])
  // ── Context ──────────────────────────────────────────────────────────────────
  const isMobile = useMobile()
  const [editionPreview, hideEditionPreview] = useEditionPreview()
  const navigate = useNavigate()
  const { isConnected: calendarConnected, error: calendarError } = useGoogleCalendar()
  const ctx = useScheduleActionsContext()
  // Only what THIS file still uses. The row-level handlers moved with the
  // section loop into TodaySectionList, which reads the same context itself.
  const {
    onUpdateTask,
    onGroupItems,
    onPushRoutine,
    onNotify,
    contactsMap, familyMembers = [],
  } = ctx
  // NOTE: completing a Needed Today list-item row is NOT wired from here.
  // It belongs to useNeededListItems (which the note owns), because
  // ListsContext.updateItem early-returns on any row that isn't in the open
  // list — and no list is ever open on Today.

  // Raw task id of a group created by drag, held open on its name field.
  // (Bulk select, the review drawer, the duplicate sweep and the proposed
  // order left with "Today, trimmed", 2026-10-14: several things at once are
  // said to Symphony and end in one change card.)
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)

  // ── Hide-routines toggle (localStorage parity) ────────────────────────────────
  const [hideRoutines, setHideRoutines] = useState<boolean>(() => readHideRoutines())

  useEffect(() => onHideRoutinesChange(setHideRoutines), [])

  const toggleHideRoutines = useCallback(() => {
    setHideRoutines((v) => {
      const next = !v
      writeHideRoutines(next)
      return next
    })
  }, [])

  // ── Completed-task linger (mobile only) ───────────────────────────────────────
  // On mobile, a checked-off task stays visible (crossed out) for ~60s so the
  // completion registers, then drops off Today to keep the list focused on what's
  // left. Desktop keeps completed items for the whole day. `nowTick` advances on
  // an interval so lingering items expire on their own without a manual refresh.
  const COMPLETED_LINGER_MS = 60_000
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    // Ticks on all breakpoints: mobile uses it for completed-task linger,
    // and the Up Next hero uses it to stay minute-fresh everywhere.
    const id = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  const completedLingerCutoff = isMobile ? nowTick - COMPLETED_LINGER_MS : undefined

  // ── Derived data ─────────────────────────────────────────────────────────────
  // The week Today belongs to. A week placement now names its week, so the
  // "This Week" strip has to say which week it is showing — otherwise a move
  // placed on a week a month out sits on today's strip. Memoized so it stays
  // referentially stable (todayInput depends on it). Fixed for the session's
  // lifetime, same as `todayStart` elsewhere — a week boundary crossed with the
  // tab open is the same edge case a day boundary already is.
  const currentWeekStart = useMemo(
    () => weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn),
    [],
  )
  // The checked layer set — feeds the resolver's rung 4 directly (routines no
  // longer arrive pre-filtered by domain from HomeView).
  const { layers, all: showAllDomains } = useDomain()
  // Every instance touching this week: a flexible routine already placed on
  // one of its days has a home for the week and leaves the sheet's To plan.
  const weekInstances = useWeekInstances(currentWeekStart, 7)
  const todayInput = useMemo(() => ({
    tasks,
    events,
    routines,
    dateInstances,
    viewedDate,
    selectedAssignee: selectedAssignees ?? [],
    hideRoutines,
    layers,
    completedLingerCutoff,
    weekStart: currentWeekStart,
    userId,
    // The same set the Planning dock draws, so the sheet and the dock agree.
    unhomedRoutines: unhomedRoutines(allRoutines ?? routines, { member: selectedAssignees ?? [], prefs: { hideRoutines: false, layers } },
      { weekStart: currentWeekStart, instances: weekInstances }),
    // Cast: EventNote.notes is string|null; TodayDataInput expects string|undefined — structurally compatible at runtime
    eventNotesMap: ctx.eventNotesMap as unknown as Map<string, { notes?: string; assignedTo?: string | null }> | undefined,
    eventContextOverrides: ctx.eventContextOverrides,
    getDomainForCalendar: ctx.getDomainForCalendar,
  }), [tasks, userId, events, routines, allRoutines, dateInstances, viewedDate, selectedAssignees, hideRoutines, layers, completedLingerCutoff,
      currentWeekStart, weekInstances, ctx.eventNotesMap, ctx.eventContextOverrides, ctx.getDomainForCalendar])

  const data = useTodayData(todayInput)

  // ── The day's plan (dayPlan.ts) ────────────────────────────────────────
  // What the main list does not draw — dated-but-unchosen tasks, available
  // routine occurrences, the week's and month's lists — waits in the Today
  // pin. Today spends ONE line on it (never a list), so closing the pin can
  // never make an obligation disappear. Built from this page's own handlers:
  // no second task fetch.
  const references = useReferenceLists()
  const { setPlanned, reschedule: rescheduleInstance } = useActionableInstances()
  const planActions = useMemo(() => makePlanActions({
    findTask: (id) => findTaskById(tasks, id),
    updateTask: (id, u) => ctx.onUpdateTask?.(id, u),
    pushTask: (id, target) => ctx.onPushTask?.(id, target),
    setRoutinePlanned: (id, day, planned) => setPlanned('routine', id, day, planned),
    rescheduleRoutine: (id, from, when) => rescheduleInstance('routine', id, from, when),
    notify: (m) => showToast(m, 'warning'),
  }), [tasks, ctx, setPlanned, rescheduleInstance])
  const planPanelActions = useMemo(() => panelActionsFor(viewedDate, {
    ...planActions,
    toggleTask: onToggleTask,
    completeRoutine: async (id, _day, done) => { onCompleteRoutine?.(id, done); return true },
  }, {
    changeRoutineRule: () => navigate('/routines'),
    // The sheet's row titles open the same detail pane the page's rows do.
    open: (kind, id) => onSelectItem(`${kind}-${id}`),
  }), [viewedDate, planActions, onToggleTask, onCompleteRoutine, navigate, onSelectItem])
  // The week beside the day (Scott, 2026-09-30: "above all else, it has to
  // be consistent"): every horizon keeps the level above in a column on its
  // right, switched by the same view icons — Today too. The Shelves drawer
  // this replaces made Today the one page that hid what you choose from.
  // Hidden unless chosen (Scott, 2026-09-30: Today's default stays the day
  // alone); "Pick something for today" opens it with the week showing.
  const alongsideWorkspace = useAlongsideWorkspace()
  const [todayView, setTodayViewState] = useState<PlanView>(() => readPlanView('today') === 'ref' ? 'ref' : 'list')
  const setTodayView = (v: PlanView) => { if (alongsideWorkspace) { if (v === 'ref') alongsideWorkspace.showWeek(); return } setTodayViewState(v); writePlanView('today', v) }
  // The guide's Today step asks you to choose from the week, so the week is
  // beside the day for it — without changing the view you keep afterwards
  // (walkthrough 2026-09-30: the step opened on the day alone).
  const { state: guide } = useGuidedPlan()
  const guideOnToday = guide?.status === 'active' && currentStep(guide) === 'today'
  useEffect(() => { if (guideOnToday) { if (alongsideWorkspace) alongsideWorkspace.showWeek(); else setTodayViewState('ref') } }, [guideOnToday, alongsideWorkspace])
  const showWeek = !alongsideWorkspace && todayView === 'ref'
  const splitRef = useColumnsFitWindow(showWeek)
  const weekNo = weekOfYear(viewedDate, readCadenceConfig().weekStartsOn)
  // The dock's Today pin showed this same list beside the page; the column
  // holds it now, so the page never shows it twice.
  useEffect(() => {
    if (references?.pins.some((p) => p.kind === 'today')) references.unpin('today')
  }, [references])
  // No count on Today (Scott, 2026-10-06, "Today, calmer"): the week's
  // number places the day; how much is left to place is the column's job.
  const weekLine = `Week ${weekNo}`
  // On the week's last day the column also shows the week still ahead
  // (walkthrough 2026-10-02, #24/#18). Same rows the Week page lists, through
  // the same filters this page applies: `tasks` arrives layer-filtered, and
  // the people filter is applied here exactly as the chooser applies it.
  const nextWeek = useMemo(() => {
    const wso = readCadenceConfig().weekStartsOn
    const start = weekStartAnchor(viewedDate, wso)
    const last = new Date(start); last.setDate(last.getDate() + 6)
    if (localYmd(last) !== localYmd(viewedDate)) return null
    const next = new Date(start); next.setDate(next.getDate() + 7)
    return { weekNo: weekOfYear(next, wso), weekStart: next, entries: nextWeekEntries(tasks, selectedAssignees ?? [], next, localYmd(viewedDate), userId) }
  }, [tasks, selectedAssignees, viewedDate, userId])
  // "Coming up" under Schedule: open work dated in the seven days after this
  // one (walkthrough 2026-10-02, #28). The page's own filtered tasks, through
  // the same people filter as every row on it — never an unfiltered list.
  const comingUpItems = useMemo(() => {
    const match = makeAssigneeFilter(selectedAssignees ?? [])
    return comingUp(tasks.filter((t) => match(t.assignedTo, t.assignedToAll)), viewedDate)
  }, [tasks, selectedAssignees, viewedDate])
  const [agendaDropOver, setAgendaDropOver] = useState(false)
  const agendaDrop = planDropHandlers((payload) => {
    void planActions.drop(payload, { type: 'day', day: viewedDate }, { chooseOnly: true })
  }, setAgendaDropOver)

  // The week/month lists for the header dropdowns — separate from the daily
  // review by decree (Scott, 2026-08-19): look and pick from up here, never
  // inside the review session. They plan MY day, so they scope to the current
  // member the way the /week column and the month fold do (doableBy):
  // unassigned rows and mine; a row assigned exclusively to someone else is
  // rightly visible elsewhere but isn't mine to put on today. Not a view of
  // the assignee FILTER, which is a different question (Scott, 2026-09-05).
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const desktopControls = useContext(DesktopControlsContext)
  // In the desktop Shell the control row folds into the masthead; phones and
  // standalone mounts keep it as its own row.
  const foldedControls = !!desktopControls && !isMobile
  const poolMatchMine = useMemo(
    () => (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) =>
      !meId || doableBy({ assignedTo: assignedTo ?? undefined, assignedToAll: assignedToAll ? [...assignedToAll] : undefined }, meId),
    [meId],
  )
  const weekPool = useMemo(
    () => selectHorizonPool(tasks, 'week', poolMatchMine, currentWeekStart),
    [tasks, poolMatchMine, currentWeekStart],
  )
  // The month list is THIS month's (a legacy NULL month_start row is this
  // month's too); next month's rows wait their turn.
  const monthPool = useMemo(
    () => selectHorizonPool(tasks, 'month', poolMatchMine, undefined, monthStartOf(viewedDate)),
    [tasks, poolMatchMine, viewedDate],
  )

  // ── Up Next: the single next commitment, highlighted in place. It used to
  // be lifted out of its section into a hero card, which left its home
  // section rendering an empty heading — the timeline read as disassembled.
  const upNext = useMemo(() => {
    if (!data.isToday) return null
    const allItems = data.sectionsOrder.flatMap((s) => data.grouped[s] ?? [])
    return selectUpNext(allItems, new Date(nowTick))
  }, [data, nowTick])
  const upNextId = upNext?.item.id
  const upNextStatus = upNext ? formatUpNextStatus(upNext) : undefined

  // ── New from email: told in the header sentence ("2 new from email").
  // School mail is auto-placed, so a wrong guess can sit on a day unannounced;
  // the review sheet used to catch it. Following the line asks Symphony what
  // came in and where it landed (any fix ends in the change card), and stamps
  // reviewed_at on what it counted so the line goes once it is asked about.
  const { captures: emailCaptures, markReviewed } = useUnreviewedCaptures()
  const { openAssistant } = useAssistantLauncher()
  const askAboutEmail = useCallback(() => {
    const subjects = emailCaptures.map((c) => c.subject?.trim()).filter(Boolean).map((t) => `“${t}”`).join(', ')
    void markReviewed(emailCaptures.map((c) => c.id))
    openAssistant({
      message: `What came in from email${subjects ? ` (${subjects})` : ''}? Tell me what you added and where it landed.`,
      autoSend: true, stayOnPage: true,
    })
  }, [emailCaptures, markReviewed, openAssistant])

  // Which sections the user has folded shut. Persisted; Unscheduled starts
  // collapsed because it holds the untimed-routine slab. A section whose
  // remaining items are all complete also renders collapsed unless the user
  // has explicitly opened it — one mechanism, not two.
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => readCollapsed())
  const [openedByUser, setOpenedByUser] = useState<Set<string>>(new Set())
  useEffect(() => onCollapsedChange(setCollapsedKeys), [])
  // Sets an explicit state per the CURRENT rendered `collapsed` value rather
  // than blindly flipping both `collapsedKeys` and `openedByUser` — flipping
  // both in lockstep made "explicitly folded" and "explicitly opened" track
  // each other exactly, so the one state that should open an auto-collapsed
  // section (`collapsedKeys` false AND `openedByUser` true) was unreachable.
  const toggleSection = useCallback((section: DaySection, currentlyCollapsed: boolean) => {
    const key = sectionKey(section)
    if (currentlyCollapsed) {
      setCollapsedKeys(setCollapsed(key, false))
      setOpenedByUser((prev) => new Set(prev).add(key))
    } else {
      setCollapsedKeys(setCollapsed(key, true))
      setOpenedByUser((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [])

  // Timeline insert points: radial wheel pick → note composer (task/event/routine
  // are handled inline by TimelineInsertPoint via onCreate)
  const insert = useTimelineInsert()

  // Referentially-stable parser context for inline timeline quick-capture.
  const parserContacts = useMemo(
    () => Array.from(contactsMap?.values() ?? []).map(c => ({ id: c.id, name: c.name })),
    [contactsMap],
  )
  const parserProjectsList = useMemo(
    () => projects.map(p => ({ id: p.id, name: p.name })),
    [projects],
  )
  const parserFamilyMembersList = useMemo(
    () => familyMembers.map(m => ({ id: m.id, name: m.name })),
    [familyMembers],
  )
  const parserContext = useMemo<ParserContext>(() => ({
    projects: parserProjectsList,
    contacts: parserContacts,
    familyMembers: parserFamilyMembersList,
  }), [parserProjectsList, parserContacts, parserFamilyMembersList])

  // Note composer handlers: props take precedence, fall back to context (legacy prop??ctx pattern)
  const onCreateNoteAt = onCreateNoteAtProp ?? ctx.onCreateNoteAt
  const onAppendNoteAt = onAppendNoteAtProp ?? ctx.onAppendNoteAt
  const onLinkNote = onLinkNoteProp ?? ctx.onLinkNote
  const timelineNotes = timelineNotesProp ?? ctx.timelineNotes

  // Open talk-abouts (flagged tasks): one quiet line under For today.
  const discussion = discussionItems(tasks)

  // ── Tasks map for parent task lookup ─────────────────────────────────────────
  const tasksMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const t of tasks) {
      map.set(t.id, t)
    }
    return map
  }, [tasks])

  // Share-to-family nudges keyed by event id, for inline rendering below events.
  const shareNudges = useShareToFamilyNudges(
    events,
    ctx.eventNotesMap,
    ctx.eventContextOverrides,
    ctx.getDomainForCalendar,
  )
  const shareNudgeByEventId = useMemo(() => {
    const m = new Map<string, (typeof shareNudges)[number]>()
    for (const n of shareNudges) m.set(n.eventId, n)
    return m
  }, [shareNudges])

  const nowForDisplay = useMemo(() => new Date(nowTick), [nowTick])
  // "Hide earlier hours" on today's day column: it then opens an hour
  // before now. Offered once there are at least two spent hours to fold.
  const earlierCutoff = nowForDisplay.getHours() - 1
  const canHideEarlier = data.isToday && earlierCutoff >= DEFAULT_START + 2
  const [hideEarlier, setHideEarlierState] = useState(readHideEarlier)
  const setHideEarlier = (v: boolean) => { setHideEarlierState(v); writeHideEarlier(v) }
  const dayName = useMemo(
    () => viewedDate.toLocaleDateString('en-US', { weekday: 'long' }),
    [viewedDate],
  )

  // ── The header sentence (daySentence.ts): the day said back from rules,
  // with new email captures folded in. Empty says nothing; a load says so.
  const sentenceItems = useMemo(() => TIMED_SECTIONS.flatMap((section) => data.grouped[section] ?? []).flatMap((item): DaySentenceItem[] => {
    const start = item.isSubtask ? null : effectiveStartTime(item)
    if (!start) return []
    const kind = item.type === 'event' ? 'event' : item.type === 'task' ? 'task' : 'routine'
    return [{ title: item.title, start, end: item.allDay ? null : item.endTime, kind, completed: item.completed || !!item.skipped }]
  }), [data.grouped])
  const sentence = useMemo(
    () => daySentence({ items: sentenceItems, now: data.isToday ? nowForDisplay : null, emailCount: data.isToday ? emailCaptures.length : 0 }),
    [sentenceItems, data.isToday, nowForDisplay, emailCaptures.length],
  )
  const statusLine = loading ? 'Loading the day.' : tasksLoadFailed ? 'Your tasks didn’t load.' : null
  const headerSentence = statusLine || sentence.day || sentence.email ? (
    <span className="today-sentence">
      {statusLine ?? sentence.day}
      {!statusLine && sentence.email && <>{sentence.day ? ' ' : ''}<button type="button" className="today-sentence-link" onClick={askAboutEmail}>{sentence.email}</button></>}
    </span>
  ) : null

  // ── Plan my day / Review my day: the bar's walk into a conversation that
  // ends in one change card. Today's date only; phones offer it in the page.
  const walk = data.isToday ? (nowForDisplay.getHours() < 16 ? PLAN_WALK : REVIEW_WALK) : null
  const walkInBar = useConversationWalk(walk)
  const pageWalk = walk && !walkInBar ? walk : null

  // ── A pending change card, drawn dashed on the day (todayPreview.ts).
  const { changeSet } = useCanvasActivity()
  const preview: TodayPreview = useMemo(() => todayPreview(changeSet, viewedDate), [changeSet, viewedDate])
  // Viewing another day: "Tomorrow"/"Yesterday" reads better than repeating the
  // weekday the date line above already shows.
  const relativeDayLabel = useMemo(() => {
    const a = new Date(viewedDate); a.setHours(0, 0, 0, 0)
    const b = new Date(nowForDisplay); b.setHours(0, 0, 0, 0)
    const days = Math.round((a.getTime() - b.getTime()) / 86400000)
    if (days === 1) return 'Tomorrow'
    if (days === -1) return 'Yesterday'
    return dayName
  }, [viewedDate, nowForDisplay, dayName])

  // ── Drag: the pure resolver's inputs ─────────────────────────────────────────
  const { isReadOnlyCalendar } = useCalendarPermissions()

  const isReadOnlyEvent = useCallback((item: TimelineItem) => {
    const ev = item.originalEvent
    return isReadOnlyCalendar(ev?.calendar_id ?? ev?.calendarId ?? null)
  }, [isReadOnlyCalendar])

  // Every untimed task for this day, INCLUDING rows the domain or assignee
  // filter hides. Reorder renormalises against this: renormalising only the
  // rendered subset resets it to 0…n×1000 while hidden siblings keep their old
  // values and interleave on the next render (Stage 2a residual 3).
  const untimedOrder = useMemo(() => {
    const day = new Date(viewedDate); day.setHours(0, 0, 0, 0)
    const sameDay = (d?: Date | null) => {
      if (!d) return false
      const x = new Date(d); x.setHours(0, 0, 0, 0)
      return x.getTime() === day.getTime()
    }
    // Completed all-day tasks are INCLUDED. They still render on Today (they
    // linger), so leaving them out makes this set not-actually-full: a
    // renormalise would hand 0…n×1000 to the incomplete rows and leave the
    // completed ones null, sinking every one of them to the bottom of All Day
    // the first time anything is reordered. Same shape as Stage 2a residual 3,
    // caught by dragging on :5173 rather than by any test.
    const untimed = tasks
      .filter((t) => t.bucket === 'timed' && t.isAllDay && sameDay(t.scheduledFor))
      .sort((a, b) => {
        const ao = a.sortOrder ?? null, bo = b.sortOrder ?? null
        if (ao != null && bo != null) return ao - bo
        if (ao != null) return -1
        if (bo != null) return 1
        return a.title.localeCompare(b.title)
      })
    return {
      ids: untimed.map((t) => t.id),
      orders: new Map(untimed.map((t) => [t.id, t.sortOrder ?? null])),
    }
  }, [tasks, viewedDate])

  // The day column reads the time a drop landed at from its own geometry.
  const scaleRef = useRef<DayScaleHandle>(null)
  const resolve = useCallback((activeId: string, overId: string, pointerY: number | null) => resolveDrop({
    activeId,
    overId,
    scaleTime: overId === SCALE_DROP_ID && pointerY !== null ? scaleRef.current?.timeAt(pointerY) ?? null : null,
    sections: data.grouped,
    fullOrderIds: { allday: untimedOrder.ids },
    orders: untimedOrder.orders,
    viewedDate,
    isReadOnlyEvent,
    // Read fresh at drop time — a stale array silently drops members and
    // addToGroup cannot defend itself (Stage 2a residual 4).
    groupMembersOf: (wrapperRawId) => tasksMap.get(wrapperRawId)?.groupMembers ?? [],
  }), [data.grouped, untimedOrder, viewedDate, isReadOnlyEvent, tasksMap])

  /**
   * Apply what the resolver decided. Three rules are worth naming, because each
   * is a way this could silently do the wrong thing:
   *
   * 1. `bucket:'timed'` and `scheduledFor` move in LOCKSTEP. A scheduledFor
   *    without the bucket never surfaces on Today at all — selectTimed gates on
   *    the bucket (taskPools.ts).
   * 2. Retiming a routine writes a ONE-DAY override via onPushRoutine, which
   *    reaches reschedule() → status:'pending' + deferred_to, exactly what
   *    grouping.ts reads back as a same-day time override. It must never call
   *    scheduleRoutineOnDate, which rewrites recurrence_pattern permanently —
   *    one drag would move every future occurrence.
   * 3. A refusal is SAID OUT LOUD. Silently ignoring a drop is how a surface
   *    teaches people not to trust it.
   */
  const applyIntents = useCallback(async (intents: DropIntent[]) => {
    for (const intent of intents) {
      switch (intent.kind) {
        case 'refuse':
          onNotify?.(intent.reason)
          break

        case 'set-time': {
          if (intent.itemId.startsWith('task-')) {
            const taskId = intent.itemId.replace('task-', '')
            const before = tasks.find((t) => t.id === taskId)
            // A drag is the easiest action in the app to do by accident — but
            // a cancelled domain gate (the row is Unsorted, the DomainGate
            // dialog is up) writes nothing, so writeMoveAndRegisterUndo skips
            // the "Moved · Undo" toast for a move that didn't happen.
            await writeMoveAndRegisterUndo(
              onUpdateTask,
              taskId,
              { bucket: 'timed', scheduledFor: intent.when, isAllDay: false },
              before && { bucket: before.bucket, scheduledFor: before.scheduledFor, isAllDay: before.isAllDay },
              `Moved "${before?.title}"`,
              ctx.onRegisterUndo,
            )
          } else if (intent.itemId.startsWith('routine-collection-')) {
            // The whole routine moves for this day: a one-day time on the
            // routine itself, never on each step.
            onPushRoutine?.(intent.itemId.slice('routine-collection-'.length), intent.when)
          } else if (intent.itemId.startsWith('routine-')) {
            const { routineId, slot } = parseRoutineTimelineId(intent.itemId)
            // Dosed steps are refused upstream; this is belt-and-braces.
            if (slot === null) onPushRoutine?.(routineId, intent.when)
          } else if (intent.itemId.startsWith('event-')) {
            const ev = findTimelineItem(data.grouped, intent.itemId)?.originalEvent
            if (ev) {
              const startStr = ev.start_time || ev.startTime
              const endStr = ev.end_time || ev.endTime
              const durationMs = startStr && endStr
                ? new Date(endStr).getTime() - new Date(startStr).getTime()
                : 30 * 60_000
              await ctx.onUpdateEvent?.(ev.google_event_id || ev.id, {
                startTime: intent.when,
                endTime: new Date(intent.when.getTime() + durationMs),
              })
            }
          }
          break
        }

        case 'make-all-day': {
          if (!intent.itemId.startsWith('task-')) {
            // A routine/event instance has no all-day concept to write. Say so
            // rather than accepting the gesture and doing nothing.
            onNotify?.('Only tasks can be moved to All day.')
            break
          }
          const midnight = new Date(viewedDate)
          midnight.setHours(0, 0, 0, 0)
          const allDayId = intent.itemId.replace('task-', '')
          const wasTimed = tasks.find((t) => t.id === allDayId)
          // A cancelled domain gate writes nothing — writeMoveAndRegisterUndo
          // skips the "Moved · Undo" toast for a move that didn't happen.
          await writeMoveAndRegisterUndo(
            onUpdateTask,
            allDayId,
            { bucket: 'timed', scheduledFor: midnight, isAllDay: true },
            wasTimed && { bucket: wasTimed.bucket, scheduledFor: wasTimed.scheduledFor, isAllDay: wasTimed.isAllDay },
            `Moved "${wasTimed?.title}" to For today`,
            ctx.onRegisterUndo,
          )
          break
        }

        case 'reorder':
          await ctx.onReorderTasks?.(intent.writes)
          break

        case 'create-group': {
          const wrapperId = await onGroupItems?.(
            intent.taskIds, intent.memberRefs, intent.groupName, intent.date, intent.isAllDay,
          )
          // Straight into the name field. The group's placeholder name is the
          // one thing the drag couldn't infer, so asking for it now — with the
          // text selected — costs no extra gesture.
          if (wrapperId) setRenamingGroupId(wrapperId)
          // Undo dissolves the group: detach the members, drop the wrapper.
          if (wrapperId) {
            ctx.onRegisterUndo?.('Made a group', () => {
              void ctx.onUngroup?.(wrapperId, intent.taskIds)
            })
          }
          break
        }

        case 'add-to-group': {
          await ctx.onAddToGroup?.(
            intent.wrapperId, intent.taskIds, intent.memberRefs, intent.date, intent.isAllDay,
          )
          const joined = intent.taskIds
          if (joined.length > 0) {
            ctx.onRegisterUndo?.('Added to group', () => {
              for (const id of joined) void ctx.onRemoveFromGroup?.(id)
            })
          }
          break
        }

        case 'remove-from-group': {
          const leaving = tasks.find((t) => t.id === intent.taskId)
          const formerParent = leaving?.parentTaskId
          await ctx.onRemoveFromGroup?.(intent.taskId)
          if (formerParent) {
            ctx.onRegisterUndo?.('Removed from group', () => {
              void ctx.onAddToGroup?.(
                formerParent, [intent.taskId], [], leaving?.scheduledFor ?? viewedDate,
                leaving?.isAllDay ?? false,
              )
            })
          }
          break
        }
      }
    }
  }, [ctx, onUpdateTask, onPushRoutine, onGroupItems, onNotify, viewedDate, data.grouped])

  // ── Handler stubs ─────────────────────────────────────────────────────────────
  const handleSelectItem = useCallback((id: string | null) => {
    onSelectItem(id)
  }, [onSelectItem])

  const listRef = useRef<HTMLDivElement>(null)

  // ── First-item marker (exactly one element gets data-today-first) ────────────
  // The first item id of the first non-empty section.
  const firstSectionItemId: string | null = (() => {
    for (const section of data.sectionsOrder) {
      const items = data.grouped[section]
      if (items && items.length > 0) return items[0].id
    }
    return null
  })()

  // ── Print: mount the compact list, then hand the page to the printer ──
  // The button sets state and an effect prints on the next commit, so the list
  // is in the DOM before the browser snapshots. beforeprint/afterprint cover
  // Cmd+P, which never goes through the button.
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const before = () => setPrinting(true)
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  const printList = useCallback(() => setPrinting(true), [])
  useEffect(() => {
    if (!printing) return
    // Next frame: let the list paint before the print dialog freezes the page.
    //
    // Teardown belongs to `afterprint` alone. In a browser window.print()
    // blocks and afterprint fires as the dialog closes, so clearing here too
    // was merely redundant — but in the Mac shell printing is handed to AppKit,
    // whose print panel is a sheet that outlives this call and renders the page
    // when the user confirms. Unmounting the list on the next line would print
    // the screen layout instead of the list.
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [printing])

  // ── Render ────────────────────────────────────────────────────────────────────
  /* Today's secondary controls behind one button: Hide daily and Print list
     only ("Today, trimmed", 2026-10-14). Reviews, ordering and duplicate
     checks are asked for in the bar and end in one change card. ONE
     instance: desktop puts it in the controls strip, phones beside the date. */
  const overflowMenu = (
    <TodayOverflowMenu>
      <button
        type="button"
        onClick={toggleHideRoutines}
        title={hideRoutines ? 'Show daily activities' : 'Hide daily activities'}
        aria-label={hideRoutines ? 'Show daily' : 'Hide daily'}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
      >
        {createElement(hideRoutines ? EyeOff : Eye, { className: 'w-5 h-5' })}
        <span>{hideRoutines ? 'Show daily' : 'Hide daily'}</span>
      </button>
      <button
        type="button"
        onClick={printList}
        title="Print a compact list of this day"
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
      >
        <Printer className="w-5 h-5" />
        <span>Print list</span>
      </button>
    </TodayOverflowMenu>
  )

  // The top group's shared column (PAGE_COLUMN_WIDE) on desktop, so the
  // masthead cards line up page to page; full-bleed on phones for the
  // timeline (px-0), which is why this isn't the constant itself. Centred
  // under the header like every other page's column — see pageLayout.ts.
  const desktopToolbar = (
                  <div
                    data-testid="today-controls"
                    className="hidden shrink-0 md:flex items-center gap-1"
                  >
              {/* The week/month LISTS — separate dropdowns, deliberately OUTSIDE
                  the review drawer. Always rendered (a place to look must always
                  be there). Each row leads with the daily gesture — tick, or
                  "Do today" from the week list / "This week" from the month
                  list — with the triage verbs behind ⋯ (planning lists, Step 4). */}
              {!desktopControls && <HorizonPoolDropdown
                label="This week"
                referenceKind="week"
                referenceDate={currentWeekStart}
                tasks={weekPool}
                offer={['today', 'tomorrow', 'someday', 'deleted']}
                lead="today"
                emptyCopy="Nothing on this week's list."
                viewedDate={viewedDate}
                onUpdateTask={(id, u) => onUpdateTask?.(id, u)}
                onPushTask={ctx.onPushTask}
                onDeleteTask={ctx.onDeleteTask}
                onCompleteTask={onToggleTask}
                benchRoute="/week"
                benchLabel="Open this week"
              />}
              {!desktopControls && <HorizonPoolDropdown
                label="This month"
                referenceKind="month"
                tasks={monthPool}
                offer={['week', 'today', 'someday', 'deleted']}
                lead="week"
                emptyCopy="Nothing on this month's list."
                placedFor={(t) => placementFate(t, tasks)}
                viewedDate={viewedDate}
                onUpdateTask={(id, u) => onUpdateTask?.(id, u)}
                onPushTask={ctx.onPushTask}
                onDeleteTask={ctx.onDeleteTask}
                onCompleteTask={onToggleTask}
              />}

              {/* People: the top bar's (HeaderPeopleFilter), one lens for
                  every page; phones fold it into the Filters control below. */}

              {!isMobile && overflowMenu}
            </div>
  )

  // ── The journal split (journalSplit.ts) ──────────────────────────────
  const journal = useMemo(
    () => splitTodayJournal(data.grouped, { isToday: data.isToday, now: new Date(nowTick), upNextId }),
    [data.grouped, data.isToday, nowTick, upNextId],
  )
  // Earlier today folds by default, per day: unfolding it is about this
  // reading of this day, not a standing preference.
  const focusWork = useMemo(() => splitCompletedFocus(journal.focus), [journal.focus])
  // The untimed routines get their own small heading under the tasks, as long
  // as that is all they are.
  const focusRoutinesOnly = (focusWork.active.unscheduled ?? []).length > 0 &&
    (focusWork.active.unscheduled ?? []).every((i) => i.type === 'routine' || i.type === 'routine-collection')
  // The timed day, all of it — past rows included: the column shows them
  // where they fell, faded, instead of folding them away.
  const timedItems = useMemo(
    () => TIMED_SECTIONS.flatMap((section) => data.grouped[section] ?? []),
    [data.grouped],
  )
  // Who carries each thing on the day column — the same people the list's
  // avatars show, and nothing for an id the household doesn't know.
  const peopleOf = useCallback((item: TimelineItem) => {
    const ids = item.type === 'event'
      ? ctx.eventNotesMap?.get(item.id.replace('event-', ''))?.assignedToAll ?? []
      : item.type === 'task'
        ? item.originalTask?.assignedToAll ?? []
        : item.owners ?? item.originalRoutine?.assigned_to_all ?? []
    const all = [...(item.assignedTo ? [item.assignedTo] : []), ...ids]
    return [...new Set(all)].flatMap((id) => familyMembers.find((m) => m.id === id) ?? [])
  }, [ctx.eventNotesMap, familyMembers])
  const filtersNarrowing = layers.size < ALL_LAYERS.size || (selectedAssignees?.length ?? 0) > 0
  const showEverything = useCallback(() => {
    showAllDomains()
    onSelectAssignees?.([])
  }, [showAllDomains, onSelectAssignees])
  const [completedOpenDay, setCompletedOpenDay] = useState<string | null>(null)
  const completedOpen = completedOpenDay === localYmd(viewedDate)
  // "Add task" beside the date opens the add box at the head of Tasks; the
  // box unmounts when it closes itself. Keyed by day so a day change closes it.
  const [addOpenDay, setAddOpenDay] = useState<string | null>(null)
  useEffect(() => {
    const open = () => setAddOpenDay(localYmd(viewedDate))
    window.addEventListener('symphony:add-today', open)
    return () => window.removeEventListener('symphony:add-today', open)
  }, [viewedDate])
  const addOpen = addOpenDay === localYmd(viewedDate)
  const canAdd = data.isToday && !!(ctx.onCreateTaskParsed ?? ctx.onCreateTask)
  // The page's two controls sit on the "For today" heading (approved white
  // journal, 2026-09-22): one Choose, one Add task. Nothing by the date.
  // Phones add through the floating capture bar instead (native layout).
  const addTaskButton = canAdd && !isMobile ? (
    <button
      type="button"
      onClick={() => setAddOpenDay(addOpen ? null : localYmd(viewedDate))}
      aria-expanded={addOpen}
      className="daybook-add-task inline-flex items-center gap-1 py-1.5 text-[13px] font-medium text-primary-600 transition-colors hover:text-primary-700"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      Add task
    </button>
  ) : undefined
  // What each row serves, at rest — the Week list's "↳ Step toward …" /
  // "↳ From …" line (walkthrough 2026-10-02, #24). Read from this page's own
  // filtered tasks, so a parent outside the reader's view is never named.
  const servesFor = useCallback((task: Task) => {
    if (task.completed) return undefined
    const parent = parentLinkOf(task, (id) => tasksMap.get(id))
    return parent ? <ServesLine parent={parent} onOpen={(id) => handleSelectItem(`task-${id}`)} /> : undefined
  }, [tasksMap, handleSelectItem])

  // A pending change card's marks on the rows (todayPreview.ts). A row the
  // card draws again elsewhere on the day is left out where it is now.
  const previewOf = useCallback((item: TimelineItem) => {
    const mark = markForRow(preview, item.id)
    return mark === 'hidden' ? undefined : mark
  }, [preview])
  const notHidden = useCallback((item: TimelineItem) => markForRow(preview, item.id) !== 'hidden', [preview])
  const focusActive = useMemo(() => {
    const out = { ...focusWork.active }
    for (const key of Object.keys(out) as DaySection[]) out[key] = (out[key] ?? []).filter(notHidden)
    return out
  }, [focusWork.active, notHidden])
  const shownTimedItems = useMemo(() => timedItems.filter(notHidden), [timedItems, notHidden])
  const proposedUntimed = preview.added.filter((a) => !a.time)
  const proposedTimed = preview.added.filter((a) => a.time)

  // Everything each slice of the journal shares — the same rows and actions
  // the one flat list had, handed to three renders of it. Rows: tick, drag,
  // tap to open; the item panel holds every other job (spec 2026-10-14).
  const listProps = {
    servesFor,
    isReadOnlyEvent,
    viewedDate,
    isMobile,
    selectedItemId,
    upNextId,
    upNextStatus,
    now: new Date(nowTick),
    firstSectionItemId,
    collapsedKeys,
    openedByUser,
    onToggleSection: toggleSection,
    previewOf,
    tasksMap,
    shareNudgeByEventId,
    parserContext,
    insert,
    onSelectItem: handleSelectItem,
    onToggleTask,
    onCompleteRoutine,
    onCompleteEvent,
    panelOpen,
    onClosePanel,
    renamingGroupId,
    onRenameGroupDone: () => setRenamingGroupId(null),
    currentMemberId: meId,
  }

  return (
    // @container: the day and its week column split on the page's own width
    // (no ancestor declared one, so the old decision rail never went beside).
    // Width: the reading column (PAGE_COLUMN, 1040px of content) — or, with
    // the week column beside the day, a planning page that fills the screen.
    // In the connected workspace Today always shares the planning frame, so
    // Today, Week, Plan and Routines have one shape (Scott, 2026-10-10).
    <div className={`today-page @container w-full ${showWeek || alongsideWorkspace ? `max-w-[1712px] ${PLANNING_PAGE_CLASS}` : 'max-w-[1152px]'} mx-auto px-0 py-2 md:px-10 lg:px-14 md:pt-2 md:pb-8`}>
      {/* Today's filter and ⋯ live in its heading beside the lens and the
          assistant, as every horizon's page controls do — the top bar is the
          same on every page (2026-09-29). */}
      {/* Mounted only while printing. Keeping it permanently in the DOM would
          duplicate every title — invisible to the eye (CSS-hidden) but very
          real to screen readers and to any getByText. */}
      {printing && (
        <PrintableDayList
          date={viewedDate}
          sectionsOrder={data.sectionsOrder}
          grouped={data.grouped}
          overdue={data.overdueTasks}
        />
      )}
      {/* Phone: one Filters control (life areas + people) and ⋯ join the
          horizon-tab row, so the date and the day's work come first. Plan from
          paper lives in Add (2026-09-22). */}
      {isMobile && (
        <MobilePlanControls>
          <PhoneFilterControl
            selectedAssignees={selectedAssignees ?? []}
            onSelectAssignees={onSelectAssignees}
            assigneesWithTasks={assigneesWithTasks ?? []}
            hasUnassignedTasks={!!hasUnassignedTasks}
          />
          {overflowMenu}
        </MobilePlanControls>
      )}

      {/* Needs your OK — COS-proposed actions awaiting approval. Top of Today
          so the assistant's proposals are the first thing you can clear in a
          tap. Renders nothing when the queue is empty. */}
      {data.isToday && (
        <div className="px-4 md:px-0">
          <NeedsYourOK />
        </div>
      )}


      {/* An open masthead and continuous agenda give Today the shape of a daybook. */}
      <MastheadCard
        variant="daybook"
        // The date gives the page its identity; the chosen work gives it its
        // purpose (2026-09-19). The eyebrow says where the day sits — Today,
        // Tomorrow, a weekday — and still opens the date picker.
        eyebrow={<DayNavCluster viewedDate={viewedDate} onDateChange={onDateChange} variant="inline" label={data.isToday ? 'Today' : relativeDayLabel} />}
        title={viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        // No big numeral (approved Today board, 2026-10-10): the date is the title.
        // Adding moved to the "For today" heading with Choose (2026-09-22):
        // the date is the page's identity, the heading holds its two verbs.
        // The subline is the day in one sentence (daySentence.ts, "Today,
        // trimmed" 2026-10-14), with the week and weather small after it.
        // Desktop folds the control row into the masthead (layout system,
        // 2026-10-01): the view controls sit at the title's right.
        subline={foldedControls
          ? <>{headerSentence}{headerSentence && ' '}<span className="today-sentence-meta">{weekLine}{data.isToday && <> · <WeatherChip now={nowForDisplay} /></>}</span></>
          : headerSentence ?? undefined}
        // Domain chooser + assistant toggle, in the card's corner.
        // Desktop: the page's controls sit in the control row below, as on
        // every horizon (Scott, 2026-09-30). The masthead keeps them only where
        // there is no control row to hold them.
        controls={foldedControls
          ? <div className="flex items-center gap-1">{desktopToolbar}{!alongsideWorkspace && <ViewSwitch view={todayView} onChange={setTodayView} aboveName={`week ${weekNo}`} withFocus={false} />}</div>
          : headerControls}
        // The masthead's ear: today's weather, one quiet line. The feed only
        // knows today, so another day's page says nothing rather than
        // showing today's sky over Saturday. With the controls folded into
        // the masthead it sits in the subline beside the week, next to the day
        // it describes (2026-10-06; it had moved to the top bar 2026-09-30).
        aside={data.isToday && !foldedControls ? <WeatherChip now={nowForDisplay} /> : undefined}
        // Shell desktop controls live in the page navigation; standalone
        // mounts retain the footer controls as a fallback.
        // Standalone mounts keep their controls along the foot; in the Shell
        // there is no foot row at all (it was an empty ruled row, 2026-09-23).
        footer={!desktopControls ? desktopToolbar : undefined}

      />
      {/* Phones have no conversation bar: the page offers the same walk. */}
      {pageWalk && (
        <div className="today-walk px-4 md:px-0">
          <button type="button" className="pv2-btn" data-explain="plan-walk" data-explain-label={pageWalk.label}
            onClick={() => openAssistant({ message: pageWalk.message, autoSend: true })}>{pageWalk.label}</button>
        </div>
      )}
      {/* Notices sit under the heading on every destination (one page shape). */}
      <div className="px-4 md:px-0 empty:hidden"><CalendarReconnectBanner /></div>


      {/* The same control row every horizon has: what the column beside is,
          and the view icons (list, or with the level above). */}
      <GuideAnchor />
      {!foldedControls && (
        <div className="pv2-toolbar today-toolbar px-4 md:px-0">
          <div className="pv2-status"><span className="pv2-hint">{weekLine}</span></div>
          {!alongsideWorkspace && <ViewSwitch view={todayView} onChange={setTodayView} aboveName={`week ${weekNo}`} withFocus={false} />}
        </div>
      )}
      {/* The column beside the day: the week (and anything needing a
          decision). The day gets the full width only when there is none. */}
      {/* With the week beside it, the day and the week each scroll on their
          own (Scott, 2026-10-05), as Week and Month do: useColumnsFitWindow
          sizes them to the window, layout-system.css scrolls them. */}
      <div ref={splitRef} className={`px-4 md:px-0 ${showWeek ? 'today-split is-colscroll @[48rem]:grid @[48rem]:grid-cols-[minmax(0,1fr)_280px] @[48rem]:items-start @[48rem]:gap-9' : ''}`}>
        <main className="min-w-0">
          {/* The "N need a decision" banner that stood here at narrow widths
              is gone (Scott, 2026-09-21): a count on Today is a scoreboard,
              and it sent you to the Inbox. Unfinished work now has one quiet
              line below Tasks — "Review unfinished work" — that opens the
              Planning panel with that list expanded; email captures keep the
              footer's "New from email", suggestions the ⋯ menu. */}
      {/* The agenda is part of the page, with no enclosing card. */}
      <div ref={listRef} {...agendaDrop} className={`daybook-agenda${agendaDropOver ? ' daybook-agenda-drop' : ''}`}>
        {/* Needed today — hand-curated, silent when empty. Placed first so a
            marked item reads as the day's opening note, not buried under the
            timeline. Safe at the top only because it renders nothing when
            nothing is marked (see NeededTodayNote). */}
        <NeededTodayNote
          tasks={tasks}
          viewedDate={viewedDate}
          // Only the evening "Tomorrow" group draws a pill, and only to say
          // whose bag has to be packed before the morning.
          members={familyMembers}
          onToggleTask={onToggleTask}
          onOpenTask={(id) => handleSelectItem(`task-${id}`)}
          // Into the temporal flow: same write shape as a drop on the day
          // above — scheduled_for implies bucket 'timed', and isAllDay is
          // always a real boolean (the invariant pair).
          onScheduleTask={(id, date, isAllDay) => onUpdateTask?.(id, { bucket: 'timed', scheduledFor: date, isAllDay })}
          onScheduleListItem={ctx.onScheduleListItemAsTask}
        />

        {loading && data.counts.totalItems === 0 ? (
          // While the day's data is still in flight, an empty list means "not
          // loaded yet" — never a false "nothing chosen" flash.
          <p className="py-16 text-center font-display text-xl text-neutral-700">Loading your day…</p>
        ) : (
          <TodayDragProvider
            resolve={resolve}
            onIntents={(intents) => { void applyIntents(intents) }}
            renderOverlay={(activeId) => {
              const item = findTimelineItem(data.grouped, activeId)
              return item ? (
                <div className="inline-flex max-w-[22rem] items-center gap-2 rounded-xl border border-primary-200 bg-bg-elevated px-3 py-2 text-sm shadow-lg">
                  <GripVertical className="h-4 w-4 shrink-0 text-neutral-400" />
                  <span className="truncate">{item.title}</span>
                </div>
              ) : null
            }}
          >
          {/* The day, to scale (Scott, 2026-10-06, option B): the timed day
              drawn as hours beside what you chose for it. Week arranges the
              commitments; Today is where you settle into a few of them and
              see where they fit. For today comes first in the page's order
              (and on a phone); on a wide page the day sits on the left. */}
          <div className="today-cols">
          <div className="today-cols-grid">
          <section aria-labelledby="today-focus-heading" className="daybook-journal-section today-focus-card">
          {/* A task dragged here off the day keeps the day, loses its time. */}
          <ForTodayDropZone>
            <div className="daybook-journal-heading">
              {/* "For today" holds the page's verb (approved white journal,
                  2026-09-22): Add task opens the add box at the head of
                  this list. */}
              <h2 id="today-focus-heading">{data.isToday ? 'For today' : 'For this day'}</h2>
              <div className="daybook-heading-actions">
                {addTaskButton}
              </div>
            </div>
            {/* The add box, at the head of the list it adds to. Mounted only
                while open; it unmounts itself on Escape or an empty blur. */}
            {addOpen && canAdd && (
              <div className="mt-2 mb-1">
                <TodayAddInput
                  key={localYmd(viewedDate)}
                  defaultExpanded
                  onCollapse={() => setAddOpenDay(null)}
                  onAdd={ctx.onCreateTaskParsed!}
                  parserContext={ctx.parserContext!}
                  resolver={ctx.resolverContext!}
                  getRecentTaskForContact={ctx.getRecentTaskForContact}
                />
              </div>
            )}
            {tasksLoadFailed && onRetryTasks && (
              <LoadFailedNotice title="Today didn’t load." body="Your tasks are safe — this is a connection problem." onRetry={onRetryTasks} />
            )}
            {focusWork.activeCount > 0 ? (
              <>
                {/* A filtered list cannot use full-day gap indices. Direct
                    entry stays on Add task; a time comes from the day. */}
                <TodaySectionList
                  {...listProps}
                  sectionsOrder={['allday']}
                  grouped={focusActive}
                  dropTargets={false}
                  anytimeHeader={false}
                />
                {focusRoutinesOnly && <div className="today-subhead">Routines today</div>}
                <TodaySectionList
                  {...listProps}
                  sectionsOrder={['unscheduled']}
                  grouped={focusActive}
                  dropTargets={false}
                  anytimeHeader={false}
                />
                {!isMobile && <p className="today-drag-hint">Drag a task onto the day to give it a time.</p>}
              </>
            ) : loading ? (
              // The tasks are still on their way even though the calendar has
              // arrived (the page shows once anything has): an empty list
              // here would say "Nothing chosen yet" over a day that has work
              // (2026-10-07, seen on prod during a slow load).
              <p className="py-4 text-[15px] text-neutral-500">Loading your list…</p>
            ) : tasksLoadFailed && onRetryTasks ? null : (
              // One door to the chooser (the labelled Shelves button),
              // one to adding (Add task by the date) — the empty list says
              // what those are for and offers no third prompt (Scott via
              // Codex, 2026-09-22).
              <div className="py-4">
                <p className="font-display text-lg text-neutral-600">{focusWork.completedCount ? 'Everything on your list is done.' : 'Nothing chosen yet.'}</p>
                <p className="mt-1 text-[14px] text-neutral-500">
                  {showWeek
                    ? <>Choose from week {weekNo} {isMobile ? 'below' : 'beside this list'}, or add something for {data.isToday ? 'today' : 'this day'}.</>
                    : <>Add something for {data.isToday ? 'today' : 'this day'}, or{' '}
                        <button type="button" className="text-primary-700 underline underline-offset-2" onClick={() => setTodayView('ref')}>show week {weekNo}</button> to choose from it.</>}
                </p>
                {/* Say when the view is narrowed, so an empty filtered list
                    isn't read as an empty day. No hidden counts. */}
                {filtersNarrowing && (
                  <p className="mt-2 text-[14px] text-neutral-500">
                    Area or person filters are on.{' '}
                    <button type="button" onClick={showEverything} className="font-medium text-primary-600 underline-offset-2 hover:underline">
                      Show everything
                    </button>
                  </p>
                )}
              </div>
            )}
            {/* A pending change card's untimed arrivals, dashed. */}
            {proposedUntimed.length > 0 && (
              <ul className="today-proposed-list">
                {proposedUntimed.map((a) => (
                  <li key={a.key} className="today-preview-row is-proposed" data-testid="proposed-row">
                    <span className="today-preview-title">{a.title}</span>
                    {a.note && <span className="wc-proposed-note">{a.note}</span>}
                    <span className="sr-only"> (proposed, not saved yet)</span>
                  </li>
                ))}
              </ul>
            )}
            {focusWork.completedCount > 0 && <div className="today-completed">
              <button type="button" aria-expanded={completedOpen} onClick={() => setCompletedOpenDay(completedOpen ? null : localYmd(viewedDate))}>
                {completedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Completed · {focusWork.completedCount}
              </button>
              {completedOpen && <TodaySectionList {...listProps} sectionsOrder={FOCUS_SECTIONS} grouped={focusWork.completed} anytimeHeader={false} dropTargets={false} />}
            </div>}
            {/* To talk about: open talk-abouts (flagged tasks), one quiet
                line, each a chip that opens the item. Silent when none. */}
            {(discussion.length > 0 || preview.talk.length > 0) && (
              <div className="today-talk" aria-label="To talk about" role="group">
                <span className="today-talk-label">To talk about</span>
                {discussion.map((d) => (
                  <button key={d.id} type="button" className="today-talk-chip" onClick={() => handleSelectItem(`task-${d.id}`)}>
                    {d.title}{d.note ? ` · ${d.note}` : ''}
                  </button>
                ))}
                {preview.talk.map((t) => (
                  <span key={t.key} className="today-talk-chip is-proposed" data-testid="proposed-talk">
                    {t.title}{t.note ? ` · ${t.note}` : ''}
                    <span className="sr-only"> (proposed, not saved yet)</span>
                  </span>
                ))}
              </div>
            )}
          </ForTodayDropZone>
          </section>

          <section aria-labelledby="today-day-heading" className="daybook-journal-section today-day-section">
            <div className="daybook-journal-heading">
              <h2 id="today-day-heading">The day</h2>
              {/* Late in the day the spent morning took most of the column
                  (review, 2026-10-07): the rest of the day can take it, the
                  whole day one click back. Remembered on this device. */}
              {canHideEarlier && (
                <div className="daybook-heading-actions">
                  <button type="button" className="today-scale-toggle" aria-pressed={hideEarlier} onClick={() => setHideEarlier(!hideEarlier)}>
                    {hideEarlier ? 'Show the whole day' : 'Hide earlier hours'}
                  </button>
                </div>
              )}
            </div>
            {journal.allDayEvents.length > 0 && (
              <ul className="daybook-journal-allday" aria-label="All day">
                {journal.allDayEvents.map((ev) => {
                  // The kids' specials as chips, one per kid (2026-10-06).
                  const specials = parseSpecials(ev.title)
                  return (
                    <li key={ev.id}>
                      {specials ? (
                        <button type="button" className="today-specials" aria-label={ev.title} onClick={() => handleSelectItem(ev.id)}>
                          {specials.map((sp) => <span key={sp.who} className="today-special-chip"><span>{sp.who}</span>{sp.special}</span>)}
                        </button>
                      ) : (
                        <button type="button" onClick={() => handleSelectItem(ev.id)}>{ev.title}</button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <TodayDayScale
              items={shownTimedItems}
              markOf={previewOf}
              proposed={proposedTimed}
              viewedDate={viewedDate}
              now={data.isToday ? nowForDisplay : null}
              isMobile={isMobile}
              selectedItemId={selectedItemId}
              upNextId={upNextId}
              peopleOf={peopleOf}
              isReadOnlyEvent={isReadOnlyEvent}
              onSelect={handleSelectItem}
              onPlanDrop={(payload, when) => { void planActions.drop(payload, { type: 'time', when }) }}
              fromHour={canHideEarlier && hideEarlier ? earlierCutoff : null}
              handleRef={scaleRef}
            />
            {timedItems.length === 0 && (
              <p className="today-scale-note">
                {/* "Clear" is a claim: connected, synced, and no layer filtered
                    out. Otherwise say only what is shown — a hidden Personal
                    calendar under a Family filter is not a clear day. */}
                {data.isToday
                  ? (calendarConnected && !calendarError && layers.size === ALL_LAYERS.size
                      ? 'Nothing with a time today. Your calendar is clear.'
                      : calendarConnected
                        ? 'Nothing with a time today. No events shown for your current view.'
                        : 'Nothing with a time today.')
                  : 'Nothing with a time on this day.'}
              </p>
            )}
          </section>
          </div>
          </div>
          {/* What is dated in the days after this one — quiet, and silent
              when there is nothing (walkthrough 2026-10-02, #28). */}
          <TodayComingUp items={comingUpItems} onOpen={(id) => handleSelectItem(`task-${id}`)} />
          {/* Below the schedule, not above the date: the one planning
              reminder Today carries (2026-09-22). */}
          {data.isToday && afterSchedule}
          {/* Review preview only (?edition=sample): labelled sample text,
              after the work and the schedule, never before them. */}
          {data.isToday && editionPreview && <DailyEditionPreview onHide={hideEditionPreview} />}
          </TodayDragProvider>
        )}

      </div>
        </main>

        {/* Today is the day alone unless its week is asked for (Scott,
            2026-09-30): the by-hand way to pull one task in. */}
        {showWeek && (
        <aside className="today-aside mt-6 @[48rem]:mt-0">
          {showWeek && (
            <TodayWeekColumn plan={data.dayPlan} day={viewedDate} weekNo={weekNo}
              weekStart={weekStartAnchor(viewedDate, readCadenceConfig().weekStartsOn)} actions={planPanelActions}
              nextWeek={nextWeek} onHide={() => setTodayView('list')}
              findTask={(id) => tasksMap.get(id)} openTask={(id) => handleSelectItem(`task-${id}`)}
              chooseTask={(id) => planActions.chooseTaskDay(id, viewedDate)}
              restoreTask={(id, prev) => ctx.onUpdateTask?.(id, prev)} />
          )}
        </aside>
        )}
      </div>

      {/* Phone: the floating capture bar above the dock (native TodayView). */}
      {isMobile && canAdd && (
        <PhoneCaptureBar>
          <TodayAddInput
            variant="bar"
            onAdd={ctx.onCreateTaskParsed!}
            parserContext={ctx.parserContext!}
            resolver={ctx.resolverContext!}
            getRecentTaskForContact={ctx.getRecentTaskForContact}
          />
        </PhoneCaptureBar>
      )}

      {/* Timeline note composer (radial wheel → "Note" pick) */}
      {insert.noteComposer && (
        <TimelineNoteComposer
          anchor={insert.noteComposer.anchor}
          existingNotes={(timelineNotes ?? []).map(n => ({ id: n.id, title: n.title, content: n.content }))}
          onCreateNew={(c, a) => onCreateNoteAt?.(c, a)}
          onAppendExisting={(id, b, a) => onAppendNoteAt?.(id, b, a)}
          onLinkExisting={(id) => onLinkNote?.(id)}
          onClose={insert.closeNoteComposer}
        />
      )}
    </div>
  )
}
