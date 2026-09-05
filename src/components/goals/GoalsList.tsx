import { useState, useRef, useEffect } from 'react'
import { Sparkles, FolderInput, Plus } from 'lucide-react'
import type { Goal, GoalArea } from '@/types/goal'
import type { TaskContext } from '@/types/task'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { PageMasthead, QuietAction } from '@/components/layout/PageMasthead'
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
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      {/* Subtle accent gradient */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-primary-50/50 to-transparent pointer-events-none" />

      <div className={`relative ${PAGE_COLUMN}`}>
        {/* The shared Library masthead (design-unification 2026-09-01): serif
            title, one muted line, a QUIET action. The wizard-era header wore a
            filled "New Area" pill and a "2026 · Q3" quarter tag; the quarter
            went with the season wizard, and a goal's year is the whole line. */}
        <PageMasthead
          title="Goals"
          description={
            goals.length === 0
              ? `${year}`
              : `${year} · ${goals.length} goal${goals.length === 1 ? '' : 's'} across ${areas.length} area${areas.length === 1 ? '' : 's'}`
          }
          actions={!creatingArea && <QuietAction icon={Plus} label="Add area" onClick={() => setCreatingArea(true)} />}
        />

        {/* New area form */}
        {creatingArea && (
          <div className="mb-8 p-6 rounded-2xl bg-white border border-primary-200 shadow-lg animate-fade-in-scale">
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
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50
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
          <p className="text-center py-16 text-neutral-400">Loading goals…</p>
        )}

        {/* Empty state */}
        {!loading && areas.length === 0 && !creatingArea && (
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-20 h-20 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-5">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-primary-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-semibold text-neutral-700 mb-2">No goals yet</h2>
            <p className="text-neutral-500 mb-6 max-w-sm mx-auto">
              Start by creating a life area (like "Family & Relationships" or "Home"), then add your annual goals under each area.
            </p>
            <button
              onClick={() => setCreatingArea(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl font-medium
                         hover:bg-primary-600 transition-colors shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Create your first area
            </button>
          </div>
        )}

        {/* Areas with their goals */}
        <div className="space-y-10">
          {areas.map((area) => {
            const areaGoals = getGoalsForArea(area.id)

            return (
              <section key={area.id}>
                {/* Area header */}
                <div className="flex items-center justify-between mb-4">
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
                      className="font-display text-lg font-semibold text-neutral-700 bg-transparent border-b border-primary-300 focus:outline-none focus:border-primary-500 min-w-0 flex-1 mr-3"
                      aria-label="Area name"
                    />
                  ) : (
                    <h2
                      onClick={() => { setEditingAreaId(area.id); setEditingAreaName(area.name) }}
                      title="Click to rename"
                      className="font-display text-lg font-semibold text-neutral-700 cursor-pointer hover:text-primary-700 transition-colors"
                    >
                      {area.name}
                    </h2>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setAddingGoalAreaId(area.id); setNewGoalName('') }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Add Goal
                    </button>
                    {areaGoals.length === 0 && (
                      <button
                        onClick={() => onDeleteArea(area.id)}
                        className="p-1.5 text-neutral-300 hover:text-red-500 rounded-lg transition-colors"
                        title="Delete area"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline goal creation for this area */}
                {addingGoalAreaId === area.id && (
                  <div className="mb-4 p-4 rounded-xl bg-white border border-primary-200 shadow-sm">
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
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50
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
                  <p className="text-sm text-neutral-400 italic pl-1">No goals yet in this area</p>
                ) : (
                  <div className="space-y-3">
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

  return (
    <div className="p-5 rounded-2xl bg-white border border-neutral-100 hover:border-primary-200 hover:shadow-md transition-all duration-200">
      <div className="flex items-start gap-2">
        <button onClick={onSelect} className="flex-1 min-w-0 text-left group">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-medium text-neutral-800 group-hover:text-primary-700 transition-colors">
                {goal.name}
              </h3>
              {goal.status === 'completed' && (
                <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded">
                  Completed
                </span>
              )}
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-neutral-300 group-hover:text-primary-400 group-hover:translate-x-1 transition-all flex-shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        </button>
        {/* Move to another area — the goal's area is otherwise fixed at
            creation. Only shown when there's somewhere to move it to. */}
        {otherAreas.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} className="relative shrink-0 -mt-1">
            <button
              onClick={() => setMoveOpen((o) => !o)}
              aria-label="Move to area"
              title="Move to another area"
              className="p-2 rounded-lg text-neutral-300 hover:text-primary-500 hover:bg-neutral-100 transition-colors"
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
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-white rounded-xl border border-neutral-200 shadow-lg p-1.5">
                  <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Move to</p>
                  {otherAreas.map((a) => (
                    <button
                      key={a.id}
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
        <div onClick={(e) => e.stopPropagation()} className="shrink-0 -mr-1 -mt-1">
          <ContextPicker value={goal.context} onChange={onSetContext} />
        </div>
      </div>

      {/* Sharpen affordance + vague hint — hidden while a suggestion is showing. */}
      {!suggestion && !loading && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button
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
                onClick={() => setHintDismissed(true)}
                aria-label="Dismiss hint"
                className="text-amber-400 hover:text-amber-600 leading-none"
              >
                &times;
              </button>
            </span>
          )}
        </div>
      )}

      {loading && <p className="mt-2 text-xs text-neutral-400">Sharpening&hellip;</p>}
      {error && <p className="mt-2 text-xs text-red-500">Couldn&rsquo;t sharpen &mdash; try again.</p>}

      {suggestion && (
        <div className="mt-3 p-3 rounded-xl bg-primary-50/70 border border-primary-100">
          <p className="text-sm text-neutral-800">{suggestion.suggestion}</p>
          {suggestion.why && <p className="text-xs text-neutral-500 mt-1">{suggestion.why}</p>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onUseSuggestion(suggestion.suggestion)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
            >
              Use this
            </button>
            <button
              onClick={onDismissSharpen}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
