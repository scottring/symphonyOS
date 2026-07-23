// src/apps/tasks/horizons/WeekPage.tsx
//
// Week: ONE surface — the shelf (unplaced pool, Tend-able) above a full-width
// 7-day grid. A task lives on a day or on the shelf, never both, never
// listed again elsewhere on the page (no carry-over section, no placed
// section, no project-grouped lists — those all collapsed into the shelf).

import { useCallback, useMemo } from 'react';
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
    period, placedThisWeek, carryOver, pool,
    planDisabled, handlePlan, rungName, hasExplainer,
    explainerOpen, setExplainerOpen, label,
    draft, setDraft, submitDraft,
    scheduleActionsValue, undo,
    setBucket, deleteTaskWithUndo, projectsMap, tasksById, weekAnchor,
    addTask, deleteTask,
  } = useHorizonPageData(horizon, anchoredWeekStart ?? undefined);

  const gridStart = anchoredWeekStart ?? weekAnchor;
  const displayPeriod = anchoredWeekStart
    ? `Week of ${anchoredWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : (period ?? label);

  const carryOverIds = useMemo(() => new Set(carryOver.map((t) => t.id)), [carryOver]);

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

  const shelf = useMemo(() => ({
    carryOverIds, projectsMap, tasksById,
    onOpenTask: (id: string) => scheduleActionsValue.onOpenTask?.(id),
    onSetBucket: (id: string, bucket: 'week' | 'month' | 'someday') => setBucket(id, bucket),
    onDeleteTask: deleteTaskWithUndo,
    onPushTask: pushTask,
    draft, onDraftChange: setDraft, onSubmitDraft: () => void submitDraft(),
    tend, onApplyProposal: handleApplyProposal,
  }), [carryOverIds, projectsMap, tasksById, scheduleActionsValue.onOpenTask, setBucket,
       deleteTaskWithUndo, pushTask, draft, setDraft, submitDraft, tend, handleApplyProposal]);

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <div className="h-full flex flex-col">
        <div className={`${PAGE_COLUMN} shrink-0`}>
          <header className="mb-3 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">{label}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {displayPeriod} · {placedThisWeek.length} placed, {pool.length} to place
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
            onClose={() => {}}
            initialDate={gridStart}
            initialDays={7}
            minDropDate={todayStart}
            onOpenDay={(d) => navigate(`/today?date=${localYmd(d)}`)}
            embedded
            shelf={shelf}
          />
        </div>
      </div>
      <HorizonExplainer horizon={horizon} open={explainerOpen} onClose={() => setExplainerOpen(false)} />
      <UndoToast action={undo.currentAction} onUndo={undo.executeUndo} onDismiss={undo.dismiss} />
    </ScheduleActionsProvider>
  );
}
