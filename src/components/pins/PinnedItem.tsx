import { type PinnedItem as PinnedItemType, type PinnableEntityType, pinnableEntityIcons } from '@/types/pin'

interface PinnedItemProps {
  pin: PinnedItemType
  name: string
  onClick: () => void
  onRefresh: () => void
}

function getEntityIcon(entityType: PinnableEntityType): React.ReactNode {
  const iconName = pinnableEntityIcons[entityType]

  switch (iconName) {
    case 'check':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )
    case 'folder':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
      )
    case 'user':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
      )
    case 'repeat':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
      )
    case 'list':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
        </svg>
      )
    default:
      return null
  }
}

export function PinnedItem({ pin, name, onClick, onRefresh }: PinnedItemProps) {
  const handleRefreshClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRefresh()
  }

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left
        transition-all duration-200 group
        ${pin.isStale
          ? 'text-neutral-400 hover:bg-neutral-50'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800'
        }
      `}
    >
      <span className={pin.isStale ? 'text-neutral-300' : 'text-neutral-400'}>
        {getEntityIcon(pin.entityType)}
      </span>
      <span className="flex-1 truncate text-sm">{name}</span>
      {pin.isStale && (
        <button
          onClick={handleRefreshClick}
          className="p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Still need this? Click to keep pinned"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </button>
  )
}
