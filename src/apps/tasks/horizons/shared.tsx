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
import { Target, Plus, ChevronRight, Check, Pencil, Archive, Trash2, CornerRightDown } from 'lucide-react';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useSharpenBet } from '@/hooks/useSharpenBet';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useEventNotes } from '@/hooks/useEventNotes';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useRoutines } from '@/hooks/useRoutines';
import { useActionableInstances } from '@/hooks/useActionableInstances';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useHiddenCalendarEvents } from '@/hooks/useHiddenCalendarEvents';
import { useScheduleActions } from '@/hooks/useScheduleActions';
import { useDomain } from '@/hooks/useDomain';
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings';
import { useListsContext } from '@/contexts/ListsContext';
import type { ScheduleActionsValue } from '@/contexts/ScheduleActionsContext';
import { useUndo } from '@/hooks/useUndo';
import { useSelection } from '@/shell/providers/SelectionProvider';
import { DenseInboxRow } from '@/components/schedule/DenseInboxRow';
import { TriageWhenMenu, type TriageWhen } from '@/components/schedule/TriageWhenMenu';
import { selectOverdue } from '@/lib/today/taskPools';
import { selectHorizonPool, selectPlacedInWeek, HORIZONS, type HorizonId } from '@/lib/today/horizons';
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config';
import { matchesDomain, filterEventsForDomain, domainSessionToken } from '@/lib/today/domainFilter';
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
  const { events } = useGoogleCalendar();
  // Event ids opt in to auto-loaded, realtime event notes (see useEventNotes)
  const visibleEventIds = useMemo(() => events.map((e) => e.google_event_id || e.id), [events]);
  const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject } = useEventNotes(visibleEventIds);
  const { contacts, contactsMap, addContact, searchContacts } = useContacts();
  const { projects, projectsMap, addProject, deleteProject } = useProjects();
  const { routines: allRoutines, updateRoutine, deleteRoutine } = useRoutines();
  const { markDone, undoDone, skip, reschedule } = useActionableInstances();
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers();
  const { hideEvent } = useHiddenCalendarEvents();
  const { getDomainForCalendar } = useCalendarDomainMappings();
  const { lists, listsByCategory } = useListsContext();
  const { currentDomain } = useDomain();
  const undo = useUndo();

  const { setSelection } = useSelection();

  // ── Scope lens (W3 minimal: "Everyone"). The lens UI (Just me / Us /
  // Everyone) is a follow-up W3 step; the matcher is already plumbed so flipping
  // it later is a one-line change. ──
  const match = useMemo(() => makeAssigneeFilter([]), []);

  // ── Domain lens: the horizon pages follow the app's domain switcher like
  // the rest of the app. Universal = everything; a domain shows only its own
  // items (untagged live at the whole-life level). Filtered ONCE here so the
  // pool, carry-over, rail counts and reference panel all agree. ──
  const domainTasks = useMemo(
    () => (currentDomain === 'universal' ? tasks : tasks.filter((t) => matchesDomain(t.context, currentDomain))),
    [tasks, currentDomain],
  );

  // ── The scoped pool + carry-over. THE INVARIANT lives here. ──
  // Carry-over (overdue *dated* items) is a near-term concept: it belongs to
  // Today (rendered by HomeView) and to the weekly working set ("what you didn't
  // finish last week"). It must NOT bleed into Month / Season / Year / Someday —
  // those show only their own pool. (Someday is timeless; nothing is ever
  // "overdue" into it.) Showing the global overdue set on every horizon was the
  // bug where the same 5 items appeared as "carried over" everywhere.
  const showCarryOver = horizon === 'week';
  const carryOver = useMemo(
    () => (showCarryOver ? selectOverdue(domainTasks, true, match) : []),
    [showCarryOver, domainTasks, match],
  );
  const pool = useMemo(
    () => selectHorizonPool(domainTasks, horizon, match),
    [domainTasks, horizon, match],
  );

  // The week's placed rocks (bucket week→timed on scheduling drains the pool;
  // without this section a fully-placed plan reads as an empty week). Items
  // already surfaced as carried over (placed on a day now past) stay there —
  // this section is the still-ahead placements.
  const placedThisWeek = useMemo(() => {
    if (horizon !== 'week') return [];
    const carried = new Set(carryOver.map((t) => t.id));
    return selectPlacedInWeek(
      domainTasks,
      weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn),
      match,
    ).filter((t) => !carried.has(t.id));
  }, [horizon, domainTasks, match, carryOver]);

  // ── Week as a standing 7-day grid — the wizard's "place the big rocks"
  // surface living on the page (the week rung's calendar view, matching the
  // month/year grids). Same conventions as ScheduleGridStep: the grid opens
  // on today mid-week, refuses past-day drops, and keeps a placed rock
  // visible where it was dropped (bucket week→timed on scheduling). ──
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  // Anchored to `anchorDate` when the page is viewing a specific week
  // (`?start=`); otherwise the current week, as before.
  const weekAnchor = useMemo(
    () => weekStartAnchor(anchorDate ?? new Date(), readCadenceConfig().weekStartsOn),
    [anchorDate],
  );
  const weekGridStart = weekAnchor.getTime() > todayStart.getTime() ? weekAnchor : todayStart;
  const weekGridTasks = useMemo(() => {
    if (horizon !== 'week') return [];
    const end = new Date(weekAnchor); end.setDate(end.getDate() + 7);
    return domainTasks.filter((t) => {
      if (t.completed || !match(t.assignedTo, t.assignedToAll)) return false;
      if (t.bucket === 'week') return true;
      if (t.scheduledFor) {
        const d = new Date(t.scheduledFor);
        return d >= weekAnchor && d < end;
      }
      return false;
    });
  }, [horizon, domainTasks, match, weekAnchor]);

  // Live counts for the cascade rail (bucketed rungs only — today and year
  // have no bucket of their own).
  const railCounts = useMemo(() => {
    const counts: Partial<Record<HorizonId, number>> = {};
    for (const h of HORIZONS) {
      if (h.bucket && h.bucket !== 'timed') counts[h.id] = selectHorizonPool(domainTasks, h.id, match).length;
    }
    return counts;
  }, [domainTasks, match]);

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
    domainSessionToken(seasonToken, currentDomain),
  );
  // Reference rows carry their lineage payload so "Copy down" threads the
  // cascade: a month copy records its season source; a season line created
  // from a goal records the goal itself.
  const referenceItems = useMemo<ReferenceItem[]>(() => {
    if (horizon === 'month') {
      // The month draws from the CHOSEN season — picks only. The bench (items
      // deliberately not picked) collapses separately below.
      return selectHorizonPool(domainTasks, 'season', match)
        .filter((t) => !!t.pickedAt)
        .map((t) => ({ id: t.id, title: t.title, lineage: inheritedLineage(t) }));
    }
    if (horizon === 'season') {
      return goals
        .filter((g) => g.status === 'active' && matchesDomain(g.context, currentDomain))
        .map((g) => ({ id: g.id, title: g.name, goalId: g.id, lineage: { goalId: g.id } }));
    }
    return [];
  }, [horizon, domainTasks, match, goals, currentDomain]);
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
  const [refBenchOpen, setRefBenchOpen] = useState(false);
  // Month-only: the season's unchosen items, offered quietly for the rare grab.
  const referenceBenchItems = useMemo(() => {
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

  // Events on the month/year calendar grids scope to the current domain just
  // like tasks — otherwise work-calendar events leak into Family/Personal.
  const domainEvents = useMemo(
    () => filterEventsForDomain(events, currentDomain, { eventContextOverrides, getDomainForCalendar, eventNotesMap }),
    [events, currentDomain, eventContextOverrides, getDomainForCalendar, eventNotesMap],
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
      // new item lands on the bench for a deliberate swap. Rides the INSERT
      // (same temp-id race rationale as bucket).
      const autoPick =
        horizon === 'season' && partitionSeason(tasksRefForAdd.current).picks.length < PICK_CAP
          ? new Date()
          : undefined;
      await addTask(title, undefined, undefined, undefined, {
        assignedTo: getCurrentUserMember()?.id,
        context: currentDomain !== 'universal' ? currentDomain : undefined,
        bucket: horizonBucket ?? undefined,
        sourceId: lineage?.sourceId,
        goalId: lineage?.goalId,
        pickedAt: autoPick,
      });
    },
    [addTask, getCurrentUserMember, currentDomain, horizonBucket, horizon],
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
      await updateTask(taskId, { projectId: project.id });
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
      });
    });
  }, [tasks, deleteTask, addTask, undo.pushAction]);

  const scheduleActionsValue = useMemo<ScheduleActionsValue>(
    () => ({
      onToggleTask: toggleTask,
      onToggleWaiting: toggleWaiting,
      onUpdateTask: updateTask,
      onUpdateTasksBulk: updateTasksBulk,
      onPushTask: pushTask,
      onDeleteTask: deleteTask,
      onCreateTask: onCreateTaskFromValue,
      onOpenTask: (taskId: string) => setSelection({ kind: 'task', id: taskId }),
      onOpenProject: (projectId: string) => navigate(`/projects/${projectId}`),

      onAssignTask: scheduleActions.onAssignTask,
      onAssignTaskAll: scheduleActions.onAssignTaskAll,
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
      toggleTask, toggleWaiting, updateTask, updateTasksBulk, pushTask, deleteTask, onCreateTaskFromValue,
      setSelection, navigate,
      scheduleActions, updateRoutine, updateEventContext, hideEvent,
      contactsMap, projectsMap, projects, contacts, familyMembers, lists, listsByCategory,
      eventNotesMap, eventContextOverrides,
      addProject, handleConvertTaskToProject, deleteProject, searchContacts, addContact, getDomainForCalendar,
      updateEventProject,
    ],
  );

  // ── Inline triage: route a row to a specific WHEN via the shared mapper
  // (dated whens → pushTask, pool whens → setBucket), identical everywhere. ──
  const applyWhen = useCallback(
    (task: Task, when: TriageWhen) => {
      applyTriageWhen(when, task.id, { onPushTask: pushTask, onSetBucket: setBucket });
    },
    [pushTask, setBucket],
  );

  // Lineage lookups for breadcrumbs ("← Ship auth layer ← Firebase rebuild").
  // Full (unfiltered) task list: an ancestor may live outside this domain lens.
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);

  const renderRow = useCallback(
    (task: Task) => {
      const project = projects.find((p) => p.id === task.projectId);
      const lineage = lineageLabel(task, tasksById, goalsById);
      // Season and month rows speak their altitude — Change / Put aside (month
      // adds Copy to week) — never the day-routing chips, which belong to
      // execution horizons. Week/Today route; Month/Season copy or park.
      const parkingMenu = (
        <div className="flex items-center gap-1">
          {/* Re-file down an altitude — a MOVE, not a copy-down. Copy-down is
              planned descent (the upper list keeps its line); this is for
              items that were mis-graded and never belonged here. */}
          {horizon === 'season' && (
            <button
              type="button"
              title="Move to the month list — for items that are month-sized, not season-sized"
              onClick={() => setBucket(task.id, 'month')}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition-colors"
            >
              <CornerRightDown className="w-3 h-3" /> To month
            </button>
          )}
          {horizon === 'month' && (
            <button
              type="button"
              title="Move to the week list — for items that are week-sized, not month-sized"
              onClick={() => setBucket(task.id, 'week')}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition-colors"
            >
              <CornerRightDown className="w-3 h-3" /> To week
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSelect(task.id)}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition-colors"
          >
            <Pencil className="w-3 h-3" /> Change
          </button>
          <button
            type="button"
            title="Park on Someday — the timing is wrong, not the idea"
            onClick={() => setBucket(task.id, 'someday')}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition-colors"
          >
            <Archive className="w-3 h-3" /> Put aside
          </button>
          <button
            type="button"
            aria-label="Delete"
            title="Delete"
            onClick={() => deleteTask(task.id)}
            className="p-1.5 rounded-md text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      );
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
            horizon === 'season' || horizon === 'month' ? parkingMenu : (
              <TriageWhenMenu
                onPick={(when) => applyWhen(task, when)}
                onPickDate={(date) => pushTask(task.id, date)}
                onDelete={() => deleteTask(task.id)}
              />
            )
          }
          onToggleComplete={() => toggleTask(task.id)}
          onUpdate={(updates) => updateTask(task.id, updates)}
          onSelect={() => handleSelect(task.id)}
          onAssign={(memberIds) => scheduleActions.onAssignTaskAll(task.id, memberIds)}
          onCreateProject={handleCreateProjectForTask(task.id)}
          onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
        />
      );
    },
    [projects, familyMembers, horizon, setBucket, applyWhen, pushTask, deleteTask, toggleTask, updateTask, handleSelect, scheduleActions, handleCreateProjectForTask, navigate, tasksById, goalsById],
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
  const referenceFold = (referenceItems.length > 0 || referenceBenchItems.length > 0) ? (
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
                  {horizon === 'month' && referenceBenchItems.length > 0 && (
                    <li className="pt-1.5 mt-1 border-t border-neutral-100">
                      <button type="button" onClick={() => setRefBenchOpen((v) => !v)} aria-expanded={refBenchOpen}
                        className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors">
                        <ChevronRight className={`w-3 h-3 transition-transform ${refBenchOpen ? 'rotate-90' : ''}`} />
                        Also on the shelf ({referenceBenchItems.length}) — not picked this season
                      </button>
                      {refBenchOpen && (
                        <ul className="mt-1.5 space-y-1 opacity-75">
                          {referenceBenchItems.map((it) => (
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
    tasks, addTask, toggleTask, toggleWaiting, deleteTask, updateTask, updateTasksBulk, pushTask, setBucket,
    events,
    eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject,
    contacts, contactsMap, addContact, searchContacts,
    projects, projectsMap, addProject, deleteProject,
    allRoutines, updateRoutine, deleteRoutine,
    familyMembers, getCurrentUserMember,
    hideEvent,
    getDomainForCalendar,
    lists, listsByCategory,
    currentDomain,
    undo,
    match,
    domainTasks,
    showCarryOver, carryOver, pool,
    placedThisWeek,
    todayStart, weekGridStart, weekGridTasks, weekAnchor,
    railCounts,
    areas, goals, addGoal,
    seasonNotes, patchSeasonNotes,
    referenceItems, referenceLabel,
    isOnThisList,
    refOpen, setRefOpen, refBenchOpen, setRefBenchOpen,
    referenceBenchItems,
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
