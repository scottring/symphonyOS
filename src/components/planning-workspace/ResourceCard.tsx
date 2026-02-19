import type { PlanningResource } from '@/types/planning'

interface ResourceCardProps {
  resource: PlanningResource
  isSelected: boolean
  onSelect: () => void
}

const TYPE_ICONS: Record<string, string> = {
  paste: 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3',
  upload: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  note: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ResourceCard({ resource, isSelected, onSelect }: ResourceCardProps) {
  const iconPath = TYPE_ICONS[resource.resourceType] || TYPE_ICONS.note

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl transition-all duration-150 ${
        isSelected
          ? 'bg-primary-50/80 border border-primary-200/60 shadow-sm'
          : 'border border-transparent hover:bg-neutral-50'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <svg className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-primary-500' : 'text-neutral-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
        </svg>
        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-medium truncate ${isSelected ? 'text-primary-800' : 'text-neutral-700'}`}>
            {resource.title}
          </h4>
          {resource.content && (
            <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2 leading-relaxed">
              {resource.content.slice(0, 120)}
            </p>
          )}
          {resource.resourceType === 'upload' && resource.fileName && (
            <p className="text-[11px] text-neutral-400 mt-0.5">
              {resource.fileName}
              {resource.fileSize && ` (${formatFileSize(resource.fileSize)})`}
            </p>
          )}
          {resource.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {resource.tags.map(tag => (
                <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-500">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
