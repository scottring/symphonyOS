import type { Entry, MilestoneContent } from '@/types/entry'

interface Props {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full' | 'yearbook'
}

export function MilestoneRenderer({ entry, onUpdate }: Props) {
  const c = entry.content as MilestoneContent
  const isAchieved = !!c.achievedDate

  const handleAchieve = () => {
    if (!onUpdate) return
    onUpdate({
      content: {
        ...c,
        achievedDate: isAchieved ? undefined : new Date().toISOString(),
      },
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
          isAchieved ? 'bg-yellow-400' : 'border-2 border-stone-200'
        }`}>
          {isAchieved && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          )}
        </div>
        <div>
          <p className={`text-sm ${isAchieved ? 'text-stone-800 font-medium' : 'text-stone-600'}`}>
            {c.description}
          </p>
          {isAchieved && c.achievedDate && (
            <p className="text-xs text-emerald-600 mt-0.5">
              Achieved {new Date(c.achievedDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>

      {c.celebrationNote && (
        <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
          <p className="text-sm text-yellow-800">{c.celebrationNote}</p>
        </div>
      )}

      {onUpdate && !isAchieved && (
        <button
          onClick={handleAchieve}
          className="text-xs px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors"
        >
          Mark as achieved
        </button>
      )}
    </div>
  )
}
