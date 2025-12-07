import type { SearchResult } from '@/hooks/useSearch'

interface SearchResultItemProps {
  result: SearchResult
  isSelected: boolean
  onClick: () => void
}

export function SearchResultItem({ result, isSelected, onClick }: SearchResultItemProps) {
  // Type-specific icon
  const renderIcon = () => {
    switch (result.type) {
      case 'task':
        return (
          <span
            className={`
              w-4 h-4 rounded border-2 flex items-center justify-center shrink-0
              ${result.completed
                ? 'bg-primary-500 border-primary-500 text-white'
                : 'border-neutral-300'
              }
            `}
          >
            {result.completed && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </span>
        )
      case 'project':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        )
      case 'contact':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        )
      case 'routine':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        )
      case 'list':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-purple-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
          </svg>
        )
    }
  }

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors
        ${isSelected
          ? 'bg-primary-50 text-primary-900'
          : 'hover:bg-neutral-50'
        }
        ${result.completed ? 'opacity-60' : ''}
      `}
    >
      {renderIcon()}
      <div className="flex-1 min-w-0">
        <div
          className={`
            text-sm font-medium truncate
            ${result.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
          `}
        >
          {result.title}
        </div>
        {result.subtitle && (
          <div className="text-xs text-neutral-500 truncate">
            {result.subtitle}
          </div>
        )}
      </div>
    </button>
  )
}
