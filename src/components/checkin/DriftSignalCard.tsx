// DriftSignalCard — Displays a drift signal with acknowledge action

import { DOMAIN_NAMES } from '@/types/manual'
import type { DriftSignal } from '@/types/checkin'

interface DriftSignalCardProps {
  signal: DriftSignal
  onAcknowledge: (signalId: string) => void
}

export function DriftSignalCard({ signal, onAcknowledge }: DriftSignalCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${
      signal.severity === 'notable'
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              signal.severity === 'notable'
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {signal.severity === 'notable' ? 'Needs attention' : 'Worth watching'}
            </span>
            <span className="text-[10px] text-stone-400">
              {DOMAIN_NAMES[signal.domain]}
            </span>
          </div>
          <p className={`text-sm ${
            signal.severity === 'notable' ? 'text-red-800' : 'text-amber-800'
          }`}>
            {signal.description}
          </p>
        </div>
        <button
          onClick={() => onAcknowledge(signal.id)}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-white/60 hover:bg-white text-stone-600 shrink-0 transition-colors"
        >
          Acknowledge
        </button>
      </div>
    </div>
  )
}
