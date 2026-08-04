import { useState, useMemo, useCallback, useEffect } from 'react'
import Fuse from 'fuse.js'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/actionable'
import type { List } from '@/types/list'
import type { Note } from '@/types/note'
import { getCategoryLabel } from '@/types/list'
import { parseFieldIntent } from '@/lib/search/fieldIntent'

export type SearchResultType = 'task' | 'project' | 'contact' | 'routine' | 'list' | 'note'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle?: string
  matchedField?: string
  completed?: boolean
  item: Task | Project | Contact | Routine | List | Note
}

export interface GroupedSearchResults {
  tasks: SearchResult[]
  projects: SearchResult[]
  contacts: SearchResult[]
  routines: SearchResult[]
  lists: SearchResult[]
  notes: SearchResult[]
}

interface UseSearchProps {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  routines: Routine[]
  lists?: List[]
  notes?: Note[]
}

// threshold 0.4 was loose enough that "ped" matched "Remove insulation tape"
// (Bitap approximate matching), burying the real hit under dozens of junk rows
// and making the group counts meaningless. 0.3 keeps prefix/substring matches,
// mild typos, and one-word-stem fuzziness (e.g. "podiatrist" -> "podiatry",
// score ~0.18) while still dropping character-soup matches — the noisy-task
// regression set only starts reappearing at 0.35 (score ~0.28 for the junk
// "tape" match); minMatchCharLength stops single characters from matching
// everything.
const FUSE_OPTIONS = {
  threshold: 0.3,
  includeMatches: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
}

// Flatten tasks to include subtasks for searching
function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = []
  for (const task of tasks) {
    result.push(task)
    if (task.subtasks) {
      result.push(...task.subtasks)
    }
  }
  return result
}

