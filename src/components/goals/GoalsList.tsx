import { useState, useRef, useEffect } from 'react'
import { Sparkles, FolderInput, Plus, Target, Trash2 } from 'lucide-react'
import type { Goal, GoalArea } from '@/types/goal'
import type { TaskContext } from '@/types/task'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { QuietAction } from '@/components/layout/PageMasthead'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { SectionHeading } from '@/components/layout/SectionHeading'
import { EmptyState } from '@/components/layout/EmptyState'
import { LIST_ROW, LIST_ROW_BODY, LIST_ROW_LANE, LIST_ROW_TRAIL } from '@/components/layout/listRow'
import { looksVague } from '@/lib/planning/goalQuality'
import { useGoalSharpen, type GoalSharpenState } from '@/hooks/useGoalSharpen'
import { ContextPicker } from '@/components/triage/ContextPicker'

/** Reused from the guided planning narration — teaches past-tense + a finish line. */
const GOAL_PLACEHOLDER = "What's true by next year? Past tense — 'shipped…', 'finally…'"

interface GoalsListProps {
  areas: GoalArea[]
  goals: Goal[]
  loading: boolean
  year: number
  onSelectGoal: (goalId: string) => void
  onAddArea: (name: string) => Promise<GoalArea | null>
  onRenameArea: (areaId: string, name: string) => void
  onAddGoal: (areaId: string, name: string) => Promise<Goal | null>
  onUpdateGoal: (goalId: string, updates: { name?: string; context?: TaskContext | null; areaId?: string }) => void
  onDeleteArea: (areaId: string) => void
}

