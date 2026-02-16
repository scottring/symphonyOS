import { useState, useEffect } from 'react'
import { Pin, ChevronDown } from 'lucide-react'
import { type PinnedItem as PinnedItemType, type PinnableEntityType } from '@/types/pin'
import { PinnedItem } from './PinnedItem'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/routine'

const STORAGE_KEY = 'symphony-pins-collapsed'

interface EntityData {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  routines: Routine[]
  lists: Array<{ id: string; name: string }>
}

interface PinnedSectionProps {
  pins: PinnedItemType[]
  entities: EntityData
  collapsed: boolean // sidebar collapsed state
  onNavigate: (entityType: PinnableEntityType, entityId: string) => void
  onMarkAccessed: (entityType: PinnableEntityType, entityId: string) => void
  onRefreshStale: (id: string) => void
}

export function PinnedSection({
  pins,
  entities,
  collapsed: sidebarCollapsed,
  onNavigate,
  onMarkAccessed,
  onRefreshStale,
}: PinnedSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'true'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isCollapsed))
  }, [isCollapsed])

  // Don't render if no pins
  if (pins.length === 0) {
    return null
  }

  // Resolve entity name from pin
  const getEntityName = (pin: PinnedItemType): string => {
    switch (pin.entityType) {
      case 'task': {
        const task = entities.tasks.find((t) => t.id === pin.entityId)
        return task?.title || 'Unknown Task'
      }
      case 'project': {
        const project = entities.projects.find((p) => p.id === pin.entityId)
        return project?.name || 'Unknown Project'
      }
      case 'contact': {
        const contact = entities.contacts.find((c) => c.id === pin.entityId)
        return contact?.name || 'Unknown Contact'
      }
      case 'routine': {
        const routine = entities.routines.find((r) => r.id === pin.entityId)
        return routine?.name || 'Unknown Routine'
      }
      case 'list': {
        const list = entities.lists.find((l) => l.id === pin.entityId)
        return list?.name || 'Unknown List'
      }
      default:
        return 'Unknown'
    }
  }

  const handleItemClick = (pin: PinnedItemType) => {
    onMarkAccessed(pin.entityType, pin.entityId)
    onNavigate(pin.entityType, pin.entityId)
  }

  // Sidebar is collapsed - show minimal view
  if (sidebarCollapsed) {
    return (
      <div className="px-3 mt-4">
        <button
          className="w-full p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all flex justify-center"
          title="Pinned items"
        >
          <Pin className="w-5 h-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 mt-4">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        <Pin className="w-4 h-4" />
        <span className="flex-1 text-left">Pinned</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
        />
      </button>

      {/* Pinned items list */}
      {!isCollapsed && (
        <div className="mt-1 space-y-0.5">
          {pins.map((pin) => (
            <PinnedItem
              key={pin.id}
              pin={pin}
              name={getEntityName(pin)}
              onClick={() => handleItemClick(pin)}
              onRefresh={() => onRefreshStale(pin.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