export function useSearch({ tasks, projects, contacts, routines, lists = [], notes = [] }: UseSearchProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // Debounce the query
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (query === '') {
      setDebouncedQuery('')
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
      setIsSearching(false)
    }, 150)

    return () => clearTimeout(timer)
  }, [query])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Flatten tasks to include subtasks
  const allTasks = useMemo(() => flattenTasks(tasks), [tasks])

  // Build Fuse instances
  const taskFuse = useMemo(
    () =>
      new Fuse(allTasks, {
        ...FUSE_OPTIONS,
        keys: [
          { name: 'title', weight: 2 },
          { name: 'notes', weight: 1 },
          { name: 'phoneNumber', weight: 1 },
        ],
      }),
    [allTasks]
  )

  const projectFuse = useMemo(
    () =>
      new Fuse(projects, {
        ...FUSE_OPTIONS,
        keys: [
          { name: 'name', weight: 2 },
          { name: 'notes', weight: 1 },
          { name: 'phoneNumber', weight: 1 },
        ],
      }),
    [projects]
  )

  const contactFuse = useMemo(
    () =>
      new Fuse(contacts, {
        ...FUSE_OPTIONS,
        keys: [
          { name: 'name', weight: 2 },
          { name: 'email', weight: 1.5 },
          { name: 'phone', weight: 1.5 },
          { name: 'notes', weight: 1 },
          { name: 'category', weight: 1 },
          { name: 'preferences', weight: 1 },
          { name: 'relationship', weight: 0.8 },
        ],
      }),
    [contacts]
  )

  const routineFuse = useMemo(
    () =>
      new Fuse(routines, {
        ...FUSE_OPTIONS,
        keys: [
          { name: 'name', weight: 2 },
          { name: 'description', weight: 1 },
        ],
      }),
    [routines]
  )

  const listFuse = useMemo(
    () =>
      new Fuse(lists, {
        ...FUSE_OPTIONS,
        keys: [
          { name: 'title', weight: 2 },
        ],
      }),
    [lists]
  )

  const noteFuse = useMemo(
    () =>
      new Fuse(notes, {
        ...FUSE_OPTIONS,
        keys: [
          { name: 'content', weight: 2 },
          { name: 'title', weight: 1.5 },
          { name: 'topic.name', weight: 1 },
        ],
      }),
    [notes]
  )

  // Get project name helper
  const getProjectName = useCallback(
    (projectId: string | undefined): string | undefined => {
      if (!projectId) return undefined
      return projects.find((p) => p.id === projectId)?.name
    },
    [projects]
  )

  // Format recurrence pattern for display
  const formatRecurrence = (routine: Routine): string => {
    const pattern = routine.recurrence_pattern
    const time = routine.time_of_day
      ? ` at ${routine.time_of_day.slice(0, 5)}`
      : ''

    switch (pattern.type) {
      case 'daily':
        return `Daily${time}`
      case 'weekly':
        if (pattern.days?.length) {
          const days = pattern.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')
          return `${days}${time}`
        }
        return `Weekly${time}`
      case 'monthly':
        return `Monthly${time}`
      case 'quarterly':
        return `Quarterly${time}`
      case 'yearly':
        return `Yearly${time}`
      case 'specific_days':
        return `Specific days${time}`
      default:
        return routine.time_of_day ? time.trim() : ''
    }
  }

  // "podiatrist phone number" should search for "podiatrist" — the "phone
  // number" part is an instruction about which field to surface, not text to
  // fuzzy-match against every record. See fieldIntent.ts. Exposed separately
  // (not just inlined in the results useMemo below) so consumers can decide
  // how to render a field value — e.g. as a tel: link when intent is 'phone'.
  const parsedQuery = useMemo(() => parseFieldIntent(debouncedQuery), [debouncedQuery])

  // Search results
  const results = useMemo((): GroupedSearchResults => {
    if (!debouncedQuery.trim()) {
      return { tasks: [], projects: [], contacts: [], routines: [], lists: [], notes: [] }
    }

    const { terms, intent } = parsedQuery
    // Guard against an all-punctuation query stripping to an empty string —
    // fall back to searching the raw query rather than matching nothing.
    const searchText = terms || debouncedQuery

    const taskResults = taskFuse.search(searchText)
    const projectResults = projectFuse.search(searchText)
    const contactResults = contactFuse.search(searchText)
    const routineResults = routineFuse.search(searchText)
    const listResults = listFuse.search(searchText)
    const noteResults = noteFuse.search(searchText)

    // Convert to SearchResult format
    const tasks: SearchResult[] = taskResults.map((r) => {
      // Under field intent, the requested value IS the answer the user is
      // hunting for — show it in place of the usual project-name subtitle so
      // it's readable (and, in the UI layer, tappable) without opening the task.
      let subtitle = getProjectName(r.item.projectId)
      if (intent === 'phone' && r.item.phoneNumber) {
        subtitle = r.item.phoneNumber
      } else if (intent === 'email' && r.item.email) {
        subtitle = r.item.email
      }
      return {
        type: 'task' as const,
        id: r.item.id,
        title: r.item.title,
        subtitle,
        matchedField: r.matches?.[0]?.key,
        completed: r.item.completed,
        item: r.item,
      }
    })

    if (intent === 'phone' || intent === 'email') {
      // Demote — don't remove — results lacking the requested field. Field
      // detection isn't perfect; hiding results outright would bury the
      // thing being hunted for whenever it's wrong. Fuse's relative order is
      // preserved within each group since Array#sort is a stable sort.
      const hasField = (r: SearchResult) => {
        const t = r.item as Task
        return Boolean(intent === 'phone' ? t.phoneNumber : t.email)
      }
      tasks.sort((a, b) => Number(hasField(b)) - Number(hasField(a)))
    } else {
      // Sort tasks: incomplete first, then completed
      tasks.sort((a, b) => {
        if (a.completed && !b.completed) return 1
        if (!a.completed && b.completed) return -1
        return 0
      })
    }

    const projectsResult: SearchResult[] = projectResults.map((r) => ({
      type: 'project' as const,
      id: r.item.id,
      title: r.item.name,
      subtitle: intent === 'phone' && r.item.phoneNumber ? r.item.phoneNumber : undefined,
      matchedField: r.matches?.[0]?.key,
      item: r.item,
    }))

    if (intent === 'phone') {
      const hasPhone = (r: SearchResult) => Boolean((r.item as Project).phoneNumber)
      projectsResult.sort((a, b) => Number(hasPhone(b)) - Number(hasPhone(a)))
    }

    const contactsResult: SearchResult[] = contactResults.map((r) => {
      // Build subtitle: category + phone/email
      const parts: string[] = []
      if (r.item.category) {
        const categoryLabels: Record<string, string> = {
          family: 'Family',
          friend: 'Friend',
          service_provider: 'Service Provider',
          professional: 'Professional',
          school: 'School',
          medical: 'Medical',
          other: 'Other',
        }
        parts.push(categoryLabels[r.item.category] || r.item.category)
      }
      if (r.item.phone) parts.push(r.item.phone)
      else if (r.item.email) parts.push(r.item.email)

      return {
        type: 'contact' as const,
        id: r.item.id,
        title: r.item.name,
        subtitle: parts.length > 0 ? parts.join(' · ') : undefined,
        matchedField: r.matches?.[0]?.key,
        item: r.item,
      }
    })

    const routinesResult: SearchResult[] = routineResults.map((r) => ({
      type: 'routine' as const,
      id: r.item.id,
      title: r.item.name,
      subtitle: formatRecurrence(r.item),
      matchedField: r.matches?.[0]?.key,
      item: r.item,
    }))

    const listsResult: SearchResult[] = listResults.map((r) => ({
      type: 'list' as const,
      id: r.item.id,
      title: r.item.title,
      subtitle: getCategoryLabel(r.item.category),
      matchedField: r.matches?.[0]?.key,
      item: r.item,
    }))

    const notesResult: SearchResult[] = noteResults.map((r) => {
      // Get the title or first line of content for display
      const displayTitle = r.item.title || r.item.content.split('\n')[0].slice(0, 50) + (r.item.content.length > 50 ? '...' : '')
      // Show topic name as subtitle if available
      const subtitle = r.item.topic?.name || undefined

      return {
        type: 'note' as const,
        id: r.item.id,
        title: displayTitle,
        subtitle,
        matchedField: r.matches?.[0]?.key,
        item: r.item,
      }
    })

    return {
      tasks,
      projects: projectsResult,
      contacts: contactsResult,
      routines: routinesResult,
      lists: listsResult,
      notes: notesResult,
    }
  }, [debouncedQuery, parsedQuery, taskFuse, projectFuse, contactFuse, routineFuse, listFuse, noteFuse, getProjectName])

  // Total result count
  const totalResults =
    results.tasks.length +
    results.projects.length +
    results.contacts.length +
    results.routines.length +
    results.lists.length +
    results.notes.length

  // Clear search
  const clearSearch = useCallback(() => {
    setQuery('')
    setDebouncedQuery('')
  }, [])

  return {
    query,
    setQuery,
    results,
    totalResults,
    isSearching,
    clearSearch,
    /** The field the query is asking for ('phone'/'email'/'address'), or null for plain text search. */
    intent: parsedQuery.intent,
  }
}
