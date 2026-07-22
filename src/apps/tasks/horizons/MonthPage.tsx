// src/apps/tasks/horizons/MonthPage.tsx
//
// Month: a real calendar grid (big rocks placed on actual days) plus the
// month's own pool, grouped by project, with the season's picks folded in for
// reference.
//
// Extracted verbatim from the former HorizonView.tsx common return branch
// (mechanical split — no behavior change; horizon fixed to 'month').

import { PAGE_COLUMN } from '@/components/layout/pageLayout';
import { MonthCalendarGrid } from '@/components/planning/horizon/MonthCalendarGrid';
import { CalendarRange, Plus, ChevronRight, FolderOpen } from 'lucide-react';
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext';
import { UndoToast } from '@/components/undo/UndoToast';
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer';
import { servingCount } from '@/lib/planning/betPulse';
import { readCadenceConfig } from '@/lib/cadence/config';
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

export function MonthPage() {
  const horizon = 'month' as const;
  const {
    navigate, updateTask, handleSelect, domainTasks, domainEvents, viewedDate,
    railCounts, period, progress, total, placedThisWeek, carryOver, pool,
    planDisabled, handlePlan, rungName, isCascadeRung, hasExplainer,
    explainerOpen, setExplainerOpen, label, grouped, renderRow,
    horizonBucket, draft, setDraft, submitDraft,
    scheduleActionsValue, undo, referenceFold,
  } = useHorizonPageData(horizon);

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

          {/* Month identity line — framing for moves (concrete chunks) */}
          <p className="mb-3 text-[12px] text-neutral-400">
            Moves — concrete chunks that fit in a sitting; 10–15 is a good month.
            {(() => { const s = servingCount(domainTasks); return s.total > 0 ? ` Serving ${s.serving} of ${s.total} picks.` : ''; })()}
          </p>

          {/* Month as a real calendar grid — the month's big rocks placed on
              actual days (the first of the per-horizon calendar views). */}
          <div className="mb-8">
            <MonthCalendarGrid
              month={viewedDate}
              tasks={domainTasks}
              events={domainEvents}
              weekStartsOn={readCadenceConfig().weekStartsOn}
              onPlaceTask={(id, day) => updateTask(id, { bucket: 'timed', scheduledFor: day })}
              onUnscheduleTask={(id) => updateTask(id, { bucket: 'month', scheduledFor: undefined })}
              onSelectTask={handleSelect}
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
