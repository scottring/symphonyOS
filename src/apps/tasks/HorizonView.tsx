// src/apps/tasks/HorizonView.tsx
//
// Phase 2b — the horizon-scoped view each rhythm rung routes to.
//
// INVARIANT (critical): a horizon view shows ONLY that horizon's scoped pool
// (`selectHorizonPool`) + carry-over (`selectOverdue`) — never the full task
// list. Today keeps its rich view (HomeViewContainer); this container serves
// Week / Month / Season / Someday. Year is a goals-level horizon and renders a
// placeholder pointing at Goals (its session is Phase 3).
//
// Data + action scaffolding mirror InboxViewContainer so the existing
// DenseInboxRow + global DetailPanel (tap-to-detail) work unchanged.

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { PAGE_COLUMN } from '@/components/layout/pageLayout';
import { PlanningSession } from '@/components/planning/PlanningSession';
import { MonthCalendarGrid } from '@/components/planning/horizon/MonthCalendarGrid';
import { YearCalendarGrid } from '@/components/planning/horizon/YearCalendarGrid';
import { MonthZoomSheet } from '@/components/planning/horizon/MonthZoomSheet';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, Target, Plus, ChevronRight, FolderOpen, Check, Pencil, Archive, Trash2, CornerRightDown, Sparkles } from 'lucide-react';
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
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext';
import { useUndo } from '@/hooks/useUndo';
import { UndoToast } from '@/components/undo/UndoToast';
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
import { lineageLabel, goalRollup, inheritedLineage } from '@/lib/planning/lineage';
import { SeasonMoveSuggestions } from '@/components/planning/SeasonMoveSuggestions';
import { ListSuggestions } from '@/components/planning/guided/ListSuggestions';
import { BetsGrid } from '@/components/planning/season/BetsGrid';
import { OverflowTray } from '@/components/planning/season/OverflowTray';
import { MonthStrip } from '@/components/planning/season/MonthStrip';
import { FocusLine } from '@/components/planning/season/FocusLine';
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer';
import { EXPLAINER_SCENES } from '@/components/planning/explainers/scenes';
import { usePlanningSession } from '@/hooks/usePlanningSession';
import { guidedPeriod } from '@/components/planning/guided/periods';
import { partitionSeason, servingCount, PICK_CAP } from '@/lib/planning/betPulse';
import { looksLikeActivity } from '@/lib/planning/outcomeCoach';
import type { Task } from '@/types/task';
import type { Goal } from '@/types/goal';

// ── The cascade rail: the rhythm spine rendered as a walkable path, with the
// current rung emphasized and live counts on the bucketed rungs. This is what
// makes the year → season → month → week → today trickle-down *visible*. ──
const RAIL_ORDER: HorizonId[] = ['year', 'season', 'month', 'week', 'today'];

