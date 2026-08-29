// src/apps/tasks/horizons/shared.tsx
//
// Shared plumbing for the horizon pages (Week/Month/Season/Year/Someday),
// extracted mechanically from the former HorizonView.tsx monolith.
//
// `useHorizonPageData(horizon)` is the data-wiring hook every page calls: the
// wiring (which hooks fire, in which order, with which deps) is IDENTICAL
// across horizons today — only the returned values differ by content, and
// only the JSX each page renders differs by horizon. Per-page redesigns
// (Tasks 3–5) will diverge the hook usage per page; until then this hook is
// the single source of truth so behavior cannot drift between pages.
//
// CascadeRail is the one presentational piece genuinely identical across
// every page (Week/Month/Season/Year all render it) — hoisted verbatim.

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Plus, ChevronRight, Check } from 'lucide-react';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useSharpenBet } from '@/hooks/useSharpenBet';
import { useGoogleCalendar, type CalendarEvent } from '@/hooks/useGoogleCalendar';
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible';
import { useEventNotes } from '@/hooks/useEventNotes';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useRoutines } from '@/hooks/useRoutines';
import { useActionableInstances } from '@/hooks/useActionableInstances';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useHiddenCalendarEvents } from '@/hooks/useHiddenCalendarEvents';
import { useScheduleActions } from '@/hooks/useScheduleActions';
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions';
import { useDomain } from '@/hooks/useDomain';
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings';
import { useListsContext } from '@/contexts/ListsContext';
import type { ScheduleActionsValue } from '@/contexts/ScheduleActionsContext';
import { useUndo } from '@/hooks/useUndo';
import { useSelection } from '@/shell/providers/SelectionProvider';
import { DenseInboxRow } from '@/components/schedule/DenseInboxRow';
import { TriageWhenMenu, type TriageWhen } from '@/components/schedule/TriageWhenMenu';
import { selectOverdue } from '@/lib/today/taskPools';
import { selectHorizonPool, selectPlacedInWeek, selectStaleWeekPlacements, HORIZONS, type HorizonId } from '@/lib/today/horizons';
import { belongsToWeek } from '@/lib/today/weekPlacement';
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config';
import { matchesLayers, filterEventsForLayers, domainSessionToken } from '@/lib/today/domainFilter';
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter';
import { useConvertTaskToProject } from '@/hooks/useConvertTaskToProject';
import { applyTriageWhen } from '@/lib/triage/applyWhen';
import { useGoalsContext } from '@/contexts/GoalsContext';
import { periodLabel, periodProgress } from '@/lib/cadence/periods';
import { lineageLabel, inheritedLineage } from '@/lib/planning/lineage';
import { SeasonMoveSuggestions } from '@/components/planning/SeasonMoveSuggestions';
import { EXPLAINER_SCENES } from '@/components/planning/explainers/scenes';
import { usePlanningSession } from '@/hooks/usePlanningSession';
import { guidedPeriod } from '@/components/planning/guided/periods';
import { partitionSeason, PICK_CAP } from '@/lib/planning/betPulse';
import type { Task, TaskContext } from '@/types/task';

// ── The cascade rail: the rhythm spine rendered as a walkable path, with the
// current rung emphasized and live counts on the bucketed rungs. This is what
// makes the year → season → month → week → today trickle-down *visible*. ──
const RAIL_ORDER: HorizonId[] = ['year', 'season', 'month', 'week', 'today'];

