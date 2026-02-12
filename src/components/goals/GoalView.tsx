import { useState, useRef, useEffect, useCallback } from 'react'
import type { Goal, GoalArea, Quarter } from '@/types/goal'

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4']

interface GoalViewProps {
  goal: Goal
  area: GoalArea | undefined
  currentQuarter: Quarter
  onBack: () => void
  onUpdateGoal: (id: string, updates: Partial<Pick<Goal, 'name' | 'notes' | 'status'>>) => void
  onDeleteGoal: (id: string) => void
  onAddAction: (goalId: string, description: string, quarter: Quarter) => Promise<unknown>
  onUpdateAction: (id: string, updates: { description?: string; completed?: boolean; notes?: string }) => void
  onToggleAction: (id: string) => void
  onDeleteAction: (id: string) => void
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
}: GoalViewProps) {
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(goal.name)
  const [notes, setNotes] = useState(goal.notes ?? '')
  const [addingActionQuarter, setAddingActionQuarter] = useState<Quarter | null>(null)
  const [newActionText, setNewActionText] = useState('')
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [editingActionText, setEditingActionText] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const actionInputRef = useRef<HTMLInputElement>(null)
  const editActionInputRef = useRef<HTMLInputElement>(null)
  const notesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local form state when navigating between goals
    setName(goal.name)
    setNotes(goal.notes ?? '')
  }, [goal.id, goal.name, goal.notes])

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
    // Keep the input open for rapid entry
    actionInputRef.current?.focus()
  }

  const handleSaveEditAction = () => {
    if (editingActionId && editingActionText.trim()) {
      onUpdateAction(editingActionId, { description: editingActionText.trim() })
    }
    setEditingActionId(null)
    setEditingActionText('')
  }

  const handleDelete = () => {
    onDeleteGoal(goal.id)
    onBack()
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
                      {/* Checkbox */}
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

                      {/* Description */}
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

                      {/* Delete button (visible on hover) */}
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

                  {/* Inline add action */}
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
              <span className="text-sm text-red-600">Delete "{goal.name}" and all its actions?</span>
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
