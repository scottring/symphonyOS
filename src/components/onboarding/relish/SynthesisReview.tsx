import type { OnboardingPhaseId } from '@/types/manual'
import { PHASE_NAMES, DOMAIN_NAMES, PHASE_DOMAINS } from '@/types/manual'
import { DomainDataView } from '@/components/manual/DomainDataView'
import { EntryPreview } from './EntryPreview'

interface SynthesisReviewProps {
  phaseId: OnboardingPhaseId
  summary: string
  structuredData: Record<string, unknown>
  onApprove: (editedData?: Record<string, unknown>) => void
  isLoading?: boolean
}

export function SynthesisReview({
  phaseId,
  summary,
  structuredData,
  onApprove,
  isLoading,
}: SynthesisReviewProps) {
  const [domain1, domain2] = PHASE_DOMAINS[phaseId]

  const handleApprove = () => {
    onApprove(undefined)
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h3 className="text-sm font-medium text-stone-400 uppercase tracking-wider mb-2">
          What I heard &mdash; {PHASE_NAMES[phaseId]}
        </h3>
        <p className="text-stone-700 leading-relaxed">{summary}</p>
      </div>

      {/* Domain 1 */}
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h3 className="text-sm font-medium text-stone-400 uppercase tracking-wider mb-4">
          {DOMAIN_NAMES[domain1]}
        </h3>
        <DomainDataView domainId={domain1} data={(structuredData[domain1] as Record<string, unknown>) || {}} />
      </div>

      {/* Domain 2 */}
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h3 className="text-sm font-medium text-stone-400 uppercase tracking-wider mb-4">
          {DOMAIN_NAMES[domain2]}
        </h3>
        <DomainDataView domainId={domain2} data={(structuredData[domain2] as Record<string, unknown>) || {}} />
      </div>

      {/* Entry previews — the "so what" moment */}
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <EntryPreview phaseId={phaseId} structuredData={structuredData} />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={isLoading}
          className="flex-1 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 disabled:opacity-50 font-medium"
        >
          {isLoading ? 'Saving...' : 'This looks right'}
        </button>
      </div>
    </div>
  )
}
