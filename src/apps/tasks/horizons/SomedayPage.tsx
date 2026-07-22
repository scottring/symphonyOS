// src/apps/tasks/horizons/SomedayPage.tsx
//
// Someday: a timeless pool, reviewed during seasonal planning. Not part of
// the year → today cascade rail; no planning session of its own.
//
// This page isn't named in the Task 1 brief's file list (which covers
// Week/Month/Season/Year), but HorizonView.tsx has always also served
// `horizon="someday"` via the exact same shared return branch, and
// `TasksApp.tsx` imports `SomedayView` — so it must keep working. Extracted
// verbatim from the former HorizonView.tsx common return branch (mechanical
// split — no behavior change; horizon fixed to 'someday').

import { PAGE_COLUMN } from '@/components/layout/pageLayout';
import { CalendarRange, Plus, ChevronRight, FolderOpen } from 'lucide-react';
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext';
import { UndoToast } from '@/components/undo/UndoToast';
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer';
import { useHorizonPageData } from './shared';

export function SomedayPage() {
  const horizon = 'someday' as const;
  const {
    navigate,
    period, progress, total, placedThisWeek, carryOver, pool,
    planDisabled, handlePlan, rungName, hasExplainer,
    explainerOpen, setExplainerOpen, label, grouped, renderRow,
    horizonBucket, draft, setDraft, submitDraft,
    scheduleActionsValue, undo,
  } = useHorizonPageData(horizon);
  // Someday sits outside the cascade rail (isCascadeRung is always false here
  // — `horizon !== 'someday'` — so the rail block from the shared scaffold is
  // simply omitted below, matching the original's `{isCascadeRung && (...)}`).

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

          {/* Carry-over — never populated for someday; kept for parity with
              the shared scaffold. */}
          {carryOver.length > 0 && (
            <section className="mb-6">
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                Carried over ({carryOver.length})
              </h2>
              <div className="space-y-2">{carryOver.map(renderRow)}</div>
            </section>
          )}

          {/* Placed this week — never populated for someday; kept for parity
              with the shared scaffold. */}
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
