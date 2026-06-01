import type { SystemHealthMetrics } from '@/hooks/useSystemHealth'

const LABEL: Record<SystemHealthMetrics['healthColor'], string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  needsAttention: 'Needs attention',
}

const DOT: Record<SystemHealthMetrics['healthColor'], string> = {
  excellent: 'bg-primary-500',
  good: 'bg-sage-500',
  fair: 'bg-amber-500',
  needsAttention: 'bg-orange-500',
}

/** Compact Clarity readout for the sidebar (moved out of the Today stats row). */
export function SidebarClarity({ healthColor }: { healthColor: SystemHealthMetrics['healthColor'] }) {
  return (
    <div className="px-5 pb-3 flex items-center gap-2 text-[13px]">
      <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[healthColor]}`} />
      <span className="text-neutral-500">Clarity</span>
      <span className="text-neutral-700 font-medium">{LABEL[healthColor]}</span>
    </div>
  )
}
