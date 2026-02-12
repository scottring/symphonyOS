// DriftSignalBanner — Ambient notification for unacknowledged drift signals

import type { DriftSignal } from '@/types/checkin'
import { DOMAIN_NAMES } from '@/types/manual'

interface DriftSignalBannerProps {
  signals: DriftSignal[]
  onDismiss?: (signalId: string) => void
}

export function DriftSignalBanner({ signals, onDismiss }: DriftSignalBannerProps) {
  if (signals.length === 0) return null

  return (
    <div className="space-y-2">
      {signals.map(signal => (
        <div
          key={signal.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
            signal.severity === 'notable'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-stone-50 border-stone-200'
          }`}
        >
          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
            signal.severity === 'notable' ? 'bg-amber-400' : 'bg-stone-300'
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-stone-700">{signal.description}</p>
            <p className="text-xs text-stone-400 mt-0.5">{DOMAIN_NAMES[signal.domain]}</p>
          </div>
          {onDismiss && (
            <button
              onClick={() => onDismiss(signal.id)}
              className="text-stone-400 hover:text-stone-600 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
