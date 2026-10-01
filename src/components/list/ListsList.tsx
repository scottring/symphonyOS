import { useState, useRef, useEffect } from 'react'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { GroupLabel } from '@/components/layout/SectionHeading'
import { EmptyState } from '@/components/layout/EmptyState'
import { LIST_ROW, LIST_ROW_LANE, LIST_ROW_BODY, LIST_ROW_TITLE, LIST_ROW_META, LIST_ROW_TRAIL } from '@/components/layout/listRow'
import type { List, ListCategory } from '@/types/list'
import { getCategoryLabel, LIST_CATEGORIES } from '@/types/list'
import { QuietAction } from '@/components/layout/PageMasthead'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { Clapperboard, UtensilsCrossed, ShoppingBag, Plane, Users2, Home, ClipboardList, Plus, ChevronRight } from 'lucide-react'
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
        <MastheadCard
          variant="page"
          title="Lists"
          motif="lists"
          subline={`${lists.length} list${lists.length !== 1 ? 's' : ''}`}
          footer={
            onAddList && !isCreating ? (
              <QuietAction icon={Plus} label="New" ariaLabel="New list" onClick={() => setIsCreating(true)} />
            ) : undefined
          }
        />

        {/* Inline list creation form */}
        {isCreating && (
          <div className="mb-6 space-y-4 border-b border-neutral-300 pb-6">
            <input
              ref={inputRef}
              type="text"
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's the list?"
              className="w-full rounded-md border border-neutral-300 bg-bg-elevated px-4 py-3
                         font-display text-2xl text-neutral-800 placeholder:text-neutral-400
                         focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />

            {/* Category selector */}
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Category</label>
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

        {/* Lists by category — groups within one list, rows on the library
            row (layout system): the list's icon in the margin lane. */}
        {loading && lists.length === 0 ? (
          <p className="py-4 text-[14px] text-neutral-400">Loading lists…</p>
        ) : lists.length === 0 ? (
          <EmptyState title="No lists yet">Create a list to remember things</EmptyState>
        ) : (
          <div>
            {categoriesWithLists.map((category) => (
              <section key={category} className="mb-6">
                <GroupLabel>{getCategoryLabel(category)}</GroupLabel>
                {listsByCategory[category].map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => onSelectList(list.id)}
                    className={`${LIST_ROW}`}
                  >
                    <span className={LIST_ROW_LANE}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">
                        {list.icon || (() => { const Icon = CATEGORY_ICONS[list.category]; return <Icon className="h-[18px] w-[18px] text-primary-500" /> })()}
                      </span>
                    </span>
                    <span className={LIST_ROW_BODY}>
                      <span className={LIST_ROW_TITLE}>{list.title}</span>
                      {list.visibility === 'family' && (
                        <span className={LIST_ROW_META}>
                          <span className="inline-flex items-center gap-1">
                            <Users2 className="h-3 w-3" aria-hidden="true" />
                            Shared
                          </span>
                        </span>
                      )}
                    </span>
                    <span className={LIST_ROW_TRAIL}>
                      <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                    </span>
                  </button>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
