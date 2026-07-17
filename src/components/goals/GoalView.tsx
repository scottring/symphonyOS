import { useState, useRef, useEffect, useCallback } from 'react'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import type { Goal, GoalArea } from '@/types/goal'

interface GoalViewProps {
  goal: Goal
  area: GoalArea | undefined
  onBack: () => void
  onUpdateGoal: (id: string, updates: Partial<Pick<Goal, 'name' | 'notes' | 'status' | 'strategy' | 'domainSlug' | 'layerId'>>) => void
  onDeleteGoal: (id: string) => void
}

export function GoalView({
  goal,
  area,
  onBack,
  onUpdateGoal,
  onDeleteGoal,
}: GoalViewProps) {
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(goal.name)
  const [notes, setNotes] = useState(goal.notes ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const notesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setName(goal.name)
    setNotes(goal.notes ?? '')
  }, [goal.id, goal.name, goal.notes])

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

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

  const handleDelete = () => {
    onDeleteGoal(goal.id)
    onBack()
  }

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      <div className={PAGE_COLUMN}>
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
              <span className="text-sm text-red-600">Delete &ldquo;{goal.name}&rdquo;?</span>
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
