// src/apps/tasks/horizons/MonthPage.tsx
//
// Month: ONE surface — the shelf (unplaced pool, Tend-able) above a real
// calendar grid (big rocks placed on actual days), with the season's picks
// folded in for reference below. A task lives on a day or on the shelf,
// never both, never listed again elsewhere on the page (no carried-over
// section, no project-grouped lists — those all collapsed into the shelf,
// mirroring WeekPage's one-surface shape).

import { useCallback, useMemo } from 'react';
import { PAGE_COLUMN } from '@/components/layout/pageLayout';
import { MonthCalendarGrid } from '@/components/planning/horizon/MonthCalendarGrid';
import { PlanningShelf } from '@/components/planning/PlanningShelf';
import { CalendarRange } from 'lucide-react';
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext';
import { UndoToast } from '@/components/undo/UndoToast';
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer';
import { servingCount } from '@/lib/planning/betPulse';
import { readCadenceConfig } from '@/lib/cadence/config';
import { useTendWeek } from '@/hooks/useTendWeek';
import { applyProposal } from '@/lib/tend/applyProposal';
import type { TendProposal } from '@/lib/tend/types';
import type { Task } from '@/types/task';
import { CascadeRail, useHorizonPageData } from './shared';

// LOCAL date parts, never toISOString() — UTC would shift the date near
// midnight in negative-UTC-offset timezones (the week-row's Sunday could
// read back as Saturday for anyone west of Greenwich).
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Stable empty set for `carryOverIds` — the month grain has no carry-over
// concept (that's week-only), but a fresh `new Set()` literal on every render
// would give PlanningShelf's `ordered` useMemo a new dependency identity each
// time, defeating its memoization. Module-level so the reference never changes.
const NO_CARRY_OVER = new Set<string>();

