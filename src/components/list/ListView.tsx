import { useState } from 'react'
import type { List, ListItem, ListCategory, ListVisibility } from '@/types/list'
import { getCategoryLabel, getCategoryIcon, LIST_CATEGORIES } from '@/types/list'
import { ListItemRow } from './ListItemRow'
import { PinButton } from '@/components/pins'

interface ListViewProps {
  list: List
  items: ListItem[]
  onBack: () => void
  onUpdateList: (listId: string, updates: Partial<List>) => void
  onDeleteList?: (listId: string) => void
  onAddItem?: (item: { text: string; note?: string }) => Promise<ListItem | null>
  onUpdateItem?: (itemId: string, updates: Partial<ListItem>) => void
  onDeleteItem?: (itemId: string) => void
  onReorderItems?: (itemIds: string[]) => void
  isPinned?: boolean
  canPin?: boolean
  onPin?: () => Promise<boolean>
  onUnpin?: () => Promise<boolean>
}

export function ListView({
  list,
  items,
  onBack,
  onUpdateList,
  onDeleteList,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReorderItems: _onReorderItems,
  isPinned,
  canPin,
  onPin,
  onUnpin,
}: ListViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editCategory, setEditCategory] = useState<ListCategory>('other')
  const [editVisibility, setEditVisibility] = useState<ListVisibility>('self')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [isAddingBulk, setIsAddingBulk] = useState(false)

  const handleEdit = () => {
    setEditTitle(list.title)
    setEditIcon(list.icon || '')
    setEditCategory(list.category)
    setEditVisibility(list.visibility)
    setIsEditing(true)
  }

  const handleSave = () => {
    const trimmedTitle = editTitle.trim()
    if (trimmedTitle) {
      onUpdateList(list.id, {
        title: trimmedTitle,
        icon: editIcon.trim() || undefined,
        category: editCategory,
        visibility: editVisibility,
      })
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditTitle('')
    setEditIcon('')
    setEditCategory('other')
    setEditVisibility('self')
  }

  const handleDelete = () => {
    if (onDeleteList) {
      onDeleteList(list.id)
      onBack()
    }
  }

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newItemText.trim()
    if (trimmed && onAddItem) {
      await onAddItem({ text: trimmed })
      setNewItemText('')
    }
  }

  const handleBulkAdd = async () => {
    if (!onAddItem || !bulkText.trim()) return

    const lines = bulkText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    if (lines.length === 0) return

    setIsAddingBulk(true)
    try {
      // Add items sequentially to preserve order
      for (const line of lines) {
        await onAddItem({ text: line })
      }
      setBulkText('')
      setShowBulkAdd(false)
    } finally {
      setIsAddingBulk(false)
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Back
            </button>
            <span className="text-neutral-300">/</span>
            <span className="text-sm font-medium text-neutral-600">List</span>
          </div>

          {isEditing ? (
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Title</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                                 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      autoFocus
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Icon</label>
                    <input
                      type="text"
                      value={editIcon}
                      onChange={(e) => setEditIcon(e.target.value)}
                      placeholder={getCategoryIcon(editCategory)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white text-center
                                 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {LIST_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setEditCategory(category)}
                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                          editCategory === category
                            ? 'bg-purple-100 text-purple-700 font-medium'
                            : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                        }`}
                      >
                        {getCategoryIcon(category)} {getCategoryLabel(category)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Visibility</label>
                  <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setEditVisibility('self')}
                      className={`flex-1 py-2 px-3 text-sm font-medium transition-colors
                        ${editVisibility === 'self'
                          ? 'bg-neutral-100 text-neutral-700'
                          : 'bg-white text-neutral-500 hover:bg-neutral-50'
                        }`}
                    >
                      Private
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditVisibility('family')}
                      className={`flex-1 py-2 px-3 text-sm font-medium border-l border-neutral-200 transition-colors
                        ${editVisibility === 'family'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-white text-neutral-500 hover:bg-neutral-50'
                        }`}
                    >
                      Shared with Family
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-2 px-3 text-sm font-medium text-neutral-600 bg-white rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!editTitle.trim()}
                    className="flex-1 py-2 px-3 text-sm font-medium text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-2xl flex-shrink-0">
                  {list.icon || getCategoryIcon(list.category)}
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-neutral-800">{list.title}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                      {getCategoryLabel(list.category)}
                    </span>
                    {list.visibility === 'family' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-neutral-100 text-neutral-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                        Shared
                      </span>
                    )}
                    <span className="text-sm text-neutral-500">
                      {items.length} item{items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {onPin && onUnpin && (
                  <PinButton
                    entityType="list"
                    entityId={list.id}
                    isPinned={isPinned ?? false}
                    canPin={canPin ?? true}
                    onPin={onPin}
                    onUnpin={onUnpin}
                    size="md"
                  />
                )}
                <button
                  onClick={handleEdit}
                  className="p-2 text-neutral-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  aria-label="Edit list"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
                {onDeleteList && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label="Delete list"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800 mb-3">
                Are you sure you want to delete this list? All items in this list will also be deleted.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 px-3 text-sm font-medium text-neutral-600 bg-white rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2 px-3 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                >
                  Delete List
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Items list */}
        <div>
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Items</h2>

          {/* Add item input */}
          {onAddItem && !showBulkAdd && (
            <div className="mb-4">
              <form onSubmit={handleAddItem}>
                <div className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 hover:border-neutral-300 focus-within:border-purple-300 focus-within:bg-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  <input
                    type="text"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    placeholder="Add an item..."
                    className="flex-1 bg-transparent text-base text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                  />
                  {newItemText.trim() && (
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs font-medium text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                    >
                      Add
                    </button>
                  )}
                </div>
              </form>
              <button
                type="button"
                onClick={() => setShowBulkAdd(true)}
                className="mt-2 text-xs text-neutral-400 hover:text-purple-600 transition-colors flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                </svg>
                Add multiple items at once
              </button>
            </div>
          )}

          {/* Bulk add mode */}
          {onAddItem && showBulkAdd && (
            <div className="mb-4 p-4 bg-purple-50 rounded-xl border border-purple-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-purple-800">Bulk Add Items</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkAdd(false)
                    setBulkText('')
                  }}
                  className="text-purple-400 hover:text-purple-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-purple-600 mb-3">
                Enter one item per line. You can paste a list from anywhere.
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Restaurant A&#10;Restaurant B&#10;Restaurant C&#10;..."
                rows={6}
                className="w-full px-3 py-2 text-sm rounded-lg border border-purple-200 bg-white
                           focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                           resize-none font-mono"
                autoFocus
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-purple-500">
                  {bulkText.split('\n').filter(l => l.trim()).length} items
                </span>
                <button
                  type="button"
                  onClick={handleBulkAdd}
                  disabled={!bulkText.trim() || isAddingBulk}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-500 rounded-lg
                             hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center gap-2"
                >
                  {isAddingBulk ? (
                    <>
                      <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Add All Items
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-neutral-500 mb-2">No items yet</p>
              <p className="text-sm text-neutral-400">Add an item above to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <ListItemRow
                  key={item.id}
                  item={item}
                  onUpdate={onUpdateItem ? (updates) => onUpdateItem(item.id, updates) : undefined}
                  onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
