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
  // Joint review
  overlappingDomains?: DomainId[]
  onStartJointReview?: (domainIds: DomainId[]) => void
}

export function DomainPicker({
  manual,
  assessedDomains,
  onSelectDomain,
  onLaunch,
  overlappingDomains = [],
  onStartJointReview,
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

        {/* Joint review banner — when both partners have overlapping domains */}
        {overlappingDomains.length >= 2 && onStartJointReview && (
          <button
            onClick={() => onStartJointReview(overlappingDomains)}
            className="w-full mb-6 px-5 py-4 rounded-xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 text-left transition-all hover:shadow-md hover:border-amber-300 group"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-1.053M18 10.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900 mb-1">
                  Joint Review Available
                </p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  You and your partner have both assessed {overlappingDomains.length} domain{overlappingDomains.length > 1 ? 's' : ''}.
                  Sit down together and let the AI surface where you agree, where you differ, and help you build a shared picture.
                </p>
                <p className="text-xs font-medium text-amber-600 mt-2 group-hover:text-amber-800 transition-colors">
                  Start joint review →
                </p>
              </div>
            </div>
          </button>
        )}

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