export function MonthPage() {
  const horizon = 'month' as const;
  const {
    navigate, updateTask, domainTasks, domainEvents, viewedDate,
    railCounts, period, pool, match,
    planDisabled, handlePlan, rungName, hasExplainer,
    explainerOpen, setExplainerOpen, label,
    draft, setDraft, submitDraft,
    scheduleActionsValue, undo, referenceFold,
    setBucket, deleteTaskWithUndo, projectsMap, tasksById,
    addTask, deleteTask, pushTask, todayStart,
  } = useHorizonPageData(horizon);

  // Placed-this-month count for the masthead subtitle — no existing selector
  // covers this (selectPlacedInWeek is week-only), so it's derived here from
  // the already-fetched domainTasks: bucket flips month→timed on placement
  // (mirrors MonthCalendarGrid's onPlaceTask), same convention as the week
  // page's placedThisWeek.
  const monthPlacedCount = useMemo(() => {
    const start = new Date(viewedDate.getFullYear(), viewedDate.getMonth(), 1);
    const end = new Date(viewedDate.getFullYear(), viewedDate.getMonth() + 1, 1);
    return domainTasks.filter((t) => {
      if (t.completed || t.bucket !== 'timed' || !t.scheduledFor) return false;
      if (!match(t.assignedTo, t.assignedToAll)) return false;
      const d = new Date(t.scheduledFor);
      return d >= start && d < end;
    }).length;
  }, [domainTasks, match, viewedDate]);

  // Month-grain Tend window — the first and last day of the viewed month,
  // computed from LOCAL date parts (never Date.parse), same convention as
  // the rest of this page's date math.
  const monthStartYmd = useMemo(
    () => localYmd(new Date(viewedDate.getFullYear(), viewedDate.getMonth(), 1)),
    [viewedDate],
  );
  const monthEndYmd = useMemo(
    () => localYmd(new Date(viewedDate.getFullYear(), viewedDate.getMonth() + 1, 0)),
    [viewedDate],
  );

  const busy = useMemo(() => domainEvents
    .map((e) => ({
      title: e.title ?? 'busy',
      start: e.start_time ?? e.startTime ?? '',
      end: e.end_time ?? e.endTime ?? '',
    }))
    .filter((b) => b.start && b.end), [domainEvents]);

  // `weekStartYmd` stays required by the args type but is unused at month
  // grain — the tend window uses `monthEndYmd` instead; the first of the
  // viewed month is passed to satisfy the type.
  const tend = useTendWeek({
    pool, carryOver: [], grain: 'month', monthEndYmd,
    weekStartYmd: monthStartYmd,
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
      .map((t) => ({ id: t.id, bucket: t.bucket ?? 'month', scheduledFor: t.scheduledFor, isAllDay: t.isAllDay }));
    const proposalLabel = p.kind === 'put_aside' ? 'Put aside' : p.kind === 'regrade' ? `Moved to ${p.to}` : 'Placed';
    undo.pushAction(`${proposalLabel} · Tend`, () => {
      for (const t of prior) setBucket(t.id, t.bucket, t.scheduledFor ? new Date(t.scheduledFor) : undefined, t.isAllDay);
    });
    applyProposal(p, { setBucket, deleteTask: deleteTaskWithUndo });
  }, [setBucket, deleteTaskWithUndo, deleteTask, addTask, tasksById, undo]);

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <div className="h-full overflow-y-auto">
        <div className={PAGE_COLUMN}>
          <header className="mb-3 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">{label}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {period ?? label} · {monthPlacedCount} placed, {pool.length} to place
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

          {/* Month identity line — framing for moves (concrete chunks) */}
          <p className="mb-3 text-[12px] text-neutral-400">
            Moves — concrete chunks that fit in a sitting; 10–15 is a good month.
            {(() => { const s = servingCount(domainTasks); return s.total > 0 ? ` Serving ${s.serving} of ${s.total} picks.` : ''; })()}
          </p>

          {/* One surface: shelf above, month grid below. A task is on a day
              or on the shelf — never both, never listed again elsewhere. */}
          <div className="mb-6">
            <PlanningShelf
              dragMode="native"
              tasks={pool}
              carryOverIds={NO_CARRY_OVER}
              projectsMap={projectsMap}
              tasksById={tasksById}
              onOpenTask={(id) => scheduleActionsValue.onOpenTask?.(id)}
              onSetBucket={(id, bucket) => setBucket(id, bucket)}
              onDeleteTask={deleteTaskWithUndo}
              onPushTask={pushTask}
              onNativeUnschedule={(id) => updateTask(id, { bucket: 'month', scheduledFor: undefined })}
              moveDown={{ label: 'To week', bucket: 'week' }}
              draft={draft}
              onDraftChange={setDraft}
              onSubmitDraft={() => void submitDraft()}
              draftPlaceholder="Add a chunk to this month — an order placed, a call made…"
              tendingLabel="Tending this month"
              tend={tend}
              onApplyProposal={handleApplyProposal}
            />
          </div>

          {/* Month as a real calendar grid — the month's big rocks placed on
              actual days (the first of the per-horizon calendar views). The
              shelf above takes the rail's role (hideRail), so a rock is
              never rendered twice. */}
          <div className="mb-8">
            <MonthCalendarGrid
              month={viewedDate}
              tasks={domainTasks}
              events={domainEvents}
              weekStartsOn={readCadenceConfig().weekStartsOn}
              hideRail
              // isAllDay heuristic: MonthCalendarGrid builds `day` at
              // midnight for a fresh rock (no prior scheduledFor) but copies
              // over the dragged item's existing clock time when re-dragging
              // an already-timed item between cells. So midnight here means
              // "never had a time" → all-day; a preserved non-midnight time
              // means it stays a timed item.
              onPlaceTask={(id, day) => updateTask(id, {
                bucket: 'timed',
                scheduledFor: day,
                isAllDay: day.getHours() === 0 && day.getMinutes() === 0,
              })}
              onUnscheduleTask={(id) => updateTask(id, { bucket: 'month', scheduledFor: undefined })}
              onSelectTask={(id) => scheduleActionsValue.onOpenTask?.(id)}
              onOpenWeek={(d) => navigate(`/week?start=${localYmd(d)}`)}
            />
          </div>

          {/* The level above, for reference — folded into one quiet line so
              this level's OWN list leads the page. Month looks at the season
              list; season looks at the year's goals. Read-only: nothing moves,
              nothing has to line up. "Copy down" duplicates a line onto this
              list (the original stays where it lives, so the upper list is
              intact for its own review); lines already here show a check. */}
          {referenceFold}
        </div>
        <HorizonExplainer horizon={horizon} open={explainerOpen} onClose={() => setExplainerOpen(false)} />
        <UndoToast action={undo.currentAction} onUndo={undo.executeUndo} onDismiss={undo.dismiss} />
      </div>
    </ScheduleActionsProvider>
  );
}
