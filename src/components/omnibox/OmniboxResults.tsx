// src/components/omnibox/OmniboxResults.tsx
//
// The search half of the ⌘K unibox: as you type in Quick Add, matching
// tasks/projects/contacts/routines/lists appear inline under the input.
// Self-contained (subscribes to data hooks ONLY while mounted, mirroring
// ShellSearch) — QuickCapture mounts it via a slot prop only while open and
// the query is 2+ chars, so the always-mounted FAB costs nothing.
//
// Keyboard: ↑/↓ move a highlight through the rows; Enter opens the highlighted
// row (captured on window before QuickCapture's input submit handler runs, so
// plain Enter with no highlight still adds the task as before).

import { useEffect, useMemo, useState } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useProjects } from '@/hooks/useProjects'
import { useContacts } from '@/hooks/useContacts'
import { useRoutines } from '@/hooks/useRoutines'
import { useListsContext } from '@/contexts/ListsContext'
import { useSearch, type SearchResult } from '@/hooks/useSearch'
import { SearchResultItem } from '@/components/search'
import { useSearchNavigation } from '@/shell/useSearchNavigation'

const MAX_ROWS = 6

interface OmniboxResultsProps {
  query: string
  /** Called after a result is opened, so the host modal can close. */
  onNavigate: () => void
}

export function OmniboxResults({ query, onNavigate }: OmniboxResultsProps) {
  const { tasks } = useSupabaseTasks()
  const { projects } = useProjects()
  const { contacts } = useContacts()
  const { routines } = useRoutines()
  const { lists } = useListsContext()
  const openResult = useSearchNavigation()
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const { results, totalResults, setQuery } = useSearch({
    tasks, projects, contacts, routines, lists,
  })
  // useSearch holds its own (debounced) query state; mirror the input into it.
  useEffect(() => { setQuery(query) }, [query, setQuery])
  // New text = new results; drop the highlight so plain Enter adds as usual.
  useEffect(() => { setSelectedIndex(-1) }, [query])

  const flat = useMemo<SearchResult[]>(
    () => [
      ...results.tasks,
      ...results.projects,
      ...results.contacts,
      ...results.routines,
      ...results.lists,
    ].slice(0, MAX_ROWS),
    [results],
  )

  // Capture-phase so a highlighted Enter wins over the host input's submit.
  useEffect(() => {
    if (flat.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, flat.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, -1))
      } else if (e.key === 'Enter' && selectedIndex >= 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        openResult(flat[selectedIndex], tasks)
        onNavigate()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [flat, selectedIndex, openResult, tasks, onNavigate])

  if (totalResults === 0) return null

  return (
    <div className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-100">
        <span className="text-[10px] uppercase tracking-wider text-neutral-400">Existing items</span>
        <span className="text-[10px] text-neutral-300">↑↓ select · ↵ open</span>
      </div>
      <ul>
        {flat.map((r, i) => (
          <li key={`${r.type}-${r.id}`}>
            <SearchResultItem
              result={r}
              isSelected={i === selectedIndex}
              onClick={() => {
                openResult(r, tasks)
                onNavigate()
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
