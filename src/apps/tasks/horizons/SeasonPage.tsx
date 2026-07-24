// src/apps/tasks/horizons/SeasonPage.tsx
//
// Season — picks and a shape (spec 2026-07-20, revised 2026-07-21: picking is
// EXPLICIT). Focus line, the chosen picks as cards, the bench below a hard
// divider, the season's three months.
//
// Extracted verbatim from the former HorizonView.tsx common return branch +
// its `horizon === 'season'` block (mechanical split — no behavior change;
// horizon fixed to 'season').

import { PAGE_COLUMN } from '@/components/layout/pageLayout';
import { CalendarRange, Plus, Sparkles, Target } from 'lucide-react';
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext';
import { UndoToast } from '@/components/undo/UndoToast';
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer';
import { ListSuggestions } from '@/components/planning/guided/ListSuggestions';
import { BetsGrid } from '@/components/planning/season/BetsGrid';
import { OverflowTray } from '@/components/planning/season/OverflowTray';
import { MonthStrip } from '@/components/planning/season/MonthStrip';
import { FocusLine } from '@/components/planning/season/FocusLine';
import { matchesDomain } from '@/lib/today/domainFilter';
import { partitionSeason, PICK_CAP } from '@/lib/planning/betPulse';
import { looksLikeActivity } from '@/lib/planning/outcomeCoach';
import { goalsWithoutMoves } from '@/lib/planning/lineage';
import { CascadeRail, useHorizonPageData } from './shared';

export function SeasonPage() {
  const horizon = 'season' as const;
  const {
    navigate, updateTask, toggleTask, handleSelect, domainTasks, goalsById,
    railCounts, period, progress, total, placedThisWeek, carryOver, pool,
    planDisabled, handlePlan, rungName, isCascadeRung, hasExplainer,
    explainerOpen, setExplainerOpen, label, renderRow,
    seasonNotes, patchSeasonNotes, composerRef, draft, setDraft, submitDraft,
    sharpenBet, sharpenBetLoading, goals, currentDomain, areas, addGoal,
    handleLetGo, referenceFold,
    setRefOpen, setTranslatingRefId, setRefDraft,
    scheduleActionsValue, undo,
  } = useHorizonPageData(horizon);

  const { picks, bench } = partitionSeason(domainTasks);

  // The read side of the thread, at the season altitude: active goals (this
  // domain) that carry no season pick yet. Domain-filtered on both sides —
  // domainTasks for coverage, the goal list for the goals themselves — so a
  // work goal never surfaces on the Family season page.
  const uncovered = goalsWithoutMoves(
    goals.filter((g) => matchesDomain(g.context, currentDomain)),
    domainTasks,
    'quarter',
  );

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
                  {total === 0 ? 'Nothing here yet' : `${pool.length} open`}
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

          {/* Season — the season spread (design pass 2026-07-21). One dominant
              panel (the picks, with the cap rendered as ARCHITECTURE: eight
              positions, open slots visible), a quiet right rail (the three
              months, the goals to draw from, the composer), and the bench as
              a collapsed drawer at the very bottom. */}
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
                      aria-label="Add an outcome for this season"
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

            {/* Coverage — the year goals this season hasn't picked up yet. A
                quiet coach nudge under the picks; each goal is one tap into the
                same goal-anchored "add a season move" composer the reference
                fold opens (setTranslatingRefId), so the new pick threads back
                to its goal. Shown only when something is uncovered. */}
            {uncovered.length > 0 && (
              <section className="mt-8">
                <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                  Goals not yet picked this season
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {uncovered.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => { setRefOpen(true); setTranslatingRefId(g.id); setRefDraft(''); }}
                        title={`Pick a season move for “${g.name}”`}
                        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-neutral-200 text-neutral-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50/50 transition-colors"
                      >
                        <Target aria-hidden="true" className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="truncate max-w-[220px]">{g.name}</span>
                        <Plus aria-hidden="true" className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
              onMakeGoal={async (id, title) => {
                // Goal-sized bench item → a real goal. Filed under the first
                // life area (movable on /goals); context follows the domain.
                const area = [...areas].sort((a, b) => a.sortOrder - b.sortOrder)[0];
                if (!area) return null;
                const created = await addGoal(area.id, title, currentDomain !== 'universal' ? currentDomain : undefined);
                if (!created) return null;
                // Stamp the task↔goal link immediately — the task's fate
                // (first move vs. shelved) is still pending, but the link
                // must survive regardless of what happens to that prompt.
                void updateTask(id, { goalId: created.id });
                return created.id;
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

          {/* Carry-over — never populated for season (only week shows carry
              over); kept for parity with the shared scaffold. */}
          {carryOver.length > 0 && (
            <section className="mb-6">
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                Carried over ({carryOver.length})
              </h2>
              <div className="space-y-2">{carryOver.map(renderRow)}</div>
            </section>
          )}

          {/* Placed this week — never populated for season; kept for parity
              with the shared scaffold. */}
          {placedThisWeek.length > 0 && (
            <section className="mb-6">
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                Placed this week ({placedThisWeek.length})
              </h2>
              <div className="space-y-2">{placedThisWeek.map(renderRow)}</div>
            </section>
          )}

          {/* Bets render as cards above, not rows — the project-grouped pool
              and generic composer are suppressed for season (matches the
              original shared return, which rendered an empty <section> here). */}
          <section />
        </div>
        <HorizonExplainer horizon={horizon} open={explainerOpen} onClose={() => setExplainerOpen(false)} />
        <UndoToast action={undo.currentAction} onUndo={undo.executeUndo} onDismiss={undo.dismiss} />
      </div>
    </ScheduleActionsProvider>
  );
}
