// DomainPicker — Choose which domain to assess next during onboarding
// Shows all 8 domains with assessed/uncharted status and "Start here" recommendations

import { HarmonyBadge } from '@/components/manual/HarmonyBadge'
import {
  DOMAIN_ORDER, DOMAIN_NAMES, DOMAIN_DESCRIPTIONS,
} from '@/types/manual'
import type { DomainId, Manual, ManualDomains } from '@/types/manual'

// Recommended first domains (high-impact, sets context for others)
const RECOMMENDED_ORDER: DomainId[] = ['values', 'roles', 'organization']

interface DomainPickerProps {
  manual: Manual | null
  assessedDomains: DomainId[]
  onSelectDomain: (domainId: DomainId) => void
  onLaunch: () => void
}

export function DomainPicker({
  manual,
  assessedDomains,
  onSelectDomain,
  onLaunch,
}: DomainPickerProps) {
  const canLaunch = assessedDomains.length >= 3
  const domains = manual?.domains as ManualDomains | undefined

  // Find best recommended domain to start with
  const getRecommendation = (): DomainId | null => {
    for (const id of RECOMMENDED_ORDER) {
      if (!assessedDomains.includes(id)) return id
    }
    // Fall back to any unassessed domain
    return DOMAIN_ORDER.find(id => !assessedDomains.includes(id)) ?? null
  }

  const recommendation = getRecommendation()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="animate-fade-in-up flex flex-col items-center text-center max-w-lg w-full">
        <h2 className="font-display text-2xl font-semibold text-stone-900 mb-2">
          {assessedDomains.length === 0
            ? 'Choose your first domain'
            : assessedDomains.length < 3
              ? 'Keep going'
              : 'Looking good'}
        </h2>
        <p className="text-stone-500 leading-relaxed mb-2">
          {assessedDomains.length === 0
            ? "Each conversation maps one area of your family's life. Start wherever feels most relevant."
            : assessedDomains.length < 3
              ? `${3 - assessedDomains.length} more to unlock your manual. Pick what matters most.`
              : "You've covered enough to bring your manual to life. Keep going or jump in."}
        </p>
        <p className="text-xs text-stone-400 mb-8">
          {assessedDomains.length} of 8 assessed — each takes about 5 minutes
        </p>

        {/* Domain grid */}
        <div className="space-y-2 w-full mb-8">
          {DOMAIN_ORDER.map(domainId => {
            const isAssessed = assessedDomains.includes(domainId)
            const isRecommended = domainId === recommendation
            const assessment = domains?.[domainId]
            const score = assessment?.harmonyScore ?? 0

            return (
              <button
                key={domainId}
                onClick={() => onSelectDomain(domainId)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                  isAssessed
                    ? 'border-stone-200 bg-stone-50/50 hover:bg-stone-100/50'
                    : isRecommended
                      ? 'border-stone-300 bg-white shadow-sm hover:shadow-md'
                      : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                {/* Status indicator */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isAssessed ? 'bg-emerald-100' : 'bg-stone-100'
                }`}>
                  {isAssessed ? (
                    <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="text-xs font-medium text-stone-400">
                      {DOMAIN_ORDER.indexOf(domainId) + 1}
                    </span>
                  )}
                </div>

                {/* Domain info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${isAssessed ? 'text-stone-600' : 'text-stone-800'}`}>
                      {DOMAIN_NAMES[domainId]}
                    </p>
                    {isAssessed && <HarmonyBadge score={score} />}
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {isAssessed
                      ? (assessment?.headline || DOMAIN_DESCRIPTIONS[domainId])
                      : DOMAIN_DESCRIPTIONS[domainId]}
                  </p>
                </div>

                {/* Right action */}
                <div className="shrink-0">
                  {isRecommended && !isAssessed && (
                    <span className="text-xs font-medium text-stone-500 px-2 py-1 bg-stone-100 rounded-lg">
                      Start here
                    </span>
                  )}
                  {isAssessed && (
                    <span className="text-xs text-stone-400">
                      Reassess
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Launch button */}
        {canLaunch && (
          <button
            onClick={onLaunch}
            className="w-full py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 font-medium mb-3"
          >
            Enter the app
          </button>
        )}

        {!canLaunch && assessedDomains.length > 0 && (
          <p className="text-xs text-stone-400">
            Assess {3 - assessedDomains.length} more domain{3 - assessedDomains.length > 1 ? 's' : ''} to unlock launch
          </p>
        )}
      </div>
    </div>
  )
}
