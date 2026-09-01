import { useState, useRef, useEffect } from 'react'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import type { List, ListCategory } from '@/types/list'
import { getCategoryLabel, LIST_CATEGORIES } from '@/types/list'
import { PageMasthead, QuietAction } from '@/components/layout/PageMasthead'
import { Clapperboard, UtensilsCrossed, ShoppingBag, Plane, Users2, Home, ClipboardList, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Lucide category icons (design-unification 2026-09-01) — chrome never uses
// emoji; a list's own user-chosen emoji icon still shows on its row.
const CATEGORY_ICONS: Record<ListCategory, LucideIcon> = {
  entertainment: Clapperboard, food_drink: UtensilsCrossed, shopping: ShoppingBag,
  travel: Plane, family_info: Users2, home: Home, other: ClipboardList,
}

interface ListsListProps {
  lists: List[]
  /** Hold the empty state until the first load settles. */
  loading?: boolean
  listsByCategory: Record<ListCategory, List[]>
  onSelectList: (listId: string) => void
  onAddList?: (list: { title: string; category: ListCategory }) => Promise<List | null>
}

export function ListsList({ lists, loading = false, listsByCategory, onSelectList, onAddList }: ListsListProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [newListCategory, setNewListCategory] = useState<ListCategory>('other')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus()
    }
  }, [isCreating])

  const handleCreateList = async () => {
    if (!onAddList || !newListTitle.trim()) return

    setIsSaving(true)
    const result = await onAddList({
      title: newListTitle.trim(),
      category: newListCategory,
    })
    setIsSaving(false)

    if (result) {
      setIsCreating(false)
      setNewListTitle('')
      setNewListCategory('other')
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setNewListTitle('')
    setNewListCategory('other')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateList()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  // Get categories that have lists, in display order
  const categoriesWithLists = LIST_CATEGORIES.filter(
    (category) => listsByCategory[category].length > 0
  )

  return (
    <div className="h-full overflow-auto">
      <div className={PAGE_COLUMN}>
        {/* Header — shared Library masthead (design-unification 2026-09-01) */}
        <PageMasthead
          title="Lists"
          description={`${lists.length} list${lists.length !== 1 ? 's' : ''}`}
          actions={
            onAddList && !isCreating ? (
              <QuietAction icon={Plus} label="New" ariaLabel="New list" onClick={() => setIsCreating(true)} />
            ) : undefined
          }
        />

        {/* Inline list creation form */}
        {isCreating && (
          <div className="mb-6 p-6 rounded-xl bg-white border border-primary-200 shadow-sm space-y-4">
            <input
              ref={inputRef}
              type="text"
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's the list?"
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50
                         text-neutral-800 placeholder:text-neutral-400 text-2xl font-display
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />

            {/* Category selector */}
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">Category</label>
              <div className="flex flex-wrap gap-2">
                {LIST_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setNewListCategory(category)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      newListCategory === category
                        ? 'bg-primary-100 text-primary-700 font-medium'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {getCategoryLabel(category)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateList}
                disabled={!newListTitle.trim() || isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Creating...' : 'Create List'}
              </button>
            </div>
          </div>
        )}

        {/* Lists by category */}
        {loading && lists.length === 0 ? (
          <p className="text-center py-12 text-neutral-400">Loading lists…</p>
        ) : lists.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-neutral-500 mb-2">No lists yet</p>
            <p className="text-sm text-neutral-400">Create a list to remember things</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categoriesWithLists.map((category) => (
              <div key={category}>
                <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  {(() => { const Icon = CATEGORY_ICONS[category]; return <Icon className="w-4 h-4 text-neutral-400" /> })()}
                  {getCategoryLabel(category)}
                </h2>
                <div className="space-y-2">
                  {listsByCategory[category].map((list) => (
                    <button
                      key={list.id}
                      onClick={() => onSelectList(list.id)}
                      className="w-full flex items-center gap-3 p-4 rounded-xl bg-white border border-neutral-100 hover:border-neutral-200 hover:shadow-sm transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-xl flex-shrink-0">
                        {list.icon || (() => { const Icon = CATEGORY_ICONS[list.category]; return <Icon className="w-5 h-5 text-primary-500" /> })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-neutral-800 truncate">{list.title}</div>
                        <div className="text-sm text-neutral-400 mt-0.5">
                          {list.visibility === 'family' && (
                            <span className="inline-flex items-center gap-1 mr-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                              </svg>
                              Shared
                            </span>
                          )}
                        </div>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
