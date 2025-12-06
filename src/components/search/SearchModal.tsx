import { useEffect, useRef, useState, useCallback } from 'react'
import type { SearchResult, GroupedSearchResults } from '@/hooks/useSearch'
import { SearchResultItem } from './SearchResultItem'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  query: string
  onQueryChange: (query: string) => void
  results: GroupedSearchResults
  totalResults: number
  isSearching: boolean
  onSelectResult: (result: SearchResult) => void
}

const MAX_RESULTS_PER_TYPE = 5

export function SearchModal({
  isOpen,
  onClose,
  query,
  onQueryChange,
  results,
  totalResults,
  isSearching,
  onSelectResult,
}: SearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  // Build flat list of visible results for keyboard navigation
  const flatResults = useCallback((): SearchResult[] => {
    const all: SearchResult[] = []

    const addResults = (items: SearchResult[], type: string) => {
      const limit = expandedSections.has(type) ? items.length : MAX_RESULTS_PER_TYPE
      all.push(...items.slice(0, limit))
    }

    if (results.tasks.length > 0) addResults(results.tasks, 'tasks')
    if (results.projects.length > 0) addResults(results.projects, 'projects')
    if (results.contacts.length > 0) addResults(results.contacts, 'contacts')
    if (results.routines.length > 0) addResults(results.routines, 'routines')

    return all
  }, [results, expandedSections])

  // Focus input when modal opens
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      setSelectedIndex(0)
      setExpandedSections(new Set())
    }
  }, [isOpen])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const flat = flatResults()

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
          break
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, flat.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flat[selectedIndex]) {
            onSelectResult(flat[selectedIndex])
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, flatResults, onClose, onSelectResult])

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Get current index for a result in the flat list
  const getResultIndex = (type: string, indexInType: number): number => {
    let offset = 0

    if (type === 'tasks') {
      return indexInType
    }

    offset += Math.min(
      results.tasks.length,
      expandedSections.has('tasks') ? results.tasks.length : MAX_RESULTS_PER_TYPE
    )

    if (type === 'projects') {
      return offset + indexInType
    }

    offset += Math.min(
      results.projects.length,
      expandedSections.has('projects') ? results.projects.length : MAX_RESULTS_PER_TYPE
    )

    if (type === 'contacts') {
      return offset + indexInType
    }

    offset += Math.min(
      results.contacts.length,
      expandedSections.has('contacts') ? results.contacts.length : MAX_RESULTS_PER_TYPE
    )

    return offset + indexInType // routines
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const renderSection = (
    title: string,
    items: SearchResult[],
    type: string
  ) => {
    if (items.length === 0) return null

    const isExpanded = expandedSections.has(type)
    const visibleItems = isExpanded ? items : items.slice(0, MAX_RESULTS_PER_TYPE)
    const hasMore = items.length > MAX_RESULTS_PER_TYPE

    return (
      <div className="mb-4">
        <div className="px-3 py-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
          {title} ({items.length})
        </div>
        <div className="space-y-0.5">
          {visibleItems.map((result, idx) => (
            <SearchResultItem
              key={result.id}
              result={result}
              isSelected={selectedIndex === getResultIndex(type, idx)}
              onClick={() => onSelectResult(result)}
            />
          ))}
        </div>
        {hasMore && (
          <button
            onClick={() => toggleSection(type)}
            className="w-full px-3 py-1.5 text-xs text-primary-600 hover:text-primary-700 text-left"
          >
            {isExpanded ? 'Show less' : `Show ${items.length - MAX_RESULTS_PER_TYPE} more`}
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        ref={modalRef}
        className="bg-white p-6 w-[90%] md:w-1/2 max-w-xl rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        {/* Header with keyboard hint */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-800">Search</h2>
          <kbd className="px-2 py-1 text-xs font-mono bg-neutral-100 text-neutral-500 rounded">
            ⌘J
          </kbd>
        </div>

        {/* Search input - styled like QuickCapture */}
        <div className="relative mb-4">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="What are you looking for?"
            className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50
                       text-neutral-800 placeholder:text-neutral-400 text-2xl font-display
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {query && (
            <button
              onClick={() => onQueryChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Results */}
        {query && (
          <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50">
            {isSearching ? (
              <div className="py-8 text-center text-neutral-500">
                Searching...
              </div>
            ) : totalResults === 0 ? (
              <div className="py-8 text-center text-neutral-500">
                No results for "{query}"
              </div>
            ) : (
              <div className="p-2">
                {renderSection('Tasks', results.tasks, 'tasks')}
                {renderSection('Projects', results.projects, 'projects')}
                {renderSection('Contacts', results.contacts, 'contacts')}
                {renderSection('Routines', results.routines, 'routines')}
              </div>
            )}
          </div>
        )}

        {/* Footer with keyboard hints */}
        {query && totalResults > 0 && (
          <div className="hidden md:flex items-center gap-4 mt-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-neutral-100 rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-neutral-100 rounded">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-neutral-100 rounded">↵</kbd>
              to select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-neutral-100 rounded">esc</kbd>
              to close
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