export function CascadeRail({ current, counts, onGo }: {
  current: HorizonId;
  counts: Partial<Record<HorizonId, number>>;
  onGo: (h: HorizonId) => void;
}) {
  return (
    <nav aria-label="Planning cascade" className="flex items-center gap-1 flex-wrap">
      {RAIL_ORDER.map((id, i) => {
        const def = HORIZONS.find((h) => h.id === id);
        if (!def) return null;
        const isCurrent = id === current;
        const count = counts[id];
        const short = id === 'today' ? 'Today' : def.label.replace(/^This /, '');
        return (
          <span key={id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-neutral-300" aria-hidden />}
            <button
              type="button"
              onClick={() => onGo(id)}
              aria-current={isCurrent ? 'page' : undefined}
              className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                isCurrent
                  ? 'bg-primary-600 text-white'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
              }`}
            >
              {short}
              {typeof count === 'number' && count > 0 && (
                <span
                  className={`ml-1.5 inline-block min-w-[16px] text-center text-[10px] leading-4 px-1 rounded-full ${
                    isCurrent ? 'bg-white/25 text-white' : 'bg-neutral-200/70 text-neutral-500'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

export interface ReferenceItem {
  id: string;
  title: string;
  goalId?: string;
  lineage?: { sourceId?: string; goalId?: string };
}

/** Everything a horizon page needs to render — identical wiring for every
 * horizon, differing only by the `horizon` passed in and the data it turns
 * up. See file header for why this lives as one hook.
 *
 * `anchorDate` (week only): when the Week page is anchored on a specific
 * week via `?start=`, the caller passes that week's start date so the grid
 * task filter window follows the anchored week instead of the current one —
 * otherwise `/week?start=<a past/future week>` always computes against
 * *this* week and the grid renders empty for any week that isn't current.
 * Pool/carry-over/placed stay bucket-based (current week only) by design —
 * see WeekPage.tsx for the seam comment. */
export function useHorizonPageData(horizon: HorizonId, anchorDate?: Date) {
  const navigate = useNavigate();
  const def = HORIZONS.find((h) => h.id === horizon);

  const {
    tasks, addTask, toggleTask, toggleWaiting, deleteTask, updateTask, updateTasksBulk, pushTask, setBucket,
  } = useSupabaseTasks();
  const { events, fetchEvents, isConnected: calendarConnected } = useGoogleCalendar();

  // Each rung needs its OWN span of calendar. The shell (useShellChrome.ts) only
  // ever loads today→+7d, so before this the year page drew twelve months out of
  // one week and the ribbon would have shipped beautiful and empty.
  //
  // But fetchEvents REPLACES the app-wide provider cache as a side effect (it's
  // shared with Today's timeline), so a rung that merely called it would (a) get
  // clobbered by whichever fetch resolved last — the shell's week and this one
  // race on mount — and (b) leave Today holding a year of events. Verified on
  // 5173: the endpoint returned 291 events for the year while the page rendered
  // August as empty, because the shell's 8-event week landed second.
  //
  // So keep this rung's own copy, exactly as CalendarStep does for the same
  // reason, and fall back to the shared array until it arrives.
  const [periodEvents, setPeriodEvents] = useState<CalendarEvent[] | null>(null);
  const guidedHorizon = horizon === 'year' ? 'annual'
    : horizon === 'season' ? 'seasonal'
    : horizon === 'month' ? 'monthly'
    : horizon === 'week' ? 'weekly'
    : null;
  // Keyed on calendarConnected, not just mount: the provider re-validates the
  // Google connection asynchronously, so a mount-time fetch returns [] and the
  // rung would be stranded on that empty snapshot forever — past weeks reading
  // "nothing claimed yet" while the calendar holds a trip. Same guard
  // CalendarStep uses, and the same reason.
  const periodRequestRef = useRef(0);
  const fetchPeriodEvents = useCallback(() => {
    if (!guidedHorizon || !calendarConnected) return Promise.resolve();
    const { start, end } = guidedPeriod(guidedHorizon);
    const requestId = ++periodRequestRef.current;
    // Promise.resolve wrap: fetchEvents returns [] synchronously when the
    // calendar isn't connected, and test doubles return undefined.
    return Promise.resolve(fetchEvents(start, end)).then((result) => {
      // Drop a response a newer request (horizon switch, visibility refresh)
      // already superseded — otherwise it lands on the wrong period.
      if (requestId !== periodRequestRef.current) return;
      if (Array.isArray(result)) setPeriodEvents(result);
    });
  }, [guidedHorizon, fetchEvents, calendarConnected]);

  useEffect(() => {
    void fetchPeriodEvents();
  }, [fetchPeriodEvents]);

  // Nothing polls Google events, so without this the rung stays pinned to the
  // snapshot it took on mount — same staleness Today had.
  useRefreshOnVisible(fetchPeriodEvents, { enabled: calendarConnected });
  const rungEvents = periodEvents ?? events;
  // Event ids opt in to auto-loaded, realtime event notes (see useEventNotes)
  const visibleEventIds = useMemo(() => rungEvents.map((e) => e.google_event_id || e.id), [rungEvents]);
  const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject } = useEventNotes(visibleEventIds);
  const { contacts, contactsMap, addContact, searchContacts } = useContacts();
  const { projects, projectsMap, addProject, deleteProject } = useProjects();
  const { routines: allRoutines, updateRoutine, deleteRoutine } = useRoutines();
  const { markDone, undoDone, skip, reschedule } = useActionableInstances();
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers();
  const { hideEvent } = useHiddenCalendarEvents();
  const { getDomainForCalendar } = useCalendarDomainMappings();
  const { lists, listsByCategory } = useListsContext();
  const { layers, soleDomain } = useDomain();
  const undo = useUndo();

  const { setSelection } = useSelection();

  // ── Scope lens (W3 minimal: "Everyone"). The lens UI (Just me / Us /
  // Everyone) is a follow-up W3 step; the matcher is already plumbed so flipping
  // it later is a one-line change. ──
  const match = useMemo(() => makeAssigneeFilter([]), []);

  // ── Layer lens: the horizon pages follow the app's layer checklist like
  // the rest of the app. An item shows iff the layer its context maps to is
  // checked; untagged items are the Unsorted layer, not "everywhere". Filtered
  // ONCE here so the pool, carry-over, rail counts and reference panel all
  // agree. ──
  const domainTasks = useMemo(
    () => tasks.filter((t) => matchesLayers(t.context, layers)),
    [tasks, layers],
  );

  // ── Which week this page is looking at. Declared before the pool and the
  // carry-over because both are scoped to it: a month move placed on the week of
  // Aug 10 belongs to that week's list, not to every week's. Anchored to
  // `anchorDate` when viewing a specific week (`?start=`); otherwise the current
  // week. ──
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const weekAnchor = useMemo(
    () => weekStartAnchor(anchorDate ?? new Date(), readCadenceConfig().weekStartsOn),
    [anchorDate],
  );

  // ── The scoped pool + carry-over. THE INVARIANT lives here. ──
  // Carry-over is a near-term concept: it belongs to Today (rendered by
  // HomeView) and to the weekly working set ("what you didn't finish last
  // week"). It must NOT bleed into Month / Season / Year / Someday — those show
  // only their own pool. (Someday is timeless; nothing is ever "overdue" into
  // it.) Showing the global overdue set on every horizon was the bug where the
  // same 5 items appeared as "carried over" everywhere.
  //
  // TWO kinds of carry-over, and the second is the whole reason this exists:
  //  - overdue DATED items — a day came and went.
  //  - stale WEEK placements — a move placed on a week that never got a day, and
  //    that week has passed. Nothing rolls it forward on its own, and the week
  //    pool is scoped to the viewed week, so this channel is the only thing that
  //    puts it back in front of you. Without it the item is stranded on a page
  //    no one will open again.
  const showCarryOver = horizon === 'week';
  const carryOver = useMemo(() => {
    if (!showCarryOver) return [];
    const byId = new Map<string, Task>();
    for (const t of selectOverdue(domainTasks, true, match)) byId.set(t.id, t);
    for (const t of selectStaleWeekPlacements(domainTasks, weekAnchor, match)) byId.set(t.id, t);
    return [...byId.values()];
  }, [showCarryOver, domainTasks, match, weekAnchor]);

  // Just the stale week placements, for surfaces that explain WHY an item
  // carried over and offer the one-click fate that resolves it.
  const staleWeekPlacements = useMemo(
    () => (showCarryOver ? selectStaleWeekPlacements(domainTasks, weekAnchor, match) : []),
    [showCarryOver, domainTasks, weekAnchor, match],
  );

  const pool = useMemo(
    () => selectHorizonPool(domainTasks, horizon, match, weekAnchor),
    [domainTasks, horizon, match, weekAnchor],
  );

  // The week's placed rocks (bucket week→timed on scheduling drains the pool;
  // without this section a fully-placed plan reads as an empty week). Items
  // already surfaced as carried over (placed on a day now past) stay there —
  // this section is the still-ahead placements.
  const placedThisWeek = useMemo(() => {
    if (horizon !== 'week') return [];
    const carried = new Set(carryOver.map((t) => t.id));
    return selectPlacedInWeek(domainTasks, weekAnchor, match).filter((t) => !carried.has(t.id));
  }, [horizon, domainTasks, match, carryOver, weekAnchor]);

  // ── Week as a standing 7-day grid — the wizard's "place the big rocks"
  // surface living on the page (the week rung's calendar view, matching the
  // month/year grids). Same conventions as ScheduleGridStep: the grid opens
  // on today mid-week, refuses past-day drops, and keeps a placed rock
  // visible where it was dropped (bucket week→timed on scheduling). ──
  const weekGridStart = weekAnchor.getTime() > todayStart.getTime() ? weekAnchor : todayStart;
  const weekGridTasks = useMemo(() => {
    if (horizon !== 'week') return [];
    const end = new Date(weekAnchor); end.setDate(end.getDate() + 7);
    return domainTasks.filter((t) => {
      if (t.completed || !match(t.assignedTo, t.assignedToAll)) return false;
      // Only this week's week-bucket items — another week's placement isn't
      // waiting to be dropped onto these seven days.
      if (t.bucket === 'week') return belongsToWeek(t, weekAnchor);
      if (t.scheduledFor) {
        const d = new Date(t.scheduledFor);
        return d >= weekAnchor && d < end;
      }
      return false;
    });
  }, [horizon, domainTasks, match, weekAnchor]);

  // Live counts for the cascade rail (bucketed rungs only — today and year
  // have no bucket of their own). The week count uses the same week as the
  // pool, so the rail and the list can never disagree.
  const railCounts = useMemo(() => {
    const counts: Partial<Record<HorizonId, number>> = {};
    for (const h of HORIZONS) {
      if (h.bucket && h.bucket !== 'timed') counts[h.id] = selectHorizonPool(domainTasks, h.id, match, weekAnchor).length;
    }
    return counts;
  }, [domainTasks, match, weekAnchor]);

  // The level above, for reference — each level keeps its OWN list; planning
  // means LOOKING at the level above while writing this one. Month looks at
  // the season list; season looks at the year's goals. Read-only, folded by
  // default (this level's own list leads the page); auto-open on a blank
  // slate, where the level above is the invitation.
  const { areas, goals, addGoal } = useGoalsContext();
  // Season focus line — persisted in the per-domain planning_sessions notes
  // row for this season (key seasonFocus), the SAME row the wizard writes
  // (GuidedSession keys off domainSessionToken(period.token, domain), not the
  // bare token) — otherwise the focus line reads/writes a different row than
  // the domain the wizard actually ran in, and the line silently reverts.
  const seasonToken = useMemo(() => guidedPeriod('seasonal').token, []);
  const { notes: seasonNotes, patchNotes: patchSeasonNotes } = usePlanningSession(
    'seasonal',
    domainSessionToken(seasonToken, soleDomain),
  );
  // Reference rows carry their lineage payload so "Copy down" threads the
  // cascade: a month copy records its season source; a season line created
  // from a goal records the goal itself.
  const referenceItems = useMemo<ReferenceItem[]>(() => {
    if (horizon === 'month') {
      // The month draws from the CHOSEN season — picks only. The shelf (items
      // deliberately not picked) collapses separately below.
      return selectHorizonPool(domainTasks, 'season', match)
        .filter((t) => !!t.pickedAt)
        .map((t) => ({ id: t.id, title: t.title, lineage: inheritedLineage(t) }));
    }
    if (horizon === 'season') {
      return goals
        .filter((g) => g.status === 'active' && matchesLayers(g.context, layers))
        .map((g) => ({ id: g.id, title: g.name, goalId: g.id, lineage: { goalId: g.id } }));
    }
    return [];
  }, [horizon, domainTasks, match, goals, layers]);
  const referenceLabel = horizon === 'month' ? `Your ${periodLabel('season')?.split(' ')[0]} picks` : `Your ${new Date().getFullYear()} goals`;
  // "on this list" reads the lineage thread first (a copy renamed later still
  // counts); title equality is the pre-lineage fallback.
  const poolTitles = useMemo(() => new Set(pool.map((t) => t.title)), [pool]);
  const poolSourceIds = useMemo(() => new Set(pool.map((t) => t.sourceId).filter(Boolean)), [pool]);
  const poolGoalIds = useMemo(() => new Set(pool.map((t) => t.goalId).filter(Boolean)), [pool]);
  const isOnThisList = useCallback(
    (it: { id: string; title: string; goalId?: string }) =>
      poolTitles.has(it.title) || poolSourceIds.has(it.id) || (!!it.goalId && poolGoalIds.has(it.goalId)),
    [poolTitles, poolSourceIds, poolGoalIds],
  );
  const [refOpen, setRefOpen] = useState(false);
  const [refShelfOpen, setRefShelfOpen] = useState(false);
  // Month-only: the season's unchosen items, offered quietly for the rare grab.
  const referenceShelfItems = useMemo(() => {
    if (horizon !== 'month') return [] as ReferenceItem[];
    return selectHorizonPool(domainTasks, 'season', match)
      .filter((t) => !t.pickedAt)
      .map((t) => ({ id: t.id, title: t.title, lineage: inheritedLineage(t) }));
  }, [horizon, domainTasks, match]);
  // "What is this level?" explainer — opens on demand via the link, and once
  // automatically the first time a rung is visited (localStorage-gated so it
  // never nags on return visits).
  const [explainerOpen, setExplainerOpen] = useState(false);
  const hasExplainer = (EXPLAINER_SCENES[horizon]?.length ?? 0) > 0;
  useEffect(() => {
    // No script for this rung (someday) → no link, no auto-open.
    if ((EXPLAINER_SCENES[horizon]?.length ?? 0) === 0) return;
    const key = `symphony.explainerSeen.${horizon}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      setExplainerOpen(true);
    }
  }, [horizon]);
  // Year landscape: which month (0–11) is zoomed into, or null. The year grid
  // stays mounted underneath, so closing returns you to the landscape.
  const [zoomMonth, setZoomMonth] = useState<number | null>(null);
  // Goal-promotion translation prompt in the reference panel (season page):
  // which reference row is being translated, and the editable draft.
  const [translatingRefId, setTranslatingRefId] = useState<string | null>(null);
  const [refDraft, setRefDraft] = useState('');
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!autoOpenedRef.current && pool.length === 0 && referenceItems.length > 0) {
      autoOpenedRef.current = true;
      setRefOpen(true);
    }
  }, [pool.length, referenceItems.length]);

  // Where this rung sits in the cascade + how far through its period we are.
  const period = periodLabel(horizon);
  const progress = periodProgress(horizon);

  // ── Tap-to-detail via the global DetailPanel (SelectionProvider). ──
  const handleSelect = useCallback(
    (taskId: string) => setSelection({ kind: 'task', id: taskId }),
    [setSelection],
  );

  // ── Schedule actions (mirrors InboxViewContainer scaffolding). ──
  const viewedDate = useMemo(() => new Date(), []);
  const scheduleActions = useScheduleActions({
    tasks, events, allRoutines, familyMembers, viewedDate,
    updateTask, updateRoutine, deleteRoutine,
    updateEventAssignment, updateEventAssignmentAll,
    markDone, undoDone, skip, reschedule,
    refreshDateInstances: () => {},
    pushAction: undo.pushAction,
  });

  const eventContextOverrides = useMemo(() => {
    const overrides = new Map<string, TaskContext>();
    for (const [eventId, note] of eventNotesMap) {
      if (note.context) overrides.set(eventId, note.context);
    }
    return overrides;
  }, [eventNotesMap]);

  // Events on the month/year calendar grids scope to the checked layers just
  // like tasks — otherwise work-calendar events leak into Family/Personal.
  const domainEvents = useMemo(
    () => filterEventsForLayers(rungEvents, layers, { eventContextOverrides, getDomainForCalendar, eventNotesMap }),
    [rungEvents, layers, eventContextOverrides, getDomainForCalendar, eventNotesMap],
  );

  // Fresh domain tasks for the add callback's auto-pick count (a plain dep
  // would rebuild the callback on every task change for a rarely-used read).
  const tasksRefForAdd = useRef<readonly Task[]>([]);
  useEffect(() => { tasksRefForAdd.current = domainTasks; }, [domainTasks]);

  // Create INTO this horizon's bucket — not dated-today. A task added on the
  // This Month page belongs in the month pool, or it vanishes from the page
  // the moment it's created.
  const horizonBucket = def?.bucket && def.bucket !== 'timed' ? def.bucket : null;
  const onCreateTaskFromValue = useCallback(
    async (title: string, lineage?: { sourceId?: string; goalId?: string }) => {
      // Bucket rides the INSERT — a follow-up setBucket can race tasksRef
      // (temp→real id swap not yet rendered) and be silently dropped.
      // Season adds auto-pick while there's room (picking is explicit, but a
      // fresh outcome typed on the season page IS a choice); at the cap the
      // new item lands on the shelf for a deliberate swap. Rides the INSERT
      // (same temp-id race rationale as bucket).
      const autoPick =
        horizon === 'season' && partitionSeason(tasksRefForAdd.current).picks.length < PICK_CAP
          ? new Date()
          : undefined;
      await addTask(title, undefined, undefined, undefined, {
        assignedTo: getCurrentUserMember()?.id,
        context: undefined,
        bucket: horizonBucket ?? undefined,
        sourceId: lineage?.sourceId,
        goalId: lineage?.goalId,
        pickedAt: autoPick,
      });
    },
    [addTask, getCurrentUserMember, horizonBucket, horizon],
  );

  // Inline add-a-task draft for the pool section.
  const [draft, setDraft] = useState('');
  const composerRef = useRef<HTMLInputElement>(null);
  const { sharpen: sharpenBet, loading: sharpenBetLoading } = useSharpenBet();
  const submitDraft = useCallback(async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await onCreateTaskFromValue(title);
  }, [draft, onCreateTaskFromValue]);

  // Projects in motion — a month/season is mostly its projects, so the pool
  // groups by project (biggest first); loose tasks follow.
  const grouped = useMemo(() => {
    const byProject = new Map<string, Task[]>();
    const loose: Task[] = [];
    for (const t of pool) {
      const p = t.projectId ? projectsMap.get(t.projectId) : undefined;
      if (p) {
        const arr = byProject.get(p.id) ?? [];
        arr.push(t);
        byProject.set(p.id, arr);
      } else {
        loose.push(t);
      }
    }
    const groups = [...byProject.entries()]
      .map(([projectId, items]) => ({ project: projectsMap.get(projectId)!, items }))
      .sort((a, b) => b.items.length - a.items.length);
    return { groups, loose };
  }, [pool, projectsMap]);

  // Create a new project from a row's inline picker and attach the task to it.
  const handleCreateProjectForTask = useCallback(
    (taskId: string) => async (name: string, context: TaskContext | null) => {
      const project = await addProject({ name, context: context ?? undefined });
      if (!project) return;
      // The row's own picker already answered "where does this belong" for the
      // project — carry that answer to the TASK too, or an Unsorted task lands
      // in a Family project still tagged nothing and still scoped
      // 'individual': filed, invisible to the household, and never asked again
      // (a projectId write is one of the gated processes, and this path
      // supplies its own context, so nothing else will ever ask).
      // Only when the picker actually gave one — `context: undefined` is a
      // WRITE of null here (useSupabaseTasks:1189), which would clear a domain
      // rather than leave it alone.
      await updateTask(taskId, context ? { projectId: project.id, context } : { projectId: project.id });
    },
    [addProject, updateTask],
  );

  // Expand a task into a new project (subtasks absorbed, parent task deleted).
  const handleConvertTaskToProject = useConvertTaskToProject(tasks, { addProject, updateTask, deleteTask });

  // Overflow tray "Let it go" — a delete, but not a silent one. Mirrors the
  // standard undo pattern (useUndo.pushAction + UndoToast, same as the rest
  // of this page's schedule actions): capture the task's fields before the
  // delete lands, then undo recreates it from that snapshot. deleteTask
  // itself has no undo primitive (unlike toggleTask, which reverts via an
  // explicit updateTask), so recreation is the only way back.
  const handleLetGo = useCallback((id: string) => {
    const task = tasks.find((t) => t.id === id);
    void deleteTask(id);
    if (!task) return;
    undo.pushAction(`Deleted "${task.title}"`, () => {
      void addTask(task.title, task.contactId, task.projectId, task.scheduledFor, {
        bucket: task.bucket,
        context: task.context ?? undefined,
        assignedTo: task.assignedTo ?? null,
        assignedToAll: task.assignedToAll,
        goalId: task.goalId,
        sourceId: task.sourceId,
        phoneNumber: task.phoneNumber,
        isFun: task.isFun,
        // Context is first-class here — notes/links are the whole point of a
        // task, so an undo that drops them silently returns a stripped task.
        notes: task.notes,
        links: task.links,
        parentTaskId: task.parentTaskId,
        // Without this an undone all-day task comes back TIMED at midnight —
        // bucket 'timed' is derived from scheduledFor, and midnight falls
        // outside the day/week grids' 6 AM–10 PM window, so it is restored
        // and invisible.
        isAllDay: task.isAllDay,
        // NOTE: task.weekStart is NOT restored — AddTaskOptions has no INSERT-time
        // week_start field (only updateTask sets it), and a follow-up updateTask
        // call here would reintroduce the addTask-then-setBucket race this file
        // otherwise avoids. A 'week'-bucket task's original week is lost on undo.
      });
    });
  }, [tasks, deleteTask, addTask, undo.pushAction]);

  // Iris's rule: any process on an Unsorted item has to involve giving it a
  // domain. These six actions are the processes (see useGatedTaskActions);
  // everything else goes to the raw hook handlers unchanged. `raw` is memoized
  // on its own stable members (all useCallback-wrapped upstream) so `gated` —
  // and therefore scheduleActionsValue below — keeps one identity across
  // renders instead of forcing every ScheduleActions consumer to re-render.
  const findTaskById = useCallback((id: string) => tasks.find((t) => t.id === id), [tasks]);
  const gatedRaw = useMemo(
    () => ({
      updateTask,
      pushTask,
      updateTasksBulk,
      setBucket,
      onAssignTask: scheduleActions.onAssignTask,
      onAssignTaskAll: scheduleActions.onAssignTaskAll,
    }),
    [updateTask, pushTask, updateTasksBulk, setBucket, scheduleActions.onAssignTask, scheduleActions.onAssignTaskAll],
  );
  const gated = useGatedTaskActions(gatedRaw, findTaskById);

  const scheduleActionsValue = useMemo<ScheduleActionsValue>(
    () => ({
      onToggleTask: toggleTask,
      onToggleWaiting: toggleWaiting,
      onUpdateTask: gated.updateTask,
      onUpdateTasksBulk: gated.updateTasksBulk,
      onPushTask: gated.pushTask,
      onDeleteTask: deleteTask,
      onCreateTask: onCreateTaskFromValue,
      onOpenTask: (taskId: string) => setSelection({ kind: 'task', id: taskId }),
      onOpenProject: (projectId: string) => navigate(`/projects/${projectId}`),

      onAssignTask: gated.onAssignTask,
      onAssignTaskAll: gated.onAssignTaskAll,
      onAssignEvent: scheduleActions.onAssignEvent,
      onAssignEventAll: scheduleActions.onAssignEventAll,
      onAssignRoutine: scheduleActions.onAssignRoutine,
      onAssignRoutineAll: scheduleActions.onAssignRoutineAll,

      onCompleteRoutine: scheduleActions.onCompleteRoutine,
      onSkipRoutine: scheduleActions.onSkipRoutine,
      onPushRoutine: scheduleActions.onPushRoutine,
      onDeleteRoutine: scheduleActions.onDeleteRoutine,
      onUpdateRoutine: updateRoutine,

      onCompleteEvent: scheduleActions.onCompleteEvent,
      onSkipEvent: scheduleActions.onSkipEvent,
      onPushEvent: scheduleActions.onPushEvent,
      onUpdateEventContext: updateEventContext,
      onHideEvent: hideEvent,

      contactsMap,
      projectsMap,
      projects,
      contacts,
      familyMembers,
      lists,
      listsByCategory,
      eventNotesMap,
      eventContextOverrides,

      onAddProject: addProject,
      onConvertTaskToProject: handleConvertTaskToProject,
      onDeleteProject: deleteProject,
      onSearchContacts: searchContacts,
      onAddContact: (name, details) => addContact({ name, ...details }),

      getDomainForCalendar,
      onUpdateEventProject: updateEventProject,
    }),
    [
      toggleTask, toggleWaiting, gated, deleteTask, onCreateTaskFromValue,
      setSelection, navigate,
      scheduleActions, updateRoutine, updateEventContext, hideEvent,
      contactsMap, projectsMap, projects, contacts, familyMembers, lists, listsByCategory,
      eventNotesMap, eventContextOverrides,
      addProject, handleConvertTaskToProject, deleteProject, searchContacts, addContact, getDomainForCalendar,
      updateEventProject,
    ],
  );

  // ── Inline triage: route a row to a specific WHEN via the shared mapper
  // (dated whens → pushTask, pool whens → setBucket), identical everywhere.
  // Gated: a pool item can be Unsorted, and triaging it here is exactly the
  // "process" Iris's rule targets. ──
  const applyWhen = useCallback(
    (task: Task, when: TriageWhen) => {
      void applyTriageWhen(when, task.id, { onPushTask: gated.pushTask, onSetBucket: gated.setBucket! });
    },
    [gated],
  );

  // Lineage lookups for breadcrumbs ("← Ship auth layer ← Firebase rebuild").
  // Full (unfiltered) task list: an ancestor may live outside this domain lens.
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);

  const renderRow = useCallback(
    (task: Task) => {
      const project = projects.find((p) => p.id === task.projectId);
      const lineage = lineageLabel(task, tasksById, goalsById);
      // ONE fate vocabulary on every row, whatever the horizon: the canonical
      // TriageWhenMenu (whens + pick-date + delete; complete lives on the
      // row's checkbox). The old season/month "parking menu" variant was dead
      // code — no season or month surface ever called renderRow — and its
      // altitude verbs (To month / To week / Put aside) are the This month /
      // This week / Someday whens by another name.
      return (
        <DenseInboxRow
          key={task.id}
          task={task}
          project={project}
          projects={projects}
          lineage={lineage}
          familyMembers={familyMembers}
          quickActions={[]}
          onQuickAction={() => {}}
          draggable
          triageMenu={
            <TriageWhenMenu
              onPick={(when) => applyWhen(task, when)}
              onPickDate={(date) => gated.pushTask(task.id, date)}
              onDelete={() => deleteTask(task.id)}
            />
          }
          onToggleComplete={() => toggleTask(task.id)}
          onUpdate={(updates) => gated.updateTask(task.id, updates)}
          onSelect={() => handleSelect(task.id)}
          onAssign={(memberIds) => gated.onAssignTaskAll!(task.id, memberIds)}
          onCreateProject={handleCreateProjectForTask(task.id)}
          onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
        />
      );
    },
    [projects, familyMembers, applyWhen, gated, deleteTask, toggleTask, handleSelect, handleCreateProjectForTask, navigate, tasksById, goalsById],
  );

  // ── "Plan the [horizon]" — routes to the Today rung with a ?plan flag; the
  // HomeViewContainer opens the matching session (week/month/season/year). The
  // sessions live there so they share one task subscription. ──
  const handlePlan = useCallback(() => {
    navigate(`/today?plan=${horizon}`);
  }, [horizon, navigate]);

  const label = def?.label ?? 'Horizon';
  const total = pool.length + carryOver.length;
  // Someday has no planning session (it's a timeless pool); every dated horizon
  // does (week/month/season/year).
  const planDisabled = horizon === 'someday';

  const rungName = label.replace(/^This /, '').toLowerCase();
  const isCascadeRung = horizon !== 'someday';

  // The level above, for reference — folded into one quiet line. Rendered
  // below the grid on Month; inside the right rail on Season (the season
  // spread places sources beside the composer, not under the picks).
  const referenceFold = (referenceItems.length > 0 || referenceShelfItems.length > 0) ? (
            <section className="mb-8">
              <button
                type="button"
                onClick={() => setRefOpen((v) => !v)}
                aria-expanded={refOpen}
                className="w-full flex items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/30 px-4 py-3 text-left hover:bg-primary-50/60 transition-colors"
              >
                <Target className="w-4 h-4 text-primary-500 shrink-0" />
                <span className="flex-1 min-w-0 text-sm text-neutral-700">
                  <span className="font-medium">{referenceLabel}</span>
                  <span className="text-neutral-400"> — {referenceItems.length} for reference</span>
                </span>
                <ChevronRight className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform ${refOpen ? 'rotate-90' : ''}`} />
              </button>
              {refOpen && (
                <ul className="mt-3 space-y-1 rounded-xl border border-neutral-100 bg-white px-4 py-3">
                  {referenceItems.map((it) => {
                    {/* Goals don't copy verbatim — a year-sized sentence must be
                        translated into a season-sized move first (the inline
                        prompt). Season→month task copies stay one-tap: the
                        grains are adjacent. */}
                    if (translatingRefId === it.id) {
                      return (
                        <li key={it.id} className="rounded-lg bg-primary-50/60 border border-primary-200 px-3 py-2 my-1">
                          <p className="text-xs text-primary-800 mb-1.5">
                            What's the first <span className="font-semibold">season-sized</span> move on “{it.title}”? An outcome you can finish this season.
                          </p>
                          <div className="flex items-center gap-2">
                            <input type="text" autoFocus value={refDraft}
                              placeholder="An outcome finishable this season — the goal stays on the shelf…"
                              onChange={(e) => setRefDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && refDraft.trim()) {
                                  void onCreateTaskFromValue(refDraft.trim(), it.lineage);
                                  setTranslatingRefId(null);
                                }
                                if (e.key === 'Escape') setTranslatingRefId(null);
                              }}
                              className="flex-1 min-w-0 text-sm bg-white border border-primary-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-primary-400"
                            />
                            <button type="button" disabled={!refDraft.trim()}
                              onClick={() => { void onCreateTaskFromValue(refDraft.trim(), it.lineage); setTranslatingRefId(null); }}
                              className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 transition-colors">
                              Add to season
                            </button>
                            <button type="button" onClick={() => setTranslatingRefId(null)} aria-label="Cancel"
                              className="shrink-0 text-xs px-1.5 py-1.5 text-neutral-400 hover:text-neutral-600">✕</button>
                          </div>
                          <SeasonMoveSuggestions goalName={it.title} onPick={setRefDraft} />
                        </li>
                      );
                    }
                    return (
                    <li key={it.id} className="flex items-center gap-3 py-1">
                      {it.goalId ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/goals/${it.goalId}`)}
                          className="flex-1 min-w-0 text-left text-sm text-neutral-800 truncate hover:text-primary-700 transition-colors"
                        >
                          {it.title}
                        </button>
                      ) : (
                        <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{it.title}</span>
                      )}
                      {isOnThisList(it) ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
                          <Check className="w-3 h-3" strokeWidth={3} /> on this list
                        </span>
                      ) : it.goalId ? (
                        <button
                          type="button"
                          onClick={() => { setTranslatingRefId(it.id); setRefDraft(''); }}
                          title="Start this goal this season — translate it into a season-sized move"
                          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Start this season
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void onCreateTaskFromValue(it.title, it.lineage)}
                          title="Copy onto this list (stays on the list above too)"
                          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Copy down
                        </button>
                      )}
                    </li>
                    );
                  })}
                  {horizon === 'month' && referenceShelfItems.length > 0 && (
                    <li className="pt-1.5 mt-1 border-t border-neutral-100">
                      <button type="button" onClick={() => setRefShelfOpen((v) => !v)} aria-expanded={refShelfOpen}
                        className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors">
                        <ChevronRight className={`w-3 h-3 transition-transform ${refShelfOpen ? 'rotate-90' : ''}`} />
                        Also on the shelf ({referenceShelfItems.length}) — not picked this season
                      </button>
                      {refShelfOpen && (
                        <ul className="mt-1.5 space-y-1 opacity-75">
                          {referenceShelfItems.map((it) => (
                            <li key={it.id} className="flex items-center gap-3 py-0.5">
                              <span className="flex-1 min-w-0 text-sm text-neutral-700 truncate">{it.title}</span>
                              {isOnThisList(it) ? (
                                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
                                  <Check className="w-3 h-3" strokeWidth={3} /> on this list
                                </span>
                              ) : (
                                <button type="button"
                                  onClick={() => void onCreateTaskFromValue(it.title, it.lineage)}
                                  title="Copy onto this list (stays on the shelf too)"
                                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                                  <Plus className="w-3 h-3" /> Copy down
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )}
                  {horizon === 'season' && (
                    <li className="pt-1.5 mt-1 border-t border-neutral-100 text-[11px] text-neutral-400 italic">
                      Goals you don't start stay on the shelf — every seasonal session offers them again.
                    </li>
                  )}
                </ul>
              )}
            </section>
  ) : null;

  return {
    navigate, def, horizon,
    // Gated versions, not the raw hook handlers: every horizon page
    // (Week/Month/Season grids — drag-drop placement, Tend restore, season-
    // pick promotion) destructures these by these exact names, so routing
    // them through `gated.*` here is what makes "drag an Unsorted row onto
    // Week/Month first opens the domain chooser" true without touching any
    // page component. `addTask`/`deleteTask`/`toggleTask` stay raw — a
    // create has no existing row to gate, and delete/complete don't place
    // anything (see useGatedTaskActions's `needsDomain`).
    tasks, addTask, toggleTask, toggleWaiting, deleteTask,
    updateTask: gated.updateTask, updateTasksBulk: gated.updateTasksBulk,
    pushTask: gated.pushTask, setBucket: gated.setBucket!,
    events,
    eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject,
    contacts, contactsMap, addContact, searchContacts,
    projects, projectsMap, addProject, deleteProject,
    allRoutines, updateRoutine, deleteRoutine,
    familyMembers, getCurrentUserMember,
    hideEvent,
    getDomainForCalendar,
    lists, listsByCategory,
    soleDomain,
    layers,
    undo,
    match,
    domainTasks,
    showCarryOver, carryOver, staleWeekPlacements, pool,
    placedThisWeek,
    todayStart, weekGridStart, weekGridTasks, weekAnchor,
    railCounts,
    areas, goals, addGoal,
    seasonNotes, patchSeasonNotes,
    referenceItems, referenceLabel,
    isOnThisList,
    refOpen, setRefOpen, refShelfOpen, setRefShelfOpen,
    referenceShelfItems,
    explainerOpen, setExplainerOpen, hasExplainer,
    zoomMonth, setZoomMonth,
    translatingRefId, setTranslatingRefId, refDraft, setRefDraft,
    period, progress,
    handleSelect,
    viewedDate, scheduleActions, eventContextOverrides, domainEvents,
    horizonBucket, onCreateTaskFromValue,
    draft, setDraft, composerRef, sharpenBet, sharpenBetLoading, submitDraft,
    grouped,
    handleCreateProjectForTask, handleConvertTaskToProject,
    handleLetGo,
    // The undo-wrapped delete (capture-then-recreate on undo) exported under
    // the name Tend/PlanningShelf expect — same function as handleLetGo,
    // just not renamed at its definition site (SeasonPage still uses that name).
    deleteTaskWithUndo: handleLetGo,
    scheduleActionsValue,
    applyWhen,
    tasksById, goalsById,
    renderRow,
    handlePlan,
    label, total, planDisabled, rungName, isCascadeRung,
    referenceFold,
  };
}

export type HorizonPageData = ReturnType<typeof useHorizonPageData>;