export function GoalsList({
  areas,
  goals,
  loading,
  year,
  onSelectGoal,
  onAddArea,
  onRenameArea,
  onAddGoal,
  onUpdateGoal,
  onDeleteArea,
}: GoalsListProps) {
  const sharpen = useGoalSharpen()
  const [creatingArea, setCreatingArea] = useState(false)
  const [newAreaName, setNewAreaName] = useState('')
  const [addingGoalAreaId, setAddingGoalAreaId] = useState<string | null>(null)
  const [newGoalName, setNewGoalName] = useState('')
  const [savingArea, setSavingArea] = useState(false)
  const [savingGoal, setSavingGoal] = useState(false)
  // Click-to-edit for area titles (mirrors the goal-title pattern in GoalView).
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null)
  const [editingAreaName, setEditingAreaName] = useState('')
  const areaInputRef = useRef<HTMLInputElement>(null)
  const goalInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creatingArea) areaInputRef.current?.focus()
  }, [creatingArea])

  useEffect(() => {
    if (editingAreaId) renameInputRef.current?.focus()
  }, [editingAreaId])

  useEffect(() => {
    if (addingGoalAreaId) goalInputRef.current?.focus()
  }, [addingGoalAreaId])

  const handleCreateArea = async () => {
    if (!newAreaName.trim()) return
    setSavingArea(true)
    const result = await onAddArea(newAreaName.trim())
    setSavingArea(false)
    if (result) {
      setCreatingArea(false)
      setNewAreaName('')
    }
  }

  const handleCreateGoal = async () => {
    if (!addingGoalAreaId || !newGoalName.trim()) return
    setSavingGoal(true)
    const result = await onAddGoal(addingGoalAreaId, newGoalName.trim())
    setSavingGoal(false)
    if (result) {
      setAddingGoalAreaId(null)
      setNewGoalName('')
    }
  }

  const commitAreaRename = (area: GoalArea) => {
    const name = editingAreaName.trim()
    if (name && name !== area.name) onRenameArea(area.id, name)
    setEditingAreaId(null)
  }

  const getGoalsForArea = (areaId: string) =>
    goals.filter(g => g.areaId === areaId && g.status !== 'archived')

  return (
    // No page background of its own: the place's painted scenery is the page
    // (layout system, 2026-10-01).
    <div className="h-full overflow-auto">
      <div className={PAGE_COLUMN}>
        {/* The one masthead (layout system, 2026-10-01): stamp in the margin
            lane, serif title, one muted line, a QUIET action beside the title
            at every width. The wizard-era header wore a filled "New Area" pill
            and a "2026 · Q3" quarter tag; the quarter went with the season
            wizard, and a goal's year is the whole line. */}
        <MastheadCard
          variant="page"
          motif="lists"
          title="Goals"
          subline={
            goals.length === 0
              ? `${year}`
              : `${year} · ${goals.length} goal${goals.length === 1 ? '' : 's'} across ${areas.length} area${areas.length === 1 ? '' : 's'}`
          }
          action={!creatingArea ? <QuietAction icon={Plus} label="Add area" onClick={() => setCreatingArea(true)} /> : undefined}
        />

        {/* New area form — inline on the page, no card behind it. */}
        {creatingArea && (
          <div className="mb-8 border-b border-neutral-300 pb-6 animate-fade-in-scale">
            <label className="text-sm font-medium text-neutral-500 mb-2 block">Life Area</label>
            <input
              ref={areaInputRef}
              type="text"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreateArea() }
                if (e.key === 'Escape') { setCreatingArea(false); setNewAreaName('') }
              }}
              placeholder="e.g. Family & Relationships, Home, Career..."
              className="w-full px-4 py-3 rounded-xl border border-neutral-300 bg-bg-elevated
                         text-neutral-800 placeholder:text-neutral-400 text-xl font-display
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setCreatingArea(false); setNewAreaName('') }}
                className="px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateArea}
                disabled={!newAreaName.trim() || savingArea}
                className="px-5 py-2.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingArea ? 'Creating...' : 'Create Area'}
              </button>
            </div>
          </div>
        )}

        {/* Loading state — hold the empty state until goals settle */}
        {loading && areas.length === 0 && (
          <EmptyState title="Loading goals…" />
        )}

        {/* Empty state */}
        {!loading && areas.length === 0 && !creatingArea && (
          <EmptyState
            title="No goals yet"
            action={<QuietAction icon={Plus} label="Create your first area" onClick={() => setCreatingArea(true)} />}
          >
            Start with a life area (like &ldquo;Family &amp; Relationships&rdquo; or &ldquo;Home&rdquo;), then add the year&rsquo;s goals under it.
          </EmptyState>
        )}

        {/* Areas with their goals */}
        <div className="space-y-[var(--ds-section-gap)]">
          {areas.map((area) => {
            const areaGoals = getGoalsForArea(area.id)

            return (
              <section key={area.id}>
                {/* Area header — the one section heading; click the name to rename. */}
                <SectionHeading
                  aside={
                    <>
                      <button
                        type="button"
                        onClick={() => { setAddingGoalAreaId(area.id); setNewGoalName('') }}
                        className="-my-1 flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-primary-700 transition-colors hover:bg-primary-50"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add Goal
                      </button>
                      {areaGoals.length === 0 && (
                        <button
                          type="button"
                          onClick={() => onDeleteArea(area.id)}
                          className="-my-1 rounded-md p-1.5 text-neutral-400 transition-colors hover:text-red-500"
                          title="Delete area"
                          aria-label="Delete area"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </>
                  }
                >
                  {editingAreaId === area.id ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={editingAreaName}
                      onChange={(e) => setEditingAreaName(e.target.value)}
                      onBlur={() => commitAreaRename(area)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitAreaRename(area)
                        if (e.key === 'Escape') setEditingAreaId(null)
                      }}
                      className="w-full min-w-0 bg-transparent border-b border-primary-300 focus:outline-none focus:border-primary-500"
                      aria-label="Area name"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditingAreaId(area.id); setEditingAreaName(area.name) }}
                      title="Click to rename"
                      className="text-left transition-colors hover:text-primary-700"
                    >
                      {area.name}
                    </button>
                  )}
                </SectionHeading>

                {/* Inline goal creation for this area */}
                {addingGoalAreaId === area.id && (
                  <div className="mb-2 py-2 pl-[52px] md:pl-[var(--ds-body)]">
                    <input
                      ref={goalInputRef}
                      type="text"
                      value={newGoalName}
                      onChange={(e) => setNewGoalName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleCreateGoal() }
                        if (e.key === 'Escape') { setAddingGoalAreaId(null); setNewGoalName('') }
                      }}
                      placeholder={GOAL_PLACEHOLDER}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-bg-elevated
                                 text-neutral-800 placeholder:text-neutral-400 text-lg font-display
                                 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    />
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        onClick={() => { setAddingGoalAreaId(null); setNewGoalName('') }}
                        className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateGoal}
                        disabled={!newGoalName.trim() || savingGoal}
                        className="px-4 py-1.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {savingGoal ? 'Adding...' : 'Add Goal'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Goals in this area */}
                {areaGoals.length === 0 && addingGoalAreaId !== area.id ? (
                  <p className="py-2 pl-[52px] text-sm italic text-neutral-500 md:pl-[var(--ds-body)]">No goals yet in this area</p>
                ) : (
                  <div>
                    {areaGoals.map((goal) => (
                      <GoalRow
                        key={goal.id}
                        goal={goal}
                        sharpenState={sharpen.stateFor(goal.id)}
                        onSelect={() => onSelectGoal(goal.id)}
                        onSharpen={() => sharpen.sharpen({ id: goal.id, name: goal.name, areaName: area.name, context: goal.context })}
                        onDismissSharpen={() => sharpen.dismiss(goal.id)}
                        onUseSuggestion={(name) => { onUpdateGoal(goal.id, { name }); sharpen.dismiss(goal.id) }}
                        onSetContext={(context) => onUpdateGoal(goal.id, { context: context ?? null })}
                        areas={areas}
                        onMoveToArea={(areaId) => onUpdateGoal(goal.id, { areaId })}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>

      </div>
    </div>
  )
}

interface GoalRowProps {
  goal: Goal
  sharpenState: GoalSharpenState
  onSelect: () => void
  onSharpen: () => void
  onDismissSharpen: () => void
  onUseSuggestion: (name: string) => void
  onSetContext: (context: TaskContext | undefined) => void
  areas: GoalArea[]
  onMoveToArea: (areaId: string) => void
}

/**
 * One goal in the list: opens on tap, with an always-available ✨ Sharpen (AI
 * proposes a past-tense, finish-lined rewrite the user taps to accept) and a
 * quiet, dismissible hint on goals that read clearly vague. Extracted from the
 * map so the open action stays a real <button> while the sharpen controls sit
 * beside it (no nested buttons).
 */
function GoalRow({ goal, sharpenState, onSelect, onSharpen, onDismissSharpen, onUseSuggestion, onSetContext, areas, onMoveToArea }: GoalRowProps) {
  const [hintDismissed, setHintDismissed] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const otherAreas = areas.filter((a) => a.id !== goal.areaId)
  const vague = looksVague(goal.name)
  const { loading, suggestion, error } = sharpenState

  // The library row, the way a goal reads on the Year page: a goal mark in
  // the margin lane, the goal at the body edge with its coaching under it,
  // and its quiet controls trailing. No card behind it.
  return (
    <div className={`${LIST_ROW} items-start!`}>
      <span className={`${LIST_ROW_LANE} pt-1 text-primary-500`} aria-hidden="true">
        <Target className="h-4 w-4" />
      </span>

      <div className={LIST_ROW_BODY}>
        <button type="button" onClick={onSelect} className="flex w-full min-w-0 items-baseline gap-2 text-left">
          <h3 className={`min-w-0 text-[16px] leading-snug transition-colors group-hover:text-primary-700 ${goal.status === 'completed' ? 'text-neutral-500 line-through decoration-neutral-400' : 'text-neutral-900'}`}>
            {goal.name}
          </h3>
          {goal.status === 'completed' && (
            <span className="shrink-0 text-[12px] text-primary-700">Completed</span>
          )}
        </button>

        {/* Sharpen affordance + vague hint — hidden while a suggestion is showing. */}
        {!suggestion && !loading && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <button
              type="button"
              onClick={onSharpen}
              className="inline-flex items-center gap-1 font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Sharpen
            </button>
            {vague && !hintDismissed && (
              <span className="inline-flex items-center gap-1.5 text-amber-700/90">
                name what&rsquo;s true by next year
                <button
                  type="button"
                  onClick={() => setHintDismissed(true)}
                  aria-label="Dismiss hint"
                  className="text-amber-500 hover:text-amber-700 leading-none"
                >
                  &times;
                </button>
              </span>
            )}
          </div>
        )}

        {loading && <p className="mt-0.5 text-[12px] text-neutral-500">Sharpening&hellip;</p>}
        {error && <p className="mt-0.5 text-[12px] text-red-600">Couldn&rsquo;t sharpen &mdash; try again.</p>}

        {suggestion && (
          <div className="mt-2 rounded-xl border border-primary-100 bg-primary-50/70 p-3">
            <p className="text-sm text-neutral-800">{suggestion.suggestion}</p>
            {suggestion.why && <p className="text-xs text-neutral-500 mt-1">{suggestion.why}</p>}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => onUseSuggestion(suggestion.suggestion)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
              >
                Use this
              </button>
              <button
                type="button"
                onClick={onDismissSharpen}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Keep mine
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={`${LIST_ROW_TRAIL} -mt-1`}>
        {/* Move to another area — the goal's area is otherwise fixed at
            creation. Only shown when there's somewhere to move it to. */}
        {otherAreas.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoveOpen((o) => !o)}
              aria-label="Move to area"
              title="Move to another area"
              className="p-2 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-neutral-100 transition-colors"
            >
              <FolderInput className="w-4 h-4" />
            </button>
            {moveOpen && (
              <>
                <button
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setMoveOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-bg-elevated rounded-xl border border-neutral-200 shadow-lg p-1.5">
                  <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Move to</p>
                  {otherAreas.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      aria-label={`Move to ${a.name}`}
                      onClick={() => { onMoveToArea(a.id); setMoveOpen(false) }}
                      className="w-full px-2.5 py-1.5 text-sm text-left rounded-lg hover:bg-neutral-50 text-neutral-700 truncate"
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {/* Domain tag — always visible, so any goal can be (re)tagged even after
            creation. Untagged goals (created in the all-domains view) render the
            grey "Set context" state, which is how orphans get a home. */}
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <ContextPicker value={goal.context} onChange={onSetContext} />
        </div>
      </div>
    </div>
  )
}