function CascadeRail({ current, counts, onGo }: {
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

// A year goal on the Year rung, with its cascade roll-up: every task anywhere
// that carries this goal's id (goal_id thread, stamped on promotion and
// inherited by copies). No moves yet = a quiet invitation, not a zero.
function YearGoalRow({ goal, tasks, onOpen }: { goal: Goal; tasks: Task[]; onOpen: () => void }) {
  const { total, done } = goalRollup(goal.id, tasks);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-start gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-3 text-left hover:bg-neutral-50 transition-colors"
    >
      <Target className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-neutral-800 leading-snug">{goal.name}</span>
        {total > 0 ? (
          <span className="mt-1 flex items-center gap-2">
            <span className="h-1 w-24 rounded-full bg-neutral-100 overflow-hidden inline-block">
              <span className="block h-full bg-primary-400" style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </span>
            <span className="text-[11px] text-neutral-400">{done} of {total} moves done</span>
          </span>
        ) : (
          <span className="block mt-0.5 text-[11px] text-neutral-300">no moves threaded yet — promote it in a seasonal session</span>
        )}
      </span>
      <ChevronRight className="w-4 h-4 text-neutral-300 shrink-0" />
    </button>
  );
}

interface HorizonViewProps {
  horizon: HorizonId;
}

export function HorizonView({ horizon }: HorizonViewProps) {
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
  const weekAnchor = useMemo(() => weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn), []);
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
  const referenceItems = useMemo<Array<{ id: string; title: string; goalId?: string; lineage?: { sourceId?: string; goalId?: string } }>>(() => {
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
    if (horizon !== 'month') return [] as Array<{ id: string; title: string; lineage?: { sourceId?: string; goalId?: string } }>;
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
    const overrides = new Map<string, import('@/types/task').TaskContext>();
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
    (taskId: string) => async (name: string, context: import('@/types/task').TaskContext | null) => {
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

  // ── Year: the top of the cascade. Annual goals live HERE, on the rung —
  // grouped by life area, each showing its progress through this season's
  // moves — with doors into the annual session and the Goals library. ──
  if (horizon === 'year') {
    const activeGoals = goals.filter((g) => g.status === 'active');
    const goalsByArea = areas
      .map((area) => ({ area, items: activeGoals.filter((g) => g.areaId === area.id) }))
      .filter(({ items }) => items.length > 0);
    const orphanGoals = activeGoals.filter((g) => !areas.some((a) => a.id === g.areaId));

    return (
      <div className="h-full overflow-y-auto">
        <div className={PAGE_COLUMN}>
          <header className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400">This Year</p>
              <h1 className="font-display text-3xl font-semibold text-neutral-800 mt-0.5">{period}</h1>
              {progress && (
                <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
                  <span>Day {progress.day} of {progress.total}</span>
                  <span className="h-1 w-24 rounded-full bg-neutral-200 overflow-hidden inline-block">
                    <span
                      className="block h-full bg-primary-400"
                      style={{ width: `${Math.round((progress.day / progress.total) * 100)}%` }}
                    />
                  </span>
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={() => navigate('/today?plan=year')}
                className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors text-primary-700 bg-primary-50 hover:bg-primary-100"
              >
                <CalendarRange className="w-4 h-4" /> Plan the year
              </button>
              {hasExplainer && (
                <button type="button" onClick={() => setExplainerOpen(true)}
                  className="text-[12px] text-neutral-400 hover:text-primary-700 transition-colors">
                  What is this level?
                </button>
              )}
            </div>
          </header>

          <div className="mb-8">
            <CascadeRail current="year" counts={railCounts} onGo={(h) => navigate(`/${h}`)} />
          </div>

          {/* The year as a 12-month landscape — the big items in each month.
              Tapping a month zooms into it in place (drag rocks onto days)
              without leaving the year. */}
          <div className="mb-8">
            <YearCalendarGrid
              year={new Date().getFullYear()}
              tasks={domainTasks}
              events={domainEvents}
              onOpenMonth={(m) => setZoomMonth(m)}
            />
          </div>
          {zoomMonth !== null && (
            <MonthZoomSheet
              month={new Date(new Date().getFullYear(), zoomMonth, 1)}
              tasks={domainTasks}
              events={domainEvents}
              onClose={() => setZoomMonth(null)}
              onPlaceTask={(id, day) => updateTask(id, { bucket: 'timed', scheduledFor: day })}
              onUnscheduleTask={(id) => updateTask(id, { bucket: 'month', scheduledFor: undefined })}
              onSelectTask={handleSelect}
            />
          )}

          {goalsByArea.length === 0 && orphanGoals.length === 0 ? (
            <div className="card p-8 text-center">
              <Target className="w-8 h-8 text-primary-400 mx-auto mb-4" />
              <p className="font-display text-lg text-neutral-700 mb-2">{period} doesn't have goals yet</p>
              <p className="text-neutral-500 mb-6">
                Set this year's goals by life area — family, home, health, money. You'll look
                at them each season while writing that season's own list.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/goals')}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Target className="w-4 h-4" /> Set this year's goals
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/today?plan=year')}
                  className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
                >
                  <CalendarRange className="w-4 h-4" /> Plan the year together
                </button>
              </div>
            </div>
          ) : (
            <>
              {goalsByArea.map(({ area, items }) => (
                <section key={area.id} className="mb-6">
                  <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">{area.name}</h2>
                  <div className="space-y-2">
                    {items.map((g) => (
                      <YearGoalRow key={g.id} goal={g} tasks={tasks} onOpen={() => navigate(`/goals/${g.id}`)} />
                    ))}
                  </div>
                </section>
              ))}
              {orphanGoals.length > 0 && (
                <section className="mb-6">
                  <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">Goals</h2>
                  <div className="space-y-2">
                    {orphanGoals.map((g) => (
                      <YearGoalRow key={g.id} goal={g} tasks={tasks} onOpen={() => navigate(`/goals/${g.id}`)} />
                    ))}
                  </div>
                </section>
              )}
              <button
                type="button"
                onClick={() => navigate('/goals')}
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
              >
                <Target className="w-4 h-4" /> Open Goals
              </button>
            </>
          )}
        </div>
        <HorizonExplainer horizon="year" open={explainerOpen} onClose={() => setExplainerOpen(false)} />
      </div>
    );
  }

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
                        Also on the bench ({referenceBenchItems.length}) — not picked this season
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
                                  title="Copy onto this list (stays on the bench too)"
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

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <div className="h-full overflow-y-auto">
        <div className={PAGE_COLUMN}>
          <header className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400">{label}</p>
              <h1 className="font-display text-3xl font-semibold text-neutral-800 mt-0.5">
                {period ?? label}
              </h1>
              {progress ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
                  <span>Day {progress.day} of {progress.total}</span>
                  <span className="h-1 w-24 rounded-full bg-neutral-200 overflow-hidden inline-block">
                    <span
                      className="block h-full bg-primary-400"
                      style={{ width: `${Math.round((progress.day / progress.total) * 100)}%` }}
                    />
                  </span>
                  {(total > 0 || placedThisWeek.length > 0) && (
                    <span>
                      · {pool.length} open
                      {placedThisWeek.length > 0 ? ` · ${placedThisWeek.length} placed` : ''}
                      {carryOver.length > 0 ? ` · ${carryOver.length} carried over` : ''}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-neutral-500 mt-1">
                  {horizon === 'someday'
                    ? 'Timeless — review during seasonal planning.'
                    : total === 0 ? 'Nothing here yet' : `${pool.length} open`}
                </p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              {!planDisabled && (
                <button
                  type="button"
                  onClick={handlePlan}
                  title={`Plan the ${rungName}`}
                  className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors text-primary-700 bg-primary-50 hover:bg-primary-100"
                >
                  <CalendarRange className="w-4 h-4" />
                  Plan the {rungName}
                </button>
              )}
              {hasExplainer && (
                <button type="button" onClick={() => setExplainerOpen(true)}
                  className="text-[12px] text-neutral-400 hover:text-primary-700 transition-colors">
                  What is this level?
                </button>
              )}
            </div>
          </header>

          {/* The cascade rail — where this rung sits in the year → today flow. */}
          {isCascadeRung && (
            <div className="mb-8">
              <CascadeRail current={horizon} counts={railCounts} onGo={(h) => navigate(`/${h}`)} />
            </div>
          )}

          {/* Week as the standing 7-day grid — place rocks straight from the
              drawer onto days; placed rocks live on their day. */}
          {horizon === 'week' && (
            <div className="mb-8 h-[60vh] min-h-[420px]">
              <PlanningSession
                tasks={weekGridTasks}
                events={domainEvents}
                routines={allRoutines}
                familyMembers={familyMembers}
                eventNotesMap={eventNotesMap}
                onUpdateTask={updateTask}
                onPushTask={pushTask}
                onClose={() => {}}
                initialDate={weekGridStart}
                minDropDate={todayStart}
                embedded
              />
            </div>
          )}

          {/* Month identity line — framing for moves (concrete chunks) */}
          {horizon === 'month' && (
            <p className="mb-3 text-[12px] text-neutral-400">
              Moves — concrete chunks that fit in a sitting; 10–15 is a good month.
              {(() => { const s = servingCount(domainTasks); return s.total > 0 ? ` Serving ${s.serving} of ${s.total} picks.` : ''; })()}
            </p>
          )}

          {/* Month as a real calendar grid — the month's big rocks placed on
              actual days (the first of the per-horizon calendar views). */}
          {horizon === 'month' && (
            <div className="mb-8">
              <MonthCalendarGrid
                month={viewedDate}
                tasks={domainTasks}
                events={domainEvents}
                onPlaceTask={(id, day) => updateTask(id, { bucket: 'timed', scheduledFor: day })}
                onUnscheduleTask={(id) => updateTask(id, { bucket: 'month', scheduledFor: undefined })}
                onSelectTask={handleSelect}
              />
            </div>
          )}

          {/* Season — picks and a shape (spec 2026-07-20, revised 2026-07-21:
              picking is EXPLICIT). Focus line, the chosen picks as cards, the
              bench below a hard divider, the season's three months. */}
          {/* Season — the season spread (design pass 2026-07-21). One dominant
              panel (the picks, with the cap rendered as ARCHITECTURE: eight
              positions, open slots visible), a quiet right rail (the three
              months, the goals to draw from, the composer), and the bench as
              a collapsed drawer at the very bottom. */}
          {horizon === 'season' && (() => {
            const { picks, bench } = partitionSeason(domainTasks);
            return (
            <div className="mb-8">
              {/* Epigraph — the focus line closes the masthead. */}
              <div className="mb-10">
                <FocusLine
                  value={(seasonNotes.seasonFocus as string) ?? ''}
                  onChange={(v) => patchSeasonNotes({ seasonFocus: v })}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* The picks — the page's one dominant read. */}
                <section className="lg:col-span-7">
                  <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-4">
                    The season's picks
                  </h2>
                  <BetsGrid
                    tasks={domainTasks}
                    goalsById={goalsById}
                    onSelect={handleSelect}
                    onComplete={(id) => toggleTask(id)}
                    onDemote={(id) => updateTask(id, { pickedAt: undefined })}
                    onSlotClick={() => composerRef.current?.focus()}
                  />
                </section>

                {/* The rail — supporting cast in reading order: the season's
                    shape, the sources, the way in. */}
                <aside className="lg:col-span-5 space-y-8 lg:border-l lg:border-neutral-200/70 lg:pl-10">
                  <div>
                    <h3 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">The three months</h3>
                    <MonthStrip tasks={domainTasks} onOpenMonth={() => navigate('/month')} orientation="column" />
                  </div>
                  {referenceFold && <div>{referenceFold}</div>}
                  <div>
                    <h3 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">Add an outcome</h3>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-neutral-200 bg-white focus-within:border-primary-400 transition-colors">
                      <button
                        type="button"
                        onClick={() => void submitDraft()}
                        aria-label="Add outcome"
                        className="shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <input
                        ref={composerRef}
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void submitDraft() }}
                        placeholder="Finishable by season's end…"
                        className="flex-1 min-w-0 text-sm bg-transparent placeholder:text-neutral-400 focus:outline-none"
                      />
                    </div>
                    {/* AI fuel for the blank composer: outcome-shaped proposals
                        drawn from the active goals. Tap-to-FILL only — the
                        human edits and confirms (same engine as the wizard). */}
                    <div className="mt-3">
                      <ListSuggestions
                        bucket="quarter"
                        aboveItems={goals.filter((g) => g.status === 'active' && matchesDomain(g.context, currentDomain)).map((g) => g.name)}
                        aboveLabel="your year goals"
                        existingItems={domainTasks.filter((t) => t.bucket === 'quarter').map((t) => t.title)}
                        onPick={(t) => { setDraft(t); composerRef.current?.focus(); }}
                      />
                    </div>
                    {looksLikeActivity(draft) && (
                      <p className="text-[11px] text-amber-700 mt-1.5 inline-flex items-center gap-1.5">
                        Picks read best as outcomes — "Will drafted and signed".
                        <button
                          type="button"
                          onClick={async () => {
                            const suggestion = await sharpenBet(draft);
                            if (suggestion) setDraft(suggestion);
                          }}
                          disabled={sharpenBetLoading}
                          className="inline-flex items-center gap-1 font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Sparkles className="w-3 h-3" />
                          {sharpenBetLoading ? 'Sharpening…' : 'Sharpen'}
                        </button>
                      </p>
                    )}
                  </div>
                </aside>
              </div>

              <OverflowTray
                collapsible
                items={bench}
                picks={picks}
                onPick={(id) => updateTask(id, { pickedAt: new Date() })}
                onSwap={(benchId, replacedPickId) => {
                  void updateTask(replacedPickId, { pickedAt: undefined });
                  void updateTask(benchId, { pickedAt: new Date() });
                }}
                onMakeMove={(id) => updateTask(id, { bucket: 'month' })}
                onShelf={(id) => updateTask(id, { bucket: 'someday' })}
                onLetGo={handleLetGo}
                onRename={(id, title) => updateTask(id, { title })}
                onMakeGoal={async (_id, title) => {
                  // Goal-sized bench item → a real goal. Filed under the first
                  // life area (movable on /goals); context follows the domain.
                  const area = [...areas].sort((a, b) => a.sortOrder - b.sortOrder)[0];
                  if (!area) return null;
                  const created = await addGoal(area.id, title, currentDomain !== 'universal' ? currentDomain : undefined);
                  return created?.id ?? null;
                }}
                onFirstMove={(id, goalId, moveText) => {
                  // The original item BECOMES the goal's first season move —
                  // picked if a slot is open, benched otherwise.
                  const room = partitionSeason(domainTasks).picks.length < PICK_CAP;
                  void updateTask(id, { title: moveText, goalId, pickedAt: room ? new Date() : undefined });
                }}
                onShelfLinked={(id, goalId) => {
                  void updateTask(id, { bucket: 'someday', goalId, pickedAt: undefined });
                }}
                onApplySlate={(ids) => {
                  // The recommended slate becomes the picks: staggered pickedAt
                  // preserves the recommendation's order; current picks not in
                  // the slate return to the bench.
                  const chosen = new Set(ids);
                  const base = Date.now();
                  ids.forEach((id, i) => { void updateTask(id, { pickedAt: new Date(base + i) }); });
                  for (const p of picks) {
                    if (!chosen.has(p.id)) void updateTask(p.id, { pickedAt: undefined });
                  }
                }}
              />
            </div>
            );
          })()}

          {/* The level above, for reference — folded into one quiet line so
              this level's OWN list leads the page. Month looks at the season
              list; season looks at the year's goals. Read-only: nothing moves,
              nothing has to line up. "Copy down" duplicates a line onto this
              list (the original stays where it lives, so the upper list is
              intact for its own review); lines already here show a check. */}
          {horizon === 'month' && referenceFold}

          {/* Carry-over — calm "carried over" framing (week only). */}
          {carryOver.length > 0 && (
            <section className="mb-6">
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                Carried over ({carryOver.length})
              </h2>
              <div className="space-y-2">{carryOver.map(renderRow)}</div>
            </section>
          )}

          {/* Placed this week — rocks already on a day (bucket 'timed' inside
              the week). Scheduling drains the week pool, so without this a
              fully-placed plan reads as an empty week (week-boundary spec). */}
          {placedThisWeek.length > 0 && (
            <section className="mb-6">
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                Placed this week ({placedThisWeek.length})
              </h2>
              <div className="space-y-2">{placedThisWeek.map(renderRow)}</div>
            </section>
          )}

          {/* Projects in motion — the pool grouped by project, loose tasks after.
              Suppressed for season: bets render as cards above, not rows. */}
          {horizon !== 'season' && grouped.groups.map(({ project, items }) => (
            <section key={project.id} className="mb-6">
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}`)}
                className="group flex items-center gap-2 mb-3"
              >
                <FolderOpen className="w-3.5 h-3.5 text-neutral-400" />
                <h2 className="font-display text-sm tracking-wide text-neutral-500 uppercase group-hover:text-primary-700 transition-colors">
                  {project.name}
                </h2>
                <span className="text-xs text-neutral-400">({items.length})</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-300 group-hover:text-primary-500 transition-colors" />
              </button>
              <div className="space-y-2">{items.map(renderRow)}</div>
            </section>
          ))}

          {/* The rest of the pool (loose tasks), or the empty invitation.
              Suppressed for season: bets render as cards above, not rows —
              but the inline add affordance below still lands new bets. */}
          <section>
            {horizon !== 'season' && (
              <>
                {(grouped.loose.length > 0 || pool.length === 0) && (
                  <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                    {grouped.groups.length > 0 ? `More in ${rungName}` : label} ({grouped.groups.length > 0 ? grouped.loose.length : pool.length})
                  </h2>
                )}
                {pool.length === 0 && placedThisWeek.length > 0 ? (
                  // Every rock is placed on a day — that's a planned week, not an
                  // empty one. No invitation needed; the placed section above
                  // carries the page.
                  <p className="text-center py-4 text-sm text-neutral-400">
                    Everything on the {rungName} list is placed on a day.
                  </p>
                ) : pool.length === 0 ? (
                  <div className="text-center py-10 text-neutral-400">
                    <p className="font-display text-lg text-neutral-600 mb-1">
                      {period ? `Nothing planned for ${period.split(' ')[0]} yet` : `Nothing in ${label.toLowerCase()}`}
                    </p>
                    <p className="text-sm mb-4">
                      {planDisabled
                        ? 'Park timeless ideas here — they surface in seasonal planning.'
                        : 'Plan it together, pull items down the cascade, or add one below.'}
                    </p>
                    {!planDisabled && (
                      <button
                        type="button"
                        onClick={handlePlan}
                        className="btn-primary inline-flex items-center gap-2"
                      >
                        <CalendarRange className="w-4 h-4" /> Plan the {rungName}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">{grouped.loose.map(renderRow)}</div>
                )}
              </>
            )}

            {/* Add directly into this horizon's pool. The placeholder speaks
                the level's grain (outcome / chunk / task) — the input is where
                the grain gauge either holds or leaks. */}
            {horizonBucket && horizon !== 'season' && (
              <div className="mt-3 flex items-center gap-2 px-2 py-1.5 rounded-xl border border-neutral-200 bg-white focus-within:border-primary-400 transition-colors">
                <button
                  type="button"
                  onClick={() => void submitDraft()}
                  aria-label="Add task"
                  className="shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submitDraft() }}
                  placeholder={
                    horizonBucket === 'quarter' ? 'Add an outcome for this season — finishable by its end…'
                    : horizonBucket === 'month' ? 'Add a chunk to this month — an order placed, a call made…'
                    : horizonBucket === 'someday' ? 'Park an idea on Someday — no timeline attached…'
                    : `Add a task to ${label.toLowerCase()}…`
                  }
                  className="flex-1 min-w-0 text-sm bg-transparent placeholder:text-neutral-400 focus:outline-none"
                />
              </div>
            )}
          </section>
        </div>
        <HorizonExplainer horizon={horizon} open={explainerOpen} onClose={() => setExplainerOpen(false)} />
        <UndoToast action={undo.currentAction} onUndo={undo.executeUndo} onDismiss={undo.dismiss} />
      </div>
    </ScheduleActionsProvider>
  );
}

// Bound components so routes stay declarative (one per rung).
export const WeekView = () => <HorizonView horizon="week" />;
export const MonthView = () => <HorizonView horizon="month" />;
export const SeasonView = () => <HorizonView horizon="season" />;
export const YearView = () => <HorizonView horizon="year" />;
export const SomedayView = () => <HorizonView horizon="someday" />;
