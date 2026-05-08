import { useState } from 'react'
import type { ListItem } from '@/types/list'

interface ListItemRowProps {
  item: ListItem
  childItems?: ListItem[]
  onUpdate?: (updates: Partial<ListItem>) => void
  onDelete?: () => void
  onUpdateChild?: (itemId: string, updates: Partial<ListItem>) => void
  onDeleteChild?: (itemId: string) => void
  onAddSubitem?: (text: string) => Promise<ListItem | null>
  isChild?: boolean
}

export function ListItemRow({
  item,
  childItems,
  onUpdate,
  onDelete,
  onUpdateChild,
  onDeleteChild,
  onAddSubitem,
  isChild,
}: ListItemRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [editNote, setEditNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [addingSubitem, setAddingSubitem] = useState(false)
  const [subitemText, setSubitemText] = useState('')

  const handleEdit = () => {
    setEditText(item.text)
    setEditNote(item.note || '')
    setIsEditing(true)
  }

  const handleSave = () => {
    const trimmedText = editText.trim()
    if (trimmedText && onUpdate) {
      onUpdate({
        text: trimmedText,
        note: editNote.trim() || undefined,
      })
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditText('')
    setEditNote('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const handleSubitemSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = subitemText.trim()
    if (trimmed && onAddSubitem) {
      await onAddSubitem(trimmed)
      setSubitemText('')
    }
  }

  if (isEditing) {
    return (
      <div className="p-3 rounded-xl bg-purple-50 border border-purple-100">
        <div className="space-y-2">
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                       focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            autoFocus
          />
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white resize-none
                       focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex-1 py-1.5 px-3 text-xs font-medium text-neutral-600 bg-white rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!editText.trim()}
              className="flex-1 py-1.5 px-3 text-xs font-medium text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleToggleComplete = () => {
    if (onUpdate) {
      onUpdate({ completed: !item.completed })
    }
  }

  return (
    <div>
      <div
        data-completed={item.completed}
        className={`group flex items-start gap-3 p-3 rounded-xl bg-white border border-neutral-100 hover:border-neutral-200 hover:shadow-sm transition-all ${isChild ? 'border-neutral-50 shadow-none' : ''}`}
      >
        {/* Checkbox */}
        <button
          type="button"
          role="checkbox"
          aria-checked={item.completed}
          aria-label={item.completed ? `Mark "${item.text}" incomplete` : `Mark "${item.text}" complete`}
          onClick={handleToggleComplete}
          disabled={!onUpdate}
          className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-colors
            ${item.completed
              ? 'bg-purple-500 border-purple-500 text-white hover:bg-purple-600'
              : 'bg-white border-neutral-300 hover:border-purple-400'
            }
            ${!onUpdate ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
        >
          {item.completed && (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm transition-colors ${
              item.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'
            }`}
          >
            {item.text}
          </div>
          {item.note && (
            <button
              onClick={() => setShowNote(!showNote)}
              className="text-xs text-neutral-400 hover:text-neutral-600 mt-1 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              {showNote ? 'Hide note' : 'View note'}
            </button>
          )}
          {showNote && item.note && (
            <div className="mt-2 text-xs text-neutral-500 bg-neutral-50 rounded-lg p-2">
              {item.note}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onAddSubitem && (
            <button
              onClick={() => setAddingSubitem(true)}
              className="p-1.5 text-neutral-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              aria-label="Add subitem"
              title="Add subitem"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {onUpdate && (
            <button
              onClick={handleEdit}
              className="p-1.5 text-neutral-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              aria-label="Edit item"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              aria-label="Delete item"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Subitems block */}
      {((childItems && childItems.length > 0) || addingSubitem) && (
        <div className="ml-8 mt-1 space-y-1 border-l border-neutral-100 pl-3">
          {childItems?.map((c) => (
            <ListItemRow
              key={c.id}
              item={c}
              isChild
              onUpdate={onUpdateChild ? (updates) => onUpdateChild(c.id, updates) : undefined}
              onDelete={onDeleteChild ? () => onDeleteChild(c.id) : undefined}
            />
          ))}
          {addingSubitem && onAddSubitem && (
            <form onSubmit={handleSubitemSubmit} className="flex items-center gap-2 px-3 py-2">
              <input
                type="text"
                value={subitemText}
                onChange={(e) => setSubitemText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setAddingSubitem(false); setSubitemText('') } }}
                placeholder="Subitem"
                autoFocus
                className="flex-1 text-sm border-b border-neutral-200 bg-transparent focus:outline-none focus:border-purple-400 py-1"
              />
              <button
                type="button"
                onClick={() => { setAddingSubitem(false); setSubitemText('') }}
                className="text-xs text-neutral-500 hover:text-neutral-700"
              >Cancel</button>
              <button
                type="submit"
                disabled={!subitemText.trim()}
                className="text-xs font-medium text-purple-600 hover:text-purple-700 disabled:opacity-40"
              >Add</button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
