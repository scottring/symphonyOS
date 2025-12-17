import { useState, useMemo, useRef, useEffect } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { NoteEntityType } from '@/types/note'

interface EntityLinkPickerProps {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  onSelect: (entityType: NoteEntityType, entityId: string) => void
  onClose: () => void
  excludeLinks?: Array<{ entityType: NoteEntityType; entityId: string }>
}

type EntityOption = {
  type: NoteEntityType
  id: string
  name: string
  icon: string
}

export function EntityLinkPicker({
  tasks,
  projects,
  contacts,
  onSelect,
  onClose,
  excludeLinks = [],
}: EntityLinkPickerProps) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'task' | 'project' | 'contact'>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Build list of all entities with type info
  const allEntities = useMemo(() => {
    const excludeSet = new Set(excludeLinks.map((l) => `${l.entityType}:${l.entityId}`))
    const entities: EntityOption[] = []

    for (const task of tasks) {
      if (!excludeSet.has(`task:${task.id}`)) {
        entities.push({
          type: 'task',
          id: task.id,
          name: task.title,
          icon: '📋',
        })
      }
    }

    for (const project of projects) {
      if (!excludeSet.has(`project:${project.id}`)) {
        entities.push({
          type: 'project',
          id: project.id,
          name: project.name,
          icon: '📁',
        })
      }
    }

    for (const contact of contacts) {
      if (!excludeSet.has(`contact:${contact.id}`)) {
        entities.push({
          type: 'contact',
          id: contact.id,
          name: contact.name,
          icon: '👤',
        })
      }
    }

    return entities
  }, [tasks, projects, contacts, excludeLinks])

  // Filter by search and tab
  const filteredEntities = useMemo(() => {
    let filtered = allEntities

    if (activeTab !== 'all') {
      filtered = filtered.filter((e) => e.type === activeTab)
    }

    if (search.trim()) {
      const lowerSearch = search.toLowerCase()
      filtered = filtered.filter((e) => e.name.toLowerCase().includes(lowerSearch))
    }

    return filtered.slice(0, 20) // Limit results
  }, [allEntities, activeTab, search])

  const handleSelect = (entity: EntityOption) => {
    onSelect(entity.type, entity.id)
    onClose()
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden w-80">
      {/* Search */}
      <div className="p-3 border-b border-neutral-100">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks, projects, contacts..."
          className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-100">
        {(['all', 'task', 'project', 'contact'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              flex-1 px-3 py-2 text-xs font-medium transition-colors
              ${activeTab === tab
                ? 'text-primary-700 border-b-2 border-primary-500 bg-primary-50/50'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
              }
            `}
          >
            {tab === 'all' ? 'All' : tab === 'task' ? '📋 Tasks' : tab === 'project' ? '📁 Projects' : '👤 Contacts'}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="max-h-64 overflow-y-auto">
        {filteredEntities.length === 0 ? (
          <div className="p-4 text-center text-sm text-neutral-500">
            {search ? 'No results found' : 'No items available'}
          </div>
        ) : (
          <ul className="py-1">
            {filteredEntities.map((entity) => (
              <li key={`${entity.type}:${entity.id}`}>
                <button
                  onClick={() => handleSelect(entity)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 transition-colors"
                >
                  <span className="text-base">{entity.icon}</span>
                  <span className="flex-1 text-sm text-neutral-700 truncate">{entity.name}</span>
                  <span className="text-xs text-neutral-400 capitalize">{entity.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-neutral-100 bg-neutral-50">
        <button
          onClick={onClose}
          className="w-full px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
