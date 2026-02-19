import type { PlanningResource } from '@/types/planning'
import { ResourceCard } from './ResourceCard'

interface ResourceListProps {
  resources: PlanningResource[]
  selectedId: string | null
  onSelectResource: (id: string | null) => void
  onAddPaste: () => void
  onAddUpload: () => void
  onAddNote: () => void
  loading?: boolean
}

export function ResourceList({
  resources,
  selectedId,
  onSelectResource,
  onAddPaste,
  onAddUpload,
  onAddNote,
  loading,
}: ResourceListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header + add buttons */}
      <div className="px-4 pt-4 pb-3">
        <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">Research</h3>
        <div className="flex gap-1.5">
          <button
            onClick={onAddPaste}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Paste
          </button>
          <button
            onClick={onAddUpload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload
          </button>
          <button
            onClick={onAddNote}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Note
          </button>
        </div>
      </div>

      {/* Resource list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {loading ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-neutral-400">Loading...</p>
          </div>
        ) : resources.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-neutral-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <p className="text-sm text-neutral-500 mb-1">No research yet</p>
            <p className="text-xs text-neutral-400">
              Paste articles, upload PDFs, or add notes
            </p>
          </div>
        ) : (
          resources.map(resource => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              isSelected={selectedId === resource.id}
              onSelect={() => onSelectResource(selectedId === resource.id ? null : resource.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
