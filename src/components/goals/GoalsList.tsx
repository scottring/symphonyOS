import { useState, useRef, useEffect } from 'react'
import type { Goal, GoalArea, Quarter } from '@/types/goal'

interface GoalsListProps {
  areas: GoalArea[]
  goals: Goal[]
  currentQuarter: Quarter
  year: number
  onSelectGoal: (goalId: string) => void
  onAddArea: (name: string) => Promise<GoalArea | null>
  onRenameArea: (areaId: string, name: string) => void
  onAddGoal: (areaId: string, name: string) => Promise<Goal | null>
  onDeleteArea: (areaId: string) => void
}

export function GoalsList({
  areas,
  goals,
  currentQuarter,
  year,
  onSelectGoal,
  onAddArea,
  onRenameArea,
  onAddGoal,
  onDeleteArea,
}: GoalsListProps) {
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

      <div className="relative max-w-3xl mx-auto px-6 md:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-semibold text-neutral-800 tracking-tight">
              Goals
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {year} &middot; {currentQuarter}
            </p>
          </div>

          {!creatingArea && (
            <button
              onClick={() => setCreatingArea(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-medium
                         hover:from-primary-600 hover:to-primary-700 active:from-primary-700 active:to-primary-800 transition-all shadow-sm
                         hover:shadow-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              New Area
            </button>
          )}
        </div>

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

        {/* Empty state */}
        {areas.length === 0 && !creatingArea && (
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
                      placeholder="What's the goal?"
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
                      <button
                        key={goal.id}
                        onClick={() => onSelectGoal(goal.id)}
                        className="w-full text-left p-5 rounded-2xl bg-white border border-neutral-100
                                   hover:border-primary-200 hover:shadow-md transition-all duration-200 group"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="font-medium text-neutral-800 group-hover:text-primary-700 transition-colors truncate">
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
