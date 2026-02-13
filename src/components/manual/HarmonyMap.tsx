// HarmonyMap — Overall harmony dashboard showing all 8 domain visuals in a responsive grid
// Replaces the old constellation view with domain-specific visual metaphors

import { DomainVisual } from './visuals/DomainVisual'
import { HarmonyBadge } from './HarmonyBadge'
import { DOMAIN_ORDER, DOMAIN_NAMES, isDomainAssessed } from '@/types/manual'
import type { DomainId, ManualDomains, Manual } from '@/types/manual'

interface HarmonyMapProps {
  manual: Manual
  onAssessDomain?: (domainId: DomainId) => void
}

export function HarmonyMap({ manual, onAssessDomain }: HarmonyMapProps) {
  const domains = manual.domains as ManualDomains

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {DOMAIN_ORDER.map(domainId => {
        const assessment = domains[domainId]
        const assessed = isDomainAssessed(manual, domainId)

        return (
          <button
            key={domainId}
            onClick={() => !assessed && onAssessDomain?.(domainId)}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-colors ${
              assessed
                ? 'bg-white border border-stone-100'
                : 'bg-stone-50 border border-dashed border-stone-200 hover:border-stone-300 cursor-pointer'
            }`}
          >
            <DomainVisual
              domainId={domainId}
              assessment={assessment}
              size={80}
            />
            <div className="text-center">
              <p className="text-xs font-medium text-stone-700">{DOMAIN_NAMES[domainId]}</p>
              {assessed ? (
                <HarmonyBadge score={assessment.harmonyScore} className="mt-1" />
              ) : (
                <p className="text-[10px] text-stone-400 mt-0.5">Uncharted</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
