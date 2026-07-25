// src/apps/tasks/horizons/YearPage.tsx
//
// Year: the top of the cascade, and the only surface in the app that shows
// time passing against intent.
//
// Two things share one time scale — the ribbon (seasons, claims, elapsed,
// weekly density) and the ledger beneath it (every active goal, and how far it
// has actually descended). The old page stacked twelve equal month boxes over
// an unrelated goal list; eight of the boxes held a dash, and a goal's life
// across the year was invisible. See tasks/2026-07-25-horizon-cascade-redesign.md.
//
// READ-ONLY by design: the year asks what's already claimed. "Which week" is
// the month's decision, "which day" the week's, "what time" Today's.

import { PAGE_COLUMN_FULL } from '@/components/layout/pageLayout';
import { YearRibbon } from '@/components/planning/horizon/YearRibbon';
import { GoalLedger } from '@/components/planning/horizon/GoalLedger';
import { CalendarRange, Target } from 'lucide-react';
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer';
import { CascadeRail, useHorizonPageData } from './shared';

export function YearPage() {
  const {
    navigate, goals, areas, tasks, domainTasks, domainEvents, railCounts,
    period, progress, hasExplainer, explainerOpen, setExplainerOpen,
  } = useHorizonPageData('year');

  const activeGoals = goals.filter((g) => g.status === 'active');
  const hasGoals = activeGoals.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      {/* Full-bleed: a year drawn as one axis wants every pixel of width it can
          get — a 940px column would compress twelve months into half a screen. */}
      <div className={PAGE_COLUMN_FULL}>
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-neutral-400">This Year</p>
            <h1 className="font-display text-3xl font-semibold text-neutral-800 mt-0.5">{period}</h1>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            {progress && (
              <p className="text-xs text-neutral-500">
                <strong className="font-semibold text-primary-700">
                  {progress.total - progress.day} days left
                </strong>
              </p>
            )}
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

        <div className="mb-10">
          <YearRibbon
            year={new Date().getFullYear()}
            tasks={domainTasks}
            events={domainEvents}
          />
        </div>

        {!hasGoals ? (
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
            <GoalLedger
              goals={activeGoals}
              areas={areas}
              tasks={tasks}
              domainTasks={domainTasks}
              onOpenGoal={(id) => navigate(`/goals/${id}`)}
            />
            <button
              type="button"
              onClick={() => navigate('/goals')}
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
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
