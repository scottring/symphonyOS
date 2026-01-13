import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { List, ListCategory } from '@/types/list'

interface ListPickerProps {
  lists: List[]
  listsByCategory: Record<ListCategory, List[]>
  onSendToList: (listId: string) => void
  onCreateList?: (title: string, category: ListCategory) => Promise<string | null>
}

const CATEGORY_LABELS: Record<ListCategory, string> = {
  entertainment: 'Entertainment',
  food_drink: 'Food & Drink',
  shopping: 'Shopping',
  travel: 'Travel',
  family_info: 'Family Info',
  home: 'Home',
  other: 'Other',
}

const CATEGORY_ORDER: ListCategory[] = [
  'entertainment',
  'food_drink',
  'shopping',
  'travel',
  'family_info',
  'home',
  'other',
]

export function ListPicker({ lists, listsByCategory, onSendToList }: ListPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchstart', handleClickOutside)
      }
    }
  }, [isOpen])

  const handleSelect = (listId: string) => {
    onSendToList(listId)
    setIsOpen(false)
  }

  const menuContent = isOpen ? (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[200px] max-w-[280px] max-h-[400px] overflow-y-auto animate-fade-in-up"
      style={{
        top: menuPosition.top,
        right: menuPosition.right,
      }}
    >
      {lists.length === 0 ? (
        <div className="px-3 py-8 text-center">
          <p className="text-sm text-neutral-500 mb-2">No lists yet</p>
          <p className="text-xs text-neutral-400">
            Create a list first from the Lists view
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {CATEGORY_ORDER.map((category) => {
            const categoryLists = listsByCategory[category]
            if (categoryLists.length === 0) return null

            return (
              <div key={category}>
                {/* Category header */}
                <div className="px-3 py-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wide">
                  {CATEGORY_LABELS[category]}
                </div>
                {/* Lists in category */}
                {categoryLists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => handleSelect(list.id)}
                    className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-neutral-50 text-neutral-700 flex items-center gap-2 transition-colors"
                  >
                    {list.icon && (
                      <span className="text-base shrink-0">{list.icon}</span>
                    )}
                    <span className="flex-1 truncate">{list.title}</span>
                    {list.visibility === 'family' && (
                      <svg
                        className="w-3.5 h-3.5 text-neutral-400 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  ) : null

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg transition-colors hover:bg-neutral-100"
        aria-label="Send to list"
        title="Send to list"
      >
        <svg
          className="w-5 h-5 text-neutral-400 transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      </button>
      {menuContent && createPortal(menuContent, document.body)}
    </div>
  )
}
