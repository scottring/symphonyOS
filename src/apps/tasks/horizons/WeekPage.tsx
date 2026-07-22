// src/apps/tasks/horizons/WeekPage.tsx
//
// Week: the standing 7-day grid (place rocks straight from the drawer onto
// days) plus carry-over, placed-this-week, and the week's own pool.
//
// Extracted verbatim from the former HorizonView.tsx common return branch
// (mechanical split — no behavior change; horizon fixed to 'week').

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PAGE_COLUMN } from '@/components/layout/pageLayout';
import { PlanningSession } from '@/components/planning/PlanningSession';
import { CalendarRange, Plus, ChevronRight, FolderOpen } from 'lucide-react';
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext';
import { UndoToast } from '@/components/undo/UndoToast';
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer';
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config';
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
  // (via minDropDate, unchanged below), and — via `anchorDate` below — which
  // week's tasks the grid filters to. Parsed before the data hook so it can
  // thread straight through. The pool/carry-over sections stay bucket-based
  // (this week only) — see report for why that's fine.
  const [searchParams] = useSearchParams();
  const startAnchor = parseLocalYmd(searchParams.get('start'));
  const anchoredWeekStart = useMemo(() => {
    if (!startAnchor) return null;
    return weekStartAnchor(startAnchor, readCadenceConfig().weekStartsOn);
  }, [startAnchor]);

  const {
    navigate, allRoutines, familyMembers, eventNotesMap, updateTask, pushTask,
    domainEvents, weekGridTasks, weekGridStart, todayStart, railCounts,
    period, placedThisWeek, carryOver, pool,
    planDisabled, handlePlan, rungName, isCascadeRung, hasExplainer,
    explainerOpen, setExplainerOpen, label, grouped, renderRow,
    horizonBucket, draft, setDraft, submitDraft,
    scheduleActionsValue, undo,
  } = useHorizonPageData(horizon, anchoredWeekStart ?? undefined);

  const gridInitialDate = anchoredWeekStart ?? weekGridStart;
  const displayPeriod = anchoredWeekStart
    ? `Week of ${anchoredWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : (period ?? label);

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <div className="h-full overflow-y-auto">
        <div className={PAGE_COLUMN}>
          <header className="mb-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">{label}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {displayPeriod} · {placedThisWeek.length} placed, {pool.length} to place
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
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
          <div className="mb-8 h-[60vh] min-h-[420px]">
            <PlanningSession
              key={localYmd(gridInitialDate)}
              tasks={weekGridTasks}
              events={domainEvents}
              routines={allRoutines}
              familyMembers={familyMembers}
              eventNotesMap={eventNotesMap}
              onUpdateTask={updateTask}
              onPushTask={pushTask}
              onClose={() => {}}
              initialDate={gridInitialDate}
              initialDays={7}
              showDone={false}
              minDropDate={todayStart}
              onOpenDay={(d) => navigate(`/today?date=${localYmd(d)}`)}
              embedded
            />
          </div>

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

          {/* Projects in motion — the pool grouped by project, loose tasks after. */}
          {grouped.groups.map(({ project, items }) => (
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

          {/* The rest of the pool (loose tasks), or the empty invitation. */}
          <section>
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

            {/* Add directly into this horizon's pool. The placeholder speaks
                the level's grain (outcome / chunk / task) — the input is where
                the grain gauge either holds or leaks. */}
            {horizonBucket && (
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
