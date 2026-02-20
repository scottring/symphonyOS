import { useState, useCallback } from 'react'
import type { PlaybookBlock, PlaybookItem, CreateBlockInput, UpdateBlockInput, BlockType, DayType } from '@/types/playbook'
import { BLOCK_TYPE_CONFIG } from '@/types/playbook'

interface BlockEditorProps {
  block?: PlaybookBlock | null  // null = creating new
  onSave: (input: CreateBlockInput | { id: string; updates: UpdateBlockInput }) => void
  onDelete?: (id: string) => void
  onClose: () => void
}

const DAY_TYPE_OPTIONS: { value: DayType; label: string }[] = [
  { value: 'school-day', label: 'School Day' },
  { value: 'weekend', label: 'Weekend' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'half-day', label: 'Half Day' },
]

const BLOCK_TYPES = Object.entries(BLOCK_TYPE_CONFIG) as [BlockType, typeof BLOCK_TYPE_CONFIG[BlockType]][]

function generateItemId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function BlockEditor({ block, onSave, onDelete, onClose }: BlockEditorProps) {
  const isEditing = !!block

  const [timeSlot, setTimeSlot] = useState(block?.timeSlot || '')
  const [label, setLabel] = useState(block?.label || '')
  const [blockType, setBlockType] = useState<BlockType>(block?.blockType || 'routine')
  const [narrative, setNarrative] = useState(block?.narrative || '')
  const [coachingNote, setCoachingNote] = useState(block?.coachingNote || '')
  const [dayTypes, setDayTypes] = useState<DayType[]>(block?.dayTypes || ['school-day'])
  const [items, setItems] = useState<(PlaybookItem | Omit<PlaybookItem, 'id'> & { id?: string })[]>(
    block?.items || []
  )
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const hasChanges = isEditing ? (
    timeSlot !== block.timeSlot ||
    label !== block.label ||
    blockType !== block.blockType ||
    narrative !== block.narrative ||
    (coachingNote || '') !== (block.coachingNote || '') ||
    JSON.stringify(dayTypes) !== JSON.stringify(block.dayTypes) ||
    JSON.stringify(items) !== JSON.stringify(block.items)
  ) : (
    label.trim() !== '' && narrative.trim() !== ''
  )

  const canSave = label.trim() !== '' && narrative.trim() !== '' && timeSlot.trim() !== '' && dayTypes.length > 0

  const handleSave = useCallback(() => {
    if (!canSave) return

    if (isEditing) {
      const updates: UpdateBlockInput = {}
      if (timeSlot !== block.timeSlot) updates.timeSlot = timeSlot
      if (label !== block.label) updates.label = label
      if (blockType !== block.blockType) updates.blockType = blockType
      if (narrative !== block.narrative) updates.narrative = narrative
      if ((coachingNote || '') !== (block.coachingNote || '')) updates.coachingNote = coachingNote || null
      if (JSON.stringify(dayTypes) !== JSON.stringify(block.dayTypes)) updates.dayTypes = dayTypes
      if (JSON.stringify(items) !== JSON.stringify(block.items)) {
        updates.items = items.map(item => ({
          id: item.id || generateItemId(),
          who: item.who,
          action: item.action,
          ...(item.time && { time: item.time }),
          ...(item.context && { context: item.context }),
          ...(item.coaching && { coaching: item.coaching }),
        }))
      }
      onSave({ id: block.id, updates })
    } else {
      const input: CreateBlockInput = {
        timeSlot,
        label,
        blockType,
        narrative,
        coachingNote: coachingNote || null,
        dayTypes,
        items: items.map(item => ({
          who: item.who,
          action: item.action,
          ...(item.time && { time: item.time }),
          ...(item.context && { context: item.context }),
          ...(item.coaching && { coaching: item.coaching }),
        })),
      }
      onSave(input)
    }
  }, [isEditing, block, timeSlot, label, blockType, narrative, coachingNote, dayTypes, items, canSave, onSave])

  const toggleDayType = (dt: DayType) => {
    setDayTypes(prev =>
      prev.includes(dt) ? prev.filter(d => d !== dt) : [...prev, dt]
    )
  }

  const addItem = () => {
    setItems(prev => [...prev, { who: 'self', action: '' }])
  }

  const updateItem = (index: number, field: string, value: string) => {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ))
  }

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <h2 className="text-lg font-display font-semibold text-neutral-800">
            {isEditing ? 'Edit Block' : 'New Block'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Time slot + Block type row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Time Slot</label>
              <input
                type="text"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                placeholder="e.g. 7:00 or 5:30-6:45"
                className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Block Type</label>
              <select
                value={blockType}
                onChange={(e) => setBlockType(e.target.value as BlockType)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 transition-all"
              >
                {BLOCK_TYPES.map(([type, config]) => (
                  <option key={type} value={type}>{config.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Wake Up the Twins"
              className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 transition-all"
            />
          </div>

          {/* Narrative */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Narrative</label>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="The coaching script for this time block..."
              rows={4}
              className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 transition-all resize-none"
            />
          </div>

          {/* Coaching note */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Coaching Note (optional)</label>
            <textarea
              value={coachingNote}
              onChange={(e) => setCoachingNote(e.target.value)}
              placeholder="A personalized insight or tip..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-sage-50/60 border border-sage-200/60 text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-sage-300/50 focus:border-sage-300 transition-all resize-none"
            />
          </div>

          {/* Day types */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Day Types</label>
            <div className="flex flex-wrap gap-2">
              {DAY_TYPE_OPTIONS.map(dt => (
                <button
                  key={dt.value}
                  onClick={() => toggleDayType(dt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    dayTypes.includes(dt.value)
                      ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                  }`}
                >
                  {dt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-neutral-500">Action Items</label>
              <button
                onClick={addItem}
                className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
              >
                + Add item
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-xs text-neutral-400 italic">No items yet. Add action items for family members.</p>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-shrink-0 w-20">
                      <input
                        type="text"
                        value={item.who}
                        onChange={(e) => updateItem(index, 'who', e.target.value)}
                        placeholder="who"
                        className="w-full px-2 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 transition-all"
                      />
                    </div>
                    <div className="flex-shrink-0 w-16">
                      <input
                        type="text"
                        value={item.time || ''}
                        onChange={(e) => updateItem(index, 'time', e.target.value)}
                        placeholder="time"
                        className="w-full px-2 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 tabular-nums placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 transition-all"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={item.action}
                        onChange={(e) => updateItem(index, 'action', e.target.value)}
                        placeholder="Action..."
                        className="w-full px-2 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 transition-all"
                      />
                    </div>
                    <button
                      onClick={() => removeItem(index)}
                      className="flex-shrink-0 p-1 text-neutral-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delete (editing only) */}
          {isEditing && onDelete && (
            <div className="pt-2 border-t border-neutral-100">
              {showDeleteConfirm ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-600">Delete this block and all its instances?</span>
                  <button
                    onClick={() => { onDelete(block.id); onClose() }}
                    className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-xs text-neutral-400 hover:text-neutral-500 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-xs text-red-500 hover:text-red-600 transition-colors"
                >
                  Delete block...
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-neutral-100 bg-neutral-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || (isEditing && !hasChanges)}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isEditing ? 'Save Changes' : 'Create Block'}
          </button>
        </div>
      </div>
    </div>
  )
}
