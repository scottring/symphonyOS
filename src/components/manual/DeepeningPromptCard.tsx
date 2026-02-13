// DeepeningPromptCard — Gentle prompt to deepen a specific manual domain
// Used in home/bookshelf and manual view to encourage modular deepening

import { DOMAIN_DESCRIPTIONS } from '@/types/manual'
import type { DomainId, IndividualDomainId } from '@/types/manual'
import { DOMAIN_COLORS } from '@/components/onboarding/relish/ConstellationMap'

type PromptType = 'empty' | 'stale' | 'deepen'

interface DeepeningPromptCardProps {
  domainId: DomainId | IndividualDomainId
  domainName: string
  promptType: PromptType
  personName?: string
  onStart: () => void
  onDismiss?: () => void
  className?: string
}

const PROMPT_COPY: Record<PromptType, { heading: string; cta: string }> = {
  empty: {
    heading: 'hasn\'t been explored yet',
    cta: 'Start a quick conversation',
  },
  stale: {
    heading: 'could use a refresh',
    cta: 'Update in 3 minutes',
  },
  deepen: {
    heading: 'has more to uncover',
    cta: 'Dig a little deeper',
  },
}

export function DeepeningPromptCard({
  domainId,
  domainName,
  promptType,
  personName,
  onStart,
  onDismiss,
  className = '',
}: DeepeningPromptCardProps) {
  const copy = PROMPT_COPY[promptType]
  const color = (DOMAIN_COLORS as Record<string, string>)[domainId] ?? '#57534e'
  const description = (DOMAIN_DESCRIPTIONS as Record<string, string>)[domainId] ?? ''

  return (
    <div
      className={`relative rounded-xl border border-stone-200/80 bg-white/60 backdrop-blur-sm px-5 py-4 ${className}`}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-stone-300 hover:text-stone-500 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      <p className="text-sm text-stone-800">
        {personName ? (
          <><span className="font-medium">{personName}'s {domainName.toLowerCase()}</span> {copy.heading}.</>
        ) : (
          <><span className="font-medium">{domainName}</span> {copy.heading}.</>
        )}
      </p>

      {description && (
        <p className="text-xs text-stone-400 mt-1">{description}</p>
      )}

      <button
        onClick={onStart}
        className="mt-3 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        style={{ backgroundColor: `${color}10`, color }}
      >
        {copy.cta}
      </button>
    </div>
  )
}

// Helper: pick the most actionable domain to suggest deepening
export function pickDeepeningTarget(
  domains: Record<string, unknown>,
  domainOrder: readonly string[],
  domainMeta?: Record<string, { updated_at?: string }>,
): { domainId: string; promptType: PromptType } | null {
  const isDomainEmpty = (data: unknown): boolean => {
    if (!data) return true
    if (typeof data !== 'object' || data === null) return false
    return Object.values(data as Record<string, unknown>).every(v => {
      if (Array.isArray(v)) return v.length === 0
      if (typeof v === 'string') return !v
      return !v
    })
  }

  // Priority 1: Find an empty domain
  for (const id of domainOrder) {
    if (isDomainEmpty((domains as Record<string, unknown>)[id])) {
      return { domainId: id, promptType: 'empty' }
    }
  }

  // Priority 2: Find a stale domain (>30 days since update)
  if (domainMeta) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    for (const id of domainOrder) {
      const meta = domainMeta[id]
      if (meta?.updated_at && new Date(meta.updated_at).getTime() < thirtyDaysAgo) {
        return { domainId: id, promptType: 'stale' }
      }
    }
  }

  return null
}
