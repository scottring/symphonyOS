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
import { servingCount, partitionSeason } from '@/lib/planning/betPulse';
import { monthShelfGroups } from '@/lib/planning/monthGroups';
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
    setBucket, deleteTaskWithUndo, projectsMap, tasksById, goalsById,
    addTask, deleteTask, toggleTask, pushTask, todayStart,
  } = useHorizonPageData(horizon);

  // Placed-this-month count for the masthead subtitle — no existing selector
  // covers this (selectPlacedInWeek is week-only), so it's derived here from
  // the already-fetched domainTasks.
  //
  // TWO kinds of placed, and both must count. Dropping a move on a week row
  // gives it bucket='week' + a week_start and NO date, so counting only
  // bucket='timed' would make placing something drop it out of the unplaced
  // count AND never enter the placed count — the page would read as if the
  // work evaporated. (Same failure mode as the all-day lane's "+N more".)
  const monthPlacedCount = useMemo(() => {
    const start = new Date(viewedDate.getFullYear(), viewedDate.getMonth(), 1);
    const end = new Date(viewedDate.getFullYear(), viewedDate.getMonth() + 1, 1);
    const inMonth = (d: Date) => d >= start && d < end;
    return domainTasks.filter((t) => {
      if (t.completed) return false;
      if (!match(t.assignedTo, t.assignedToAll)) return false;
      // Placed on a day inside the month.
      if (t.bucket === 'timed' && t.scheduledFor) return inMonth(new Date(t.scheduledFor));
      // Placed on a week whose start falls inside the month.
      if (t.bucket === 'week' && t.weekStart) return inMonth(new Date(t.weekStart));
      return false;
    }).length;
  }, [domainTasks, match, viewedDate]);

  // Done-this-month count for the masthead subtitle's "celebrate wins" step
  // (Best Laid Plans reframe) — completed tasks that belong to the month:
  // still-undated bucket='month' items (finished before ever hitting a day),
  // or scheduled inside the viewed month. Same domain match() as the placed
  // count, same LOCAL date-part math as the rest of this page.
  const monthDoneCount = useMemo(() => {
    const start = new Date(viewedDate.getFullYear(), viewedDate.getMonth(), 1);
    const end = new Date(viewedDate.getFullYear(), viewedDate.getMonth() + 1, 1);
    return domainTasks.filter((t) => {
      if (!t.completed) return false;
      if (!match(t.assignedTo, t.assignedToAll)) return false;
      if (t.bucket === 'month') return true;
      if (!t.scheduledFor) return false;
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
      .map((t) => ({ id: t.id, bucket: t.bucket ?? 'month', scheduledFor: t.scheduledFor, isAllDay: t.isAllDay }));
    const proposalLabel = p.kind === 'put_aside' ? 'Put aside' : p.kind === 'regrade' ? `Moved to ${p.to}` : 'Placed';
    undo.pushAction(`${proposalLabel} · Tend`, () => {
      for (const t of prior) setBucket(t.id, t.bucket, t.scheduledFor ? new Date(t.scheduledFor) : undefined, t.isAllDay);
    });
    applyProposal(p, { setBucket, deleteTask: deleteTaskWithUndo });
  }, [setBucket, deleteTaskWithUndo, deleteTask, addTask, tasksById, undo]);

  // "<Month>'s moves" — the shelf reframed as the month's own curated list
  // (Best Laid Plans reframe), not a placement queue. Straight apostrophe:
  // matches the codebase's dominant UI-string convention (see e.g. YearPage's
  // "doesn't have goals yet", shared.tsx's "don't start stay").
  const shelfPoolLabel = `${viewedDate.toLocaleDateString('en-US', { month: 'long' })}'s moves`;

  // Roll-up: steps of the same move read as ONE line (the season pick they
  // serve, or their project once three-plus pile up). Keeps the month legible
  // as a plan rather than a chore list — see monthGroups.
  const shelfGroups = useMemo(
    () => monthShelfGroups(pool, domainTasks, projectsMap),
    [pool, domainTasks, projectsMap],
  );

  // File a shelf move under a season pick, from the page — the wizard's
  // move-by-pick step was the only place this thread could be tied; now the
  // pill's fate menu ties it too. Threads BOTH sourceId (precise pick
  // attribution) and goalId (goal roll-up), exactly like MoveByPickStep.
  const seasonPicks = useMemo(() => partitionSeason(domainTasks).picks, [domainTasks]);
  const fileUnder = useMemo(() => {
    if (seasonPicks.length === 0) return undefined;
    return {
      picks: seasonPicks.map((p) => ({
        id: p.id,
        title: p.title,
        goalName: p.goalId ? goalsById.get(p.goalId)?.name : undefined,
      })),
      onFile: (taskId: string, pickId: string) => {
        const pick = seasonPicks.find((p) => p.id === pickId);
        if (!pick) return;
        void updateTask(taskId, { sourceId: pick.id, goalId: pick.goalId });
      },
    };
  }, [seasonPicks, goalsById, updateTask]);

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <div className="h-full overflow-y-auto">
        <div className={PAGE_COLUMN}>
          <header className="mb-3 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">{label}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {period ?? label} · {monthPlacedCount} on the calendar · {pool.length} in motion · {monthDoneCount} done
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

          {/* Month identity line — framing for moves (concrete chunks), and the
              rung's one question: which week. */}
          <p className="mb-3 text-[12px] text-neutral-400">
            Moves — concrete chunks that fit in a sitting; 10–15 is a good month.
            {' '}Drop one on a week to place it — which day is the week&rsquo;s question.
            {(() => { const s = servingCount(domainTasks); return s.total > 0 ? ` Serving ${s.serving} of ${s.total} picks.` : ''; })()}
          </p>
        </div>

        {/* Full width below the masthead (mirrors WeekPage): shelf above the
            calendar grid, reference fold below. A task lives on a day or on
            the shelf — never both, never listed again elsewhere on the page. */}
        <div className="px-3 pb-8">
          {/* One surface: shelf above, month grid below. */}
          <div className="mb-6">
            <PlanningShelf
              dragMode="native"
              tasks={pool}
              carryOverIds={NO_CARRY_OVER}
              poolLabel={shelfPoolLabel}
              groups={shelfGroups}
              projectsMap={projectsMap}
              tasksById={tasksById}
              onOpenTask={(id) => scheduleActionsValue.onOpenTask?.(id)}
              onSetBucket={setBucket}
              onDeleteTask={deleteTaskWithUndo}
              onPushTask={pushTask}
              onCompleteTask={toggleTask}
              fileUnder={fileUnder}
              onNativeUnschedule={(id) => updateTask(id, { bucket: 'month', scheduledFor: undefined })}
              draft={draft}
              onDraftChange={setDraft}
              onSubmitDraft={() => void submitDraft()}
              draftPlaceholder="Add a chunk to this month — an order placed, a call made…"
              tendingLabel="Tending this month"
              tend={tend}
              onApplyProposal={handleApplyProposal}
            />
          </div>

          {/* The month as WEEK STRIPS — one row per week, no day columns,
              because the month rung places into a week. The shelf above takes
              the rail's role (hideRail), so a rock is never rendered twice. */}
          <div className="mb-8">
            <MonthCalendarGrid
              month={viewedDate}
              tasks={domainTasks}
              events={domainEvents}
              weekStartsOn={readCadenceConfig().weekStartsOn}
              hideRail
              // A month move places onto a WEEK, not a day — the month rung's
              // one decision is "which week". The week page then asks which
              // day, and Today asks what time.
              //
              // scheduledFor is CLEARED, not merely left unwritten: dropping an
              // already-dated chip onto a row means "move it to that week", and
              // keeping the old date alongside bucket='week' would break the
              // invariant that a scheduled_for implies bucket='timed' — leaving
              // the item dated but absent from every day view.
              //
              // Genuinely dated things ("dentist Tuesday") use the date picker
              // in triage, so a drop here means exactly one thing.
              onPlaceTaskInWeek={(id, weekStart) => updateTask(id, {
                bucket: 'week', weekStart, scheduledFor: undefined, isAllDay: false,
              })}
              // Back to the shelf clears the week too — otherwise an item
              // returns to "unplaced" still secretly carrying a week.
              onUnscheduleTask={(id) => updateTask(id, { bucket: 'month', scheduledFor: undefined, weekStart: undefined })}
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
