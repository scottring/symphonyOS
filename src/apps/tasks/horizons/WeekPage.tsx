// src/apps/tasks/horizons/WeekPage.tsx
//
// Week: ONE surface — the shelf (unplaced pool, Tend-able) above a full-width
// 7-day grid. A task lives on a day or on the shelf, never both, never
// listed again elsewhere on the page (no carry-over section, no placed
// section, no project-grouped lists — those all collapsed into the shelf).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PAGE_COLUMN } from '@/components/layout/pageLayout';
import { PlanningSession } from '@/components/planning/PlanningSession';
import { CalendarRange } from 'lucide-react';
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext';
import { UndoToast } from '@/components/undo/UndoToast';
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer';
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config';
import { useTendWeek } from '@/hooks/useTendWeek';
import { applyProposal } from '@/lib/tend/applyProposal';
import type { TendProposal } from '@/lib/tend/types';
import type { Task } from '@/types/task';
import { useGoogleCalendar, type GoogleCalendarInfo } from '@/hooks/useGoogleCalendar';
import { makeCanMoveEvent } from '@/lib/planning/calendarWriteAccess';
import { CascadeRail, useHorizonPageData } from './shared';

// `?start=YYYY-MM-DD` parsed from LOCAL date parts — never Date.parse/UTC,
// which would shift the anchor a day in negative-UTC-offset timezones.
// Rejects malformed strings and impossible calendar dates (e.g. 2026-02-30).
function parseLocalYmd(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

// LOCAL date parts, never toISOString() — UTC would shift the date near
// midnight in negative-UTC-offset timezones.
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function WeekPage() {
  const horizon = 'week' as const;

  // Month→Week seam: `?start=` anchors this page on a specific week — the
  // grid's initial date, the header's range label, which days accept a drop
  // (via minDropDate, unchanged below), and which week's tasks the grid
  // filters to (via anchorDate threaded into useHorizonPageData).
  const [searchParams] = useSearchParams();
  const startAnchor = parseLocalYmd(searchParams.get('start'));
  const anchoredWeekStart = useMemo(() => {
    if (!startAnchor) return null;
    return weekStartAnchor(startAnchor, readCadenceConfig().weekStartsOn);
  }, [startAnchor]);

  const {
    navigate, familyMembers, eventNotesMap, updateTask, pushTask,
    domainEvents, weekGridTasks, todayStart, railCounts,
    period, placedThisWeek, carryOver, staleWeekPlacements, pool,
    planDisabled, handlePlan, rungName, hasExplainer,
    explainerOpen, setExplainerOpen, label,
    draft, setDraft, submitDraft,
    scheduleActionsValue, undo,
    setBucket, deleteTaskWithUndo, projectsMap, tasksById, weekAnchor,
    addTask, deleteTask, toggleTask, getCurrentUserMember, currentDomain,
  } = useHorizonPageData(horizon, anchoredWeekStart ?? undefined);

  const gridStart = anchoredWeekStart ?? weekAnchor;
  const displayPeriod = anchoredWeekStart
    ? `Week of ${anchoredWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : (period ?? label);

  const carryOverIds = useMemo(() => new Set(carryOver.map((t) => t.id)), [carryOver]);
  // The subset whose reason is "the week it was placed on has passed" — those
  // pills name that week and offer the one fate a drag can't express.
  const staleWeekIds = useMemo(() => new Set(staleWeekPlacements.map((t) => t.id)), [staleWeekPlacements]);
  // Bring it onto the week being planned: still unplaced, no longer late. The
  // other fates are already here — drag it to a day, or use the ⋯ menu to send
  // it back to the month, put it aside, or let it go.
  const onBringForward = useCallback(
    (id: string) => { void updateTask(id, { weekStart: gridStart }); },
    [updateTask, gridStart],
  );

  // Union of this week's grid tasks + carried-over (prior-week overdue) tasks,
  // deduped by id. weekGridTasks alone excludes a task scheduled BEFORE the
  // anchored week (bucket 'timed', overdue) — it lives in carryOver instead —
  // so without this union it's invisible: not on the grid (wrong week) and not
  // on the shelf (not passed to PlanningSession at all). PlanningSession's own
  // unscheduled-pool derivation already routes any past-scheduled task outside
  // the grid's date range into the shelf (see allUnscheduledTasks in
  // PlanningSession.tsx), so simply including it in `tasks` is sufficient —
  // shared.tsx's weekGridTasks itself must NOT be widened (it also feeds the
  // "placed this week" count and other horizons' pool math).
  const sessionTasks = useMemo(() => {
    const byId = new Map<string, Task>();
    for (const t of weekGridTasks) byId.set(t.id, t);
    for (const t of carryOver) byId.set(t.id, t);
    return [...byId.values()];
  }, [weekGridTasks, carryOver]);

  // Moving an event to another day is a real weekly-planning gesture, but only
  // where Google will accept the write — a reader-role share 403s. Load the
  // calendar roles once and let the grid ask per event.
  const { fetchCalendarList, updateEvent } = useGoogleCalendar();
  const [calendars, setCalendars] = useState<GoogleCalendarInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchCalendarList().then((cals) => { if (!cancelled) setCalendars(cals); });
    return () => { cancelled = true; };
  }, [fetchCalendarList]);
  const canMoveEvent = useMemo(() => makeCanMoveEvent(calendars), [calendars]);

  // What the shelf is actually rendering. The masthead used `pool.length` (the
  // bucket pool from shared.tsx) while the shelf renders a union filtered by
  // range and relevance — so the page said "2 to place" directly above a shelf
  // listing 9. Mirror the render, don't recompute it.
  const [shelfCount, setShelfCount] = useState<number | null>(null);

  const rescheduleEvent = useCallback(
    (event: Parameters<typeof canMoveEvent>[0], startTime: Date, endTime: Date) => {
      void updateEvent({
        eventId: event.google_event_id || event.id,
        startTime,
        endTime,
        calendarId: event.calendar_id || event.calendarId,
      });
    },
    [updateEvent],
  );

  const busy = useMemo(() => domainEvents
    .map((e) => ({
      title: e.title ?? 'busy',
      start: e.start_time ?? e.startTime ?? '',
      end: e.end_time ?? e.endTime ?? '',
    }))
    .filter((b) => b.start && b.end), [domainEvents]);

  const tend = useTendWeek({
    pool, carryOver,
    weekStartYmd: localYmd(gridStart),
    todayYmd: localYmd(todayStart),
    busy,
    projectNameFor: (t) => (t.projectId ? projectsMap.get(t.projectId)?.name : undefined),
  });

  // Every apply is undoable (spec). Bucket-moving kinds capture prior
  // bucket/scheduledFor here and restore them via one setBucket call each.
  //
  // Merge is handled entirely here, NOT via applyProposal + deleteTaskWithUndo:
  // deleteTaskWithUndo (handleLetGo) pushes its OWN undo action into the
  // single-slot undo store on every call, so dropping N≥2 duplicates would
  // push N undo actions and only the last (most recent) survives — the rest
  // are silently unrecoverable. Instead: snapshot every dropped task from
  // tasksById before deleting, delete each via the RAW deleteTask (no
  // per-call undo), then push exactly ONE undo action that recreates every
  // snapshot. Restore fields mirror handleLetGo's recreate-body exactly.
  const handleApplyProposal = useCallback((p: TendProposal) => {
    if (p.kind === 'merge') {
      const dropTasks = p.dropIds
        .map((id) => tasksById.get(id))
        .filter((t): t is Task => !!t);
      undo.pushAction('Merged duplicates', () => {
        for (const t of dropTasks) {
          void addTask(t.title, t.contactId, t.projectId, t.scheduledFor, {
            bucket: t.bucket,
            context: t.context ?? undefined,
            assignedTo: t.assignedTo ?? null,
            assignedToAll: t.assignedToAll,
            goalId: t.goalId,
            sourceId: t.sourceId,
            phoneNumber: t.phoneNumber,
            isFun: t.isFun,
            // Mirrors handleLetGo's recreate-body exactly (see shared.tsx) —
            // notes/links/parentTaskId are restorable via the existing addTask
            // options; weekStart is not (see the note there).
            notes: t.notes,
            links: t.links,
            parentTaskId: t.parentTaskId,
          });
        }
      });
      for (const t of dropTasks) deleteTask(t.id);
      return;
    }
    const ids = p.kind === 'place' ? p.taskIds : [p.taskId];
    const prior = ids
      .map((id) => tasksById.get(id))
      .filter((t): t is Task => !!t)
      .map((t) => ({ id: t.id, bucket: t.bucket ?? 'week', scheduledFor: t.scheduledFor, isAllDay: t.isAllDay }));
    const label = p.kind === 'put_aside' ? 'Put aside' : p.kind === 'regrade' ? `Moved to ${p.to}` : 'Placed';
    undo.pushAction(`${label} · Tend`, () => {
      for (const t of prior) setBucket(t.id, t.bucket, t.scheduledFor ? new Date(t.scheduledFor) : undefined, t.isAllDay);
    });
    applyProposal(p, { setBucket, deleteTask: deleteTaskWithUndo });
  }, [setBucket, deleteTaskWithUndo, deleteTask, addTask, tasksById, undo]);

  // Click-to-create on an empty grid slot (week-grid-click spec): one atomic
  // addTask with scheduledFor riding the INSERT — bucket:'timed' is derived
  // from it (useSupabaseTasks.ts), so this never needs a follow-up setBucket.
  // Mirrors onCreateTaskFromValue's option stamping in shared.tsx.
  // This page is placementGrain="day", so the date arriving here is midnight —
  // the clicked slot's hour is deliberately discarded. isAllDay MUST follow: a
  // midnight task that isn't all-day renders at the 12 AM row, outside the
  // grid's 6 AM–10 PM window, so it would be written and invisible.
  const onCreateTaskAt = useCallback((title: string, scheduledFor: Date) => {
    void addTask(title, undefined, undefined, scheduledFor, {
      isAllDay: true,
      assignedTo: getCurrentUserMember()?.id,
      context: currentDomain !== 'universal' ? currentDomain : undefined,
    });
  }, [addTask, getCurrentUserMember, currentDomain]);

  const shelf = useMemo(() => ({
    carryOverIds, staleWeekIds, onBringForward, projectsMap, tasksById,
    onOpenTask: (id: string) => scheduleActionsValue.onOpenTask?.(id),
    onSetBucket: setBucket,
    onDeleteTask: deleteTaskWithUndo,
    onPushTask: pushTask,
    onCompleteTask: toggleTask,
    draft, onDraftChange: setDraft, onSubmitDraft: () => void submitDraft(),
    tend, onApplyProposal: handleApplyProposal,
  }), [carryOverIds, staleWeekIds, onBringForward, projectsMap, tasksById,
       scheduleActionsValue.onOpenTask, setBucket, toggleTask,
       deleteTaskWithUndo, pushTask, draft, setDraft, submitDraft, tend, handleApplyProposal]);

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <div className="h-full flex flex-col">
        <div className={`${PAGE_COLUMN} shrink-0`}>
          <header className="mb-3 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">{label}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {displayPeriod} · {placedThisWeek.length} placed, {shelfCount ?? pool.length} to place
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              <CascadeRail current={horizon} counts={railCounts} onGo={(h) => navigate(`/${h}`)} />
              <div className="flex items-center gap-3">
                {!planDisabled && (
                  <button type="button" onClick={handlePlan} title={`Plan the ${rungName}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:text-primary-800 transition-colors">
                    <CalendarRange className="w-3.5 h-3.5" /> Plan the {rungName}
                  </button>
                )}
                {hasExplainer && (
                  <button type="button" onClick={() => setExplainerOpen(true)}
                    className="text-[12px] text-neutral-400 hover:text-primary-700 transition-colors">
                    What is this level?
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* Week identity line — the rung's one question. Mirrors MonthPage's. */}
          <p className="mb-3 text-[12px] text-neutral-400">
            Drop a move on a day to place it — what time is Today&rsquo;s question.
          </p>
        </div>

        {/* One surface: shelf above, week grid below. A task is on a day or
            on the shelf — never both, never listed again elsewhere. */}
        <div className="flex-1 min-h-0">
          <PlanningSession
            key={localYmd(gridStart)}
            tasks={sessionTasks}
            events={domainEvents}
            routines={[]}
            familyMembers={familyMembers}
            eventNotesMap={eventNotesMap}
            onUpdateTask={updateTask}
            onPushTask={pushTask}
            onCreateTaskAt={onCreateTaskAt}
            onClose={() => {}}
            initialDate={gridStart}
            initialDays={7}
            minDropDate={todayStart}
            onOpenDay={(d) => navigate(`/today?date=${localYmd(d)}`)}
            embedded
            shelf={shelf}
            // The week rung answers "which day" and stops there. A drop lands
            // all-day on the day it was dropped in; the time is Today's call.
            placementGrain="day"
            onRescheduleEvent={rescheduleEvent}
            onShelfCount={setShelfCount}
            canMoveEvent={canMoveEvent}
          />
        </div>
      </div>
      <HorizonExplainer horizon={horizon} open={explainerOpen} onClose={() => setExplainerOpen(false)} />
      <UndoToast action={undo.currentAction} onUndo={undo.executeUndo} onDismiss={undo.dismiss} />
    </ScheduleActionsProvider>
  );
}
