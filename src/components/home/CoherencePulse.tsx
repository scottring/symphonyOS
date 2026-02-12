// CoherencePulse — 8-dot domain freshness indicator
// Shows at-a-glance coherence health from the family manual

import type { Manual, DomainId } from '@/types/manual'
import { DOMAIN_ORDER, DOMAIN_NAMES, getDomainAge, getDomainFreshnessLabel } from '@/types/manual'

interface CoherencePulseProps {
  manual: Manual | null
  compact?: boolean
}

export function CoherencePulse({ manual, compact }: CoherencePulseProps) {
  if (!manual) {
    return (
      <div className="flex items-center gap-1.5">
        {DOMAIN_ORDER.map(d => (
          <div key={d} className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        ))}
        {!compact && <span className="text-xs text-neutral-400 ml-1">No manual yet</span>}
      </div>
    )
  }

  const freshCount = DOMAIN_ORDER.filter(d => {
    const age = getDomainAge(manual, d)
    return getDomainFreshnessLabel(age) === 'fresh'
  }).length

  return (
    <div className="flex items-center gap-1.5">
      {DOMAIN_ORDER.map((domainId: DomainId) => {
        const age = getDomainAge(manual, domainId)
        const freshness = getDomainFreshnessLabel(age)

        const dotColor =
          freshness === 'fresh' ? 'bg-primary-500'
          : freshness === 'aging' ? 'bg-amber-400'
          : 'bg-red-400'

        return (
          <div
            key={domainId}
            className={`w-1.5 h-1.5 rounded-full ${dotColor} transition-colors`}
            title={`${DOMAIN_NAMES[domainId]}: ${freshness}`}
          />
        )
      })}
      {!compact && (
        <span className="text-xs text-neutral-500 ml-1.5 tabular-nums">
          {freshCount}/{DOMAIN_ORDER.length} fresh
        </span>
      )}
    </div>
  )
}
