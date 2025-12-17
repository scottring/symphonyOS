import { useState, useMemo, useCallback, useEffect } from 'react'
import Fuse from 'fuse.js'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/actionable'
import type { List } from '@/types/list'
import { getCategoryLabel } from '@/types/list'

export type SearchResultType = 'task' | 'project' | 'contact' | 'routine' | 'list'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle?: string
  matchedField?: string
  completed?: boolean
  item: Task | Project | Contact | Routine | List
}

export interface GroupedSearchResults {
  tasks: SearchResult[]
  projects: SearchResult[]
  contacts: SearchResult[]
  routines: SearchResult[]
  lists: SearchResult[]
}

interface UseSearchProps {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  routines: Routine[]
  lists?: List[]
}

const FUSE_OPTIONS = {
  threshold: 0.4,
  includeMatches: true,
  ignoreLocation: true,
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

export function useSearch({ tasks, projects, contacts, routines, lists = [] }: UseSearchProps) {
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

  // Search results
  const results = useMemo((): GroupedSearchResults => {
    if (!debouncedQuery.trim()) {
      return { tasks: [], projects: [], contacts: [], routines: [], lists: [] }
    }

    const taskResults = taskFuse.search(debouncedQuery)
    const projectResults = projectFuse.search(debouncedQuery)
    const contactResults = contactFuse.search(debouncedQuery)
    const routineResults = routineFuse.search(debouncedQuery)
    const listResults = listFuse.search(debouncedQuery)

    // Convert to SearchResult format
    const tasks: SearchResult[] = taskResults.map((r) => ({
      type: 'task' as const,
      id: r.item.id,
      title: r.item.title,
      subtitle: getProjectName(r.item.projectId),
      matchedField: r.matches?.[0]?.key,
      completed: r.item.completed,
      item: r.item,
    }))

    // Sort tasks: incomplete first, then completed
    tasks.sort((a, b) => {
      if (a.completed && !b.completed) return 1
      if (!a.completed && b.completed) return -1
      return 0
    })

    const projectsResult: SearchResult[] = projectResults.map((r) => ({
      type: 'project' as const,
      id: r.item.id,
      title: r.item.name,
      matchedField: r.matches?.[0]?.key,
      item: r.item,
    }))

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

    return {
      tasks,
      projects: projectsResult,
      contacts: contactsResult,
      routines: routinesResult,
      lists: listsResult,
    }
  }, [debouncedQuery, taskFuse, projectFuse, contactFuse, routineFuse, listFuse, getProjectName])

  // Total result count
  const totalResults =
    results.tasks.length +
    results.projects.length +
    results.contacts.length +
    results.routines.length +
    results.lists.length

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
  }
}
