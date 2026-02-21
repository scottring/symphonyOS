import { useState, useRef, useEffect, useCallback } from 'react'
import type { Goal, GoalArea, GoalMilestone, Quarter } from '@/types/goal'

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4']

interface GoalViewProps {
  goal: Goal
  area: GoalArea | undefined
  currentQuarter: Quarter
  onBack: () => void
  onUpdateGoal: (id: string, updates: Partial<Pick<Goal, 'name' | 'notes' | 'status' | 'strategy' | 'domainSlug' | 'layerId'>>) => void
  onDeleteGoal: (id: string) => void
  onAddAction: (goalId: string, description: string, quarter: Quarter) => Promise<unknown>
  onUpdateAction: (id: string, updates: { description?: string; completed?: boolean; notes?: string }) => void
  onToggleAction: (id: string) => void
  onDeleteAction: (id: string) => void
  onStartPlanning: () => void
  onAddMilestone: (goalId: string, title: string, opts?: { description?: string; targetDate?: string; targetValue?: number; unit?: string; sortOrder?: number }) => Promise<GoalMilestone | null>
  onUpdateMilestone: (id: string, updates: Partial<Pick<GoalMilestone, 'title' | 'description' | 'targetDate' | 'targetValue' | 'currentValue' | 'unit' | 'status' | 'sortOrder'>>) => void
  onUpdateMilestoneProgress: (id: string, currentValue: number, targetValue?: number) => void
  onDeleteMilestone: (id: string) => void
}

