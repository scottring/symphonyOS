import type { BlockFeedbackSummary } from '@/hooks/useWeeklyFeedback'
import { BLOCK_TYPE_CONFIG, QUICK_REACT_CONFIG } from '@/types/playbook'
import type { BlockType, QuickReact } from '@/types/playbook'

interface BlockFeedbackCardProps {
  summary: BlockFeedbackSummary
  previousSummary?: BlockFeedbackSummary | null  // For week-over-week trend
  onEditBlock?: (blockId: string) => void
}

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous
  if (Math.abs(diff) < 0.05) {
    return <span className="text-neutral-400 text-[10px] font-medium" title="No change">→</span>
  }
  if (diff > 0) {
    return <span className="text-green-500 text-[10px] font-medium" title={`+${Math.round(diff * 100)}%`}>↑</span>
  }
  return <span className="text-red-500 text-[10px] font-medium" title={`${Math.round(diff * 100)}%`}>↓</span>
}

export function BlockFeedbackCard({ summary, previousSummary, onEditBlock }: BlockFeedbackCardProps) {
  const config = BLOCK_TYPE_CONFIG[summary.blockType as BlockType]
  const pct = Math.round(summary.completionRate * 100)

  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      summary.flagged ? 'border-amber-300 bg-amber-50/40 ring-1 ring-amber-200/50' : 'border-neutral-200/60 bg-white'
    }`}>
      {/* Flagged warning — top-of-card, more prominent */}
      {summary.flagged && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-100/60 border border-amber-200/60">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-medium text-amber-700">
            Tough {summary.reacts['tough']}x this week — consider adjusting
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {config && (
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${config.bgColor} ${config.color}`}>
              {config.label}
            </span>
          )}
          <h3 className="text-sm font-semibold text-neutral-800 truncate">{summary.blockLabel}</h3>
        </div>
        {onEditBlock && (
          <button
            onClick={() => onEditBlock(summary.blockId)}
            className="flex-shrink-0 p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-2">
        {/* Completion with trend */}
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 75 ? 'bg-sage-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-neutral-500 tabular-nums">{pct}%</span>
          {previousSummary && (
            <TrendArrow current={summary.completionRate} previous={previousSummary.completionRate} />
          )}
        </div>

        {/* React emojis with counts */}
        <div className="flex items-center gap-2">
          {(Object.entries(summary.reacts) as [QuickReact, number][])
            .filter(([, count]) => count > 0)
            .map(([react, count]) => (
              <span key={react} className="flex items-center gap-0.5">
                <span className="text-sm">{QUICK_REACT_CONFIG[react].emoji}</span>
                <span className="text-[10px] text-neutral-500 tabular-nums">{count}</span>
              </span>
            ))
          }
        </div>

        {/* Instance count */}
        <span className="text-[10px] text-neutral-400">
          {summary.completedCount}/{summary.instanceCount} days
        </span>
      </div>

      {/* Tags */}
      {Object.keys(summary.tags).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {Object.entries(summary.tags)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([tag, count]) => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-neutral-100 text-[10px] text-neutral-500">
                {tag} {count > 1 && `(${count})`}
              </span>
            ))
          }
        </div>
      )}

      {/* Notes */}
      {summary.notes.length > 0 && (
        <div className="space-y-1">
          {summary.notes.slice(0, 2).map((note, i) => (
            <p key={i} className="text-[11px] text-neutral-500 italic bg-neutral-50 px-2 py-1 rounded-md truncate">
              {note}
            </p>
          ))}
          {summary.notes.length > 2 && (
            <span className="text-[10px] text-neutral-400">+{summary.notes.length - 2} more notes</span>
          )}
        </div>
      )}
    </div>
  )
}
