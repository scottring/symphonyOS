// src/apps/tasks/horizons/YearPage.tsx
//
// Year: the top of the cascade. Annual goals live HERE, on the rung — grouped
// by life area, each showing its progress through this season's moves — with
// doors into the annual session and the Goals library.
//
// Extracted verbatim from the former HorizonView.tsx `horizon === 'year'`
// early-return branch (mechanical split — no behavior change).

import { PAGE_COLUMN } from '@/components/layout/pageLayout';
import { YearCalendarGrid } from '@/components/planning/horizon/YearCalendarGrid';
import { MonthZoomSheet } from '@/components/planning/horizon/MonthZoomSheet';
import { CalendarRange, Target, ChevronRight } from 'lucide-react';
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer';
import { goalRollup } from '@/lib/planning/lineage';
import type { Task } from '@/types/task';
import type { Goal } from '@/types/goal';
import { CascadeRail, useHorizonPageData } from './shared';

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

export function YearPage() {
  const {
    navigate, goals, areas, tasks, domainTasks, domainEvents, railCounts,
    period, progress, hasExplainer, explainerOpen, setExplainerOpen,
    zoomMonth, setZoomMonth, updateTask, handleSelect,
  } = useHorizonPageData('year');

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
