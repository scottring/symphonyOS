import type { CoachingBlockSuggestion } from '@/types/playbook'
import { BLOCK_TYPE_CONFIG } from '@/types/playbook'

interface BlockPreviewCardProps {
  suggestion: CoachingBlockSuggestion
  isUpdate?: boolean
  onConfirm: () => void
  onDiscard: () => void
  loading?: boolean
}

export function BlockPreviewCard({ suggestion, isUpdate, onConfirm, onDiscard, loading }: BlockPreviewCardProps) {
  const typeConfig = BLOCK_TYPE_CONFIG[suggestion.blockType] || BLOCK_TYPE_CONFIG.routine

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-neutral-50/50 border-b border-neutral-100 flex items-center gap-2">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${typeConfig.bgColor} ${typeConfig.color}`}>
          {typeConfig.label}
        </span>
        <span className="text-sm font-medium text-neutral-700 truncate">{suggestion.label}</span>
        <span className="text-xs text-neutral-400 ml-auto shrink-0">{suggestion.timeSlot}</span>
      </div>

      {/* Narrative */}
      <div className="px-3 py-2.5">
        <p className="text-sm font-display text-neutral-700 italic leading-relaxed">
          {suggestion.narrative}
        </p>
      </div>

      {/* Items */}
      {suggestion.items.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {suggestion.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-neutral-600">
              <span className="text-neutral-400 mt-0.5 shrink-0">-</span>
              <span>
                <span className="font-medium">{item.who}:</span> {item.action}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Coaching note */}
      {suggestion.coachingNote && (
        <div className="mx-3 mb-2.5 px-2.5 py-2 rounded-lg bg-sage-50 border border-sage-200">
          <p className="text-xs text-sage-700 leading-relaxed">{suggestion.coachingNote}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2.5 border-t border-neutral-100 flex gap-2">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 py-2 rounded-lg text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Adding...' : isUpdate ? 'Update on Timeline' : 'Add to Timeline'}
        </button>
        <button
          onClick={onDiscard}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-500 bg-neutral-100 hover:bg-neutral-200 transition-colors disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  )
}
