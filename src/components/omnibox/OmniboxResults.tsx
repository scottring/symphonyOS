// src/components/omnibox/OmniboxResults.tsx
//
// The search half of the ⌘K unibox: as you type in Quick Add, matching
// tasks/projects/contacts/routines/lists appear inline under the input.
// Self-contained (subscribes to data hooks ONLY while mounted, mirroring
// ShellSearch) — QuickCapture mounts it via a slot prop only while open and
// the query is 2+ chars, so the always-mounted FAB costs nothing.

import { useEffect, useMemo } from 'react'
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

  const { results, totalResults, setQuery } = useSearch({
    tasks, projects, contacts, routines, lists,
  })
  // useSearch holds its own (debounced) query state; mirror the input into it.
  useEffect(() => { setQuery(query) }, [query, setQuery])

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

  if (totalResults === 0) return null

  return (
    <div className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
        Existing items
      </div>
      <ul>
        {flat.map((r) => (
          <li key={`${r.type}-${r.id}`}>
            <SearchResultItem
              result={r}
              isSelected={false}
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