export function GoalView({
  goal,
  area,
  currentQuarter,
  onBack,
  onUpdateGoal,
  onDeleteGoal,
  onAddAction,
  onUpdateAction,
  onToggleAction,
  onDeleteAction,
  onStartPlanning,
  onAddMilestone,
  onUpdateMilestone,
  onUpdateMilestoneProgress,
  onDeleteMilestone,
}: GoalViewProps) {
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(goal.name)
  const [notes, setNotes] = useState(goal.notes ?? '')
  const [addingActionQuarter, setAddingActionQuarter] = useState<Quarter | null>(null)
  const [newActionText, setNewActionText] = useState('')
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [editingActionText, setEditingActionText] = useState('')
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [milestoneInputValue, setMilestoneInputValue] = useState('')
  const [editingMilestoneField, setEditingMilestoneField] = useState<string | null>(null)
  const [milestoneFieldValue, setMilestoneFieldValue] = useState('')
  const [editingStrategy, setEditingStrategy] = useState(false)
  const [strategyText, setStrategyText] = useState(goal.strategy ?? '')
  const [addingMilestone, setAddingMilestone] = useState(false)
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [newMilestoneDate, setNewMilestoneDate] = useState('')
  const [newMilestoneTarget, setNewMilestoneTarget] = useState('')
  const [newMilestoneUnit, setNewMilestoneUnit] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const actionInputRef = useRef<HTMLInputElement>(null)
  const editActionInputRef = useRef<HTMLInputElement>(null)
  const notesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setName(goal.name)
    setNotes(goal.notes ?? '')
    setStrategyText(goal.strategy ?? '')
  }, [goal.id, goal.name, goal.notes, goal.strategy])

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

  useEffect(() => {
    if (addingActionQuarter) actionInputRef.current?.focus()
  }, [addingActionQuarter])

  useEffect(() => {
    if (editingActionId) editActionInputRef.current?.focus()
  }, [editingActionId])

  const handleSaveName = () => {
    if (name.trim() && name.trim() !== goal.name) {
      onUpdateGoal(goal.id, { name: name.trim() })
    }
    setEditingName(false)
  }

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value)
    if (notesTimeoutRef.current) clearTimeout(notesTimeoutRef.current)
    notesTimeoutRef.current = setTimeout(() => {
      onUpdateGoal(goal.id, { notes: value || undefined })
    }, 500)
  }, [goal.id, onUpdateGoal])

  const handleAddAction = async () => {
    if (!addingActionQuarter || !newActionText.trim()) return
    await onAddAction(goal.id, newActionText.trim(), addingActionQuarter)
    setNewActionText('')
    actionInputRef.current?.focus()
  }

  const handleSaveEditAction = () => {
    if (editingActionId && editingActionText.trim()) {
      onUpdateAction(editingActionId, { description: editingActionText.trim() })
    }
    setEditingActionId(null)
    setEditingActionText('')
  }

  const handleMilestoneProgressSave = (milestone: GoalMilestone) => {
    const val = parseFloat(milestoneInputValue)
    if (!isNaN(val)) {
      onUpdateMilestoneProgress(milestone.id, val, milestone.targetValue)
    }
    setEditingMilestoneId(null)
    setMilestoneInputValue('')
  }

  const handleStrategySave = () => {
    const trimmed = strategyText.trim()
    if (trimmed !== (goal.strategy ?? '')) {
      onUpdateGoal(goal.id, { strategy: trimmed || undefined })
    }
    setEditingStrategy(false)
  }

  const startEditingMilestoneField = (milestoneId: string, field: string, currentValue: string) => {
    setEditingMilestoneField(`${milestoneId}:${field}`)
    setMilestoneFieldValue(currentValue)
  }

  const saveMilestoneField = (milestoneId: string, field: string) => {
    const val = milestoneFieldValue.trim()
    if (field === 'title' && val) {
      onUpdateMilestone(milestoneId, { title: val })
    } else if (field === 'description') {
      onUpdateMilestone(milestoneId, { description: val || undefined })
    } else if (field === 'targetDate') {
      onUpdateMilestone(milestoneId, { targetDate: val || undefined })
    } else if (field === 'targetValue') {
      const num = parseFloat(val)
      onUpdateMilestone(milestoneId, { targetValue: isNaN(num) ? undefined : num })
    } else if (field === 'unit') {
      onUpdateMilestone(milestoneId, { unit: val || undefined })
    }
    setEditingMilestoneField(null)
    setMilestoneFieldValue('')
  }

  const handleMilestoneFieldKeyDown = (e: React.KeyboardEvent, milestoneId: string, field: string) => {
    if (e.key === 'Enter') { e.preventDefault(); saveMilestoneField(milestoneId, field) }
    if (e.key === 'Escape') { setEditingMilestoneField(null); setMilestoneFieldValue('') }
  }

  const handleAddMilestone = async () => {
    const title = newMilestoneTitle.trim()
    if (!title) return
    const opts: { description?: string; targetDate?: string; targetValue?: number; unit?: string; sortOrder?: number } = {}
    if (newMilestoneDate) opts.targetDate = newMilestoneDate
    if (newMilestoneTarget) { const n = parseFloat(newMilestoneTarget); if (!isNaN(n)) opts.targetValue = n }
    if (newMilestoneUnit) opts.unit = newMilestoneUnit
    opts.sortOrder = goal.milestones.length
    await onAddMilestone(goal.id, title, opts)
    setNewMilestoneTitle('')
    setNewMilestoneDate('')
    setNewMilestoneTarget('')
    setNewMilestoneUnit('')
    setAddingMilestone(false)
  }

  const handleSwapMilestoneOrder = (index: number, direction: 'up' | 'down') => {
    const sorted = [...goal.milestones].sort((a, b) => a.sortOrder - b.sortOrder)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= sorted.length) return
    const current = sorted[index]
    const target = sorted[targetIndex]
    onUpdateMilestone(current.id, { sortOrder: target.sortOrder })
    onUpdateMilestone(target.id, { sortOrder: current.sortOrder })
  }

  const handleDelete = () => {
    onDeleteGoal(goal.id)
    onBack()
  }

  const milestoneProgress = (m: GoalMilestone) => {
    if (m.targetValue == null || m.targetValue === 0) return 0
    return Math.min(100, Math.round((m.currentValue / m.targetValue) * 100))
  }

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      <div className="max-w-3xl mx-auto px-6 md:px-8 py-8">
        {/* Back button + area breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Goals
          </button>
          {area && (
            <>
              <span className="text-neutral-300">/</span>
              <span className="text-sm text-neutral-500">{area.name}</span>
            </>
          )}
        </div>

        {/* Goal name */}
        <div className="mb-6">
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') { setName(goal.name); setEditingName(false) }
              }}
              className="w-full text-3xl font-display font-semibold text-neutral-800 bg-transparent
                         border-b-2 border-primary-300 focus:border-primary-500 focus:outline-none
                         pb-1 transition-colors"
            />
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              className="text-3xl font-display font-semibold text-neutral-800 tracking-tight cursor-pointer
                         hover:text-primary-700 transition-colors"
            >
              {goal.name}
            </h1>
          )}

          {/* Status + year badge */}
          <div className="flex items-center gap-3 mt-3">
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
              {goal.year}
            </span>
            <select
              value={goal.status}
              onChange={(e) => onUpdateGoal(goal.id, { status: e.target.value as Goal['status'] })}
              className="text-xs font-medium px-2.5 py-1 rounded-full border-0 bg-neutral-100 text-neutral-600
                         focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {/* AI Planning CTA */}
        {!goal.strategy && (
          <button
            onClick={onStartPlanning}
            className="w-full mb-8 p-5 rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/50
                       hover:border-primary-300 hover:bg-primary-50 transition-all group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0 group-hover:bg-primary-200 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary-700">Plan with AI</h3>
                <p className="text-xs text-primary-600/70 mt-0.5">Have a conversation with AI to create a strategy with milestones and coaching blocks</p>
              </div>
            </div>
          </button>
        )}

        {/* Strategy section */}
        {goal.strategy && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Strategy</h2>
              <button
                onClick={onStartPlanning}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
              >
                Re-plan
              </button>
            </div>
            {editingStrategy ? (
              <textarea
                value={strategyText}
                onChange={(e) => setStrategyText(e.target.value)}
                onBlur={handleStrategySave}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setStrategyText(goal.strategy ?? ''); setEditingStrategy(false) }
                }}
                autoFocus
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-primary-200 bg-white text-sm text-neutral-600 leading-relaxed
                           focus:outline-none focus:ring-2 focus:ring-primary-300/50 focus:border-primary-300 resize-none transition-all"
              />
            ) : (
              <p
                onClick={() => setEditingStrategy(true)}
                className="text-sm text-neutral-600 leading-relaxed italic px-1 cursor-pointer hover:bg-neutral-50 rounded-lg py-1 -mx-1 transition-colors"
              >
                &ldquo;{goal.strategy}&rdquo;
              </p>
            )}
          </section>
        )}

        {/* Milestones section */}
        {(goal.milestones.length > 0 || goal.strategy) && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Milestones</h2>
              {!addingMilestone && (
                <button
                  onClick={() => setAddingMilestone(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add
                </button>
              )}
            </div>
            <div className="space-y-3">
              {[...goal.milestones].sort((a, b) => a.sortOrder - b.sortOrder).map((milestone, idx) => {
                const pct = milestoneProgress(milestone)
                const isEditingProgress = editingMilestoneId === milestone.id
                const sorted = [...goal.milestones].sort((a, b) => a.sortOrder - b.sortOrder)

                return (
                  <div key={milestone.id} className="p-4 rounded-xl bg-white border border-neutral-100 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {milestone.status === 'achieved' ? (
                            <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <div className={`w-3 h-3 rounded-full shrink-0 ${milestone.status === 'in_progress' ? 'bg-amber-400' : 'bg-neutral-200'}`} />
                          )}
                          {editingMilestoneField === `${milestone.id}:title` ? (
                            <input
                              type="text"
                              value={milestoneFieldValue}
                              onChange={(e) => setMilestoneFieldValue(e.target.value)}
                              onBlur={() => saveMilestoneField(milestone.id, 'title')}
                              onKeyDown={(e) => handleMilestoneFieldKeyDown(e, milestone.id, 'title')}
                              autoFocus
                              className="flex-1 text-sm font-medium text-neutral-800 bg-transparent border-b border-primary-300 focus:outline-none focus:border-primary-500 pb-0.5"
                            />
                          ) : (
                            <h3
                              onClick={() => startEditingMilestoneField(milestone.id, 'title', milestone.title)}
                              className={`text-sm font-medium cursor-pointer hover:text-primary-600 transition-colors ${milestone.status === 'achieved' ? 'text-green-700' : 'text-neutral-800'}`}
                            >
                              {milestone.title}
                            </h3>
                          )}
                        </div>
                        {/* Description — click to edit, or click to add */}
                        {editingMilestoneField === `${milestone.id}:description` ? (
                          <input
                            type="text"
                            value={milestoneFieldValue}
                            onChange={(e) => setMilestoneFieldValue(e.target.value)}
                            onBlur={() => saveMilestoneField(milestone.id, 'description')}
                            onKeyDown={(e) => handleMilestoneFieldKeyDown(e, milestone.id, 'description')}
                            autoFocus
                            placeholder="Add a description..."
                            className="mt-1 pl-5 w-full text-xs text-neutral-500 bg-transparent border-b border-primary-200 focus:outline-none focus:border-primary-400 pb-0.5"
                          />
                        ) : (
                          <p
                            onClick={() => startEditingMilestoneField(milestone.id, 'description', milestone.description ?? '')}
                            className="text-xs text-neutral-500 mt-1 pl-5 cursor-pointer hover:text-primary-500 transition-colors"
                          >
                            {milestone.description || 'Add description...'}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Reorder buttons */}
                        <div className="opacity-0 group-hover:opacity-100 flex flex-col transition-all">
                          <button
                            onClick={() => handleSwapMilestoneOrder(idx, 'up')}
                            disabled={idx === 0}
                            className="p-0.5 text-neutral-300 hover:text-neutral-600 disabled:opacity-20 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleSwapMilestoneOrder(idx, 'down')}
                            disabled={idx === sorted.length - 1}
                            className="p-0.5 text-neutral-300 hover:text-neutral-600 disabled:opacity-20 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                        {/* Date — click to edit */}
                        {editingMilestoneField === `${milestone.id}:targetDate` ? (
                          <input
                            type="date"
                            value={milestoneFieldValue}
                            onChange={(e) => { setMilestoneFieldValue(e.target.value); }}
                            onBlur={() => saveMilestoneField(milestone.id, 'targetDate')}
                            onKeyDown={(e) => handleMilestoneFieldKeyDown(e, milestone.id, 'targetDate')}
                            autoFocus
                            className="text-xs text-neutral-600 px-1.5 py-0.5 rounded border border-primary-200 focus:outline-none focus:ring-1 focus:ring-primary-300"
                          />
                        ) : (
                          <button
                            onClick={() => startEditingMilestoneField(milestone.id, 'targetDate', milestone.targetDate ?? '')}
                            className="text-xs text-neutral-400 hover:text-primary-600 transition-colors px-1"
                          >
                            {milestone.targetDate
                              ? new Date(milestone.targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : 'Set date'}
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteMilestone(milestone.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-neutral-300 hover:text-red-500 rounded transition-all"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Progress bar for measurable milestones */}
                    {milestone.targetValue != null && (
                      <div className="mt-3 pl-5">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${milestone.status === 'achieved' ? 'bg-green-500' : 'bg-primary-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {isEditingProgress ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={milestoneInputValue}
                                onChange={(e) => setMilestoneInputValue(e.target.value)}
                                onBlur={() => handleMilestoneProgressSave(milestone)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleMilestoneProgressSave(milestone)
                                  if (e.key === 'Escape') { setEditingMilestoneId(null); setMilestoneInputValue('') }
                                }}
                                autoFocus
                                className="w-16 text-xs text-neutral-700 px-2 py-1 rounded border border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
                              />
                              <span className="text-xs text-neutral-400">
                                /
                                {editingMilestoneField === `${milestone.id}:targetValue` ? (
                                  <input
                                    type="number"
                                    value={milestoneFieldValue}
                                    onChange={(e) => setMilestoneFieldValue(e.target.value)}
                                    onBlur={() => saveMilestoneField(milestone.id, 'targetValue')}
                                    onKeyDown={(e) => handleMilestoneFieldKeyDown(e, milestone.id, 'targetValue')}
                                    className="w-14 ml-1 text-xs text-neutral-600 px-1 py-0.5 rounded border border-primary-200 focus:outline-none"
                                  />
                                ) : (
                                  <button
                                    onClick={() => startEditingMilestoneField(milestone.id, 'targetValue', String(milestone.targetValue ?? ''))}
                                    className="ml-1 hover:text-primary-600 transition-colors"
                                  >
                                    {milestone.targetValue}
                                  </button>
                                )}
                                {' '}{milestone.unit}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingMilestoneId(milestone.id); setMilestoneInputValue(String(milestone.currentValue)) }}
                              className="text-xs text-neutral-500 hover:text-primary-600 tabular-nums transition-colors"
                            >
                              {milestone.currentValue} / {milestone.targetValue} {milestone.unit}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add milestone form */}
              {addingMilestone && (
                <div className="p-4 rounded-xl bg-white border border-primary-100 shadow-sm space-y-3">
                  <input
                    type="text"
                    value={newMilestoneTitle}
                    onChange={(e) => setNewMilestoneTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleAddMilestone() }
                      if (e.key === 'Escape') { setAddingMilestone(false); setNewMilestoneTitle('') }
                    }}
                    autoFocus
                    placeholder="Milestone title..."
                    className="w-full text-sm font-medium text-neutral-700 placeholder:text-neutral-400 bg-transparent
                               border-b border-neutral-200 focus:border-primary-400 focus:outline-none pb-1"
                  />
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] text-neutral-400 uppercase">Date</label>
                      <input
                        type="date"
                        value={newMilestoneDate}
                        onChange={(e) => setNewMilestoneDate(e.target.value)}
                        className="text-xs text-neutral-600 px-1.5 py-1 rounded border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-300"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] text-neutral-400 uppercase">Target</label>
                      <input
                        type="number"
                        value={newMilestoneTarget}
                        onChange={(e) => setNewMilestoneTarget(e.target.value)}
                        placeholder="e.g. 10"
                        className="w-16 text-xs text-neutral-600 px-1.5 py-1 rounded border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-300"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] text-neutral-400 uppercase">Unit</label>
                      <input
                        type="text"
                        value={newMilestoneUnit}
                        onChange={(e) => setNewMilestoneUnit(e.target.value)}
                        placeholder="lbs, books..."
                        className="w-20 text-xs text-neutral-600 px-1.5 py-1 rounded border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-300"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleAddMilestone}
                      disabled={!newMilestoneTitle.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 disabled:opacity-40 rounded-lg transition-colors"
                    >
                      Add Milestone
                    </button>
                    <button
                      onClick={() => { setAddingMilestone(false); setNewMilestoneTitle(''); setNewMilestoneDate(''); setNewMilestoneTarget(''); setNewMilestoneUnit('') }}
                      className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {goal.milestones.length === 0 && !addingMilestone && (
                <p className="text-sm text-neutral-300 italic">No milestones yet</p>
              )}
            </div>
          </section>
        )}

        {/* Notes */}
        <div className="mb-8">
          <label className="text-sm font-medium text-neutral-500 mb-2 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Background, motivation, context..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white
                       text-neutral-700 placeholder:text-neutral-400 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                       resize-none transition-all"
          />
        </div>

        {/* Quarterly actions */}
        <div className="space-y-8">
          {QUARTERS.map((quarter) => {
            const actions = goal.actions.filter(a => a.quarter === quarter)
            const isCurrentQuarter = quarter === currentQuarter
            const completedCount = actions.filter(a => a.completed).length

            return (
              <section key={quarter}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className={`text-sm font-semibold uppercase tracking-wider
                      ${isCurrentQuarter ? 'text-primary-600' : 'text-neutral-400'}`}>
                      {quarter}
                      {isCurrentQuarter && (
                        <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded-full normal-case tracking-normal">
                          Current
                        </span>
                      )}
                    </h3>
                    {actions.length > 0 && (
                      <span className="text-xs text-neutral-400 tabular-nums">
                        {completedCount}/{actions.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => { setAddingActionQuarter(quarter); setNewActionText('') }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add
                  </button>
                </div>

                {/* Actions list */}
                <div className="space-y-1">
                  {actions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-start gap-3 p-3 rounded-xl hover:bg-white hover:shadow-sm transition-all group"
                    >
                      <button
                        onClick={() => onToggleAction(action.id)}
                        className={`w-5 h-5 mt-0.5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all
                          ${action.completed
                            ? 'bg-primary-500 border-primary-500 text-white'
                            : 'border-neutral-300 hover:border-primary-400'
                          }`}
                      >
                        {action.completed && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        {editingActionId === action.id ? (
                          <input
                            ref={editActionInputRef}
                            type="text"
                            value={editingActionText}
                            onChange={(e) => setEditingActionText(e.target.value)}
                            onBlur={handleSaveEditAction}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditAction()
                              if (e.key === 'Escape') { setEditingActionId(null); setEditingActionText('') }
                            }}
                            className="w-full text-sm text-neutral-700 bg-transparent border-b border-primary-300
                                       focus:outline-none focus:border-primary-500 pb-0.5"
                          />
                        ) : (
                          <span
                            onClick={() => { setEditingActionId(action.id); setEditingActionText(action.description) }}
                            className={`text-sm cursor-pointer ${action.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}
                          >
                            {action.description}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => onDeleteAction(action.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-neutral-300 hover:text-red-500 rounded transition-all"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {addingActionQuarter === quarter && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-primary-100 shadow-sm">
                      <div className="w-5 h-5 rounded border-2 border-neutral-200 flex-shrink-0" />
                      <input
                        ref={actionInputRef}
                        type="text"
                        value={newActionText}
                        onChange={(e) => setNewActionText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleAddAction() }
                          if (e.key === 'Escape') { setAddingActionQuarter(null); setNewActionText('') }
                        }}
                        placeholder="What needs to happen?"
                        className="flex-1 text-sm text-neutral-700 placeholder:text-neutral-400 bg-transparent
                                   focus:outline-none"
                      />
                      <button
                        onClick={() => { setAddingActionQuarter(null); setNewActionText('') }}
                        className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  )}

                  {actions.length === 0 && addingActionQuarter !== quarter && (
                    <p className="text-sm text-neutral-300 italic pl-8">No actions yet</p>
                  )}
                </div>
              </section>
            )
          })}
        </div>

        {/* Danger zone */}
        <div className="mt-12 pt-8 border-t border-neutral-100">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-sm text-neutral-400 hover:text-red-500 transition-colors"
            >
              Delete this goal...
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-600">Delete &ldquo;{goal.name}&rdquo; and all its actions?</span>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
