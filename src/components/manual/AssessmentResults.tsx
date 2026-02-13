// AssessmentResults — Post-conversation screen showing assessment findings
// Displayed after completing a domain assessment conversation, before saving

import { HarmonyBadge } from './HarmonyBadge'
import { ActionQueue } from './ActionQueue'
import { DOMAIN_NAMES } from '@/types/manual'
import type { DomainId, DomainAssessment } from '@/types/manual'

interface AssessmentResultsProps {
  domainId: DomainId
  assessment: DomainAssessment
  onSave: () => void
  onBack: () => void
  onAcceptAction?: (actionId: string) => void
  onDismissAction?: (actionId: string) => void
  saving?: boolean
}

export function AssessmentResults({
  domainId,
  assessment,
  onSave,
  onBack,
  onAcceptAction,
  onDismissAction,
  saving = false,
}: AssessmentResultsProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-lg font-semibold text-stone-900">
              {DOMAIN_NAMES[domainId]}
            </h2>
            <HarmonyBadge score={assessment.harmonyScore} />
          </div>
          {assessment.headline && (
            <p className="text-base font-display text-stone-700">
              {assessment.headline}
            </p>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Summary */}
          {assessment.summary && (
            <p className="text-sm text-stone-600 leading-relaxed">
              {assessment.summary}
            </p>
          )}

          {/* Strengths */}
          {assessment.strengths.length > 0 && (
            <FindingsBlock
              title="Strengths"
              items={assessment.strengths}
              icon={
                <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              }
              bgColor="bg-emerald-50"
              borderColor="border-emerald-200"
            />
          )}

          {/* Issues */}
          {assessment.issues.length > 0 && (
            <FindingsBlock
              title="Needs Attention"
              items={assessment.issues}
              icon={
                <svg className="w-4 h-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              }
              bgColor="bg-amber-50"
              borderColor="border-amber-200"
            />
          )}

          {/* Opportunities */}
          {assessment.opportunities.length > 0 && (
            <FindingsBlock
              title="Opportunities"
              items={assessment.opportunities}
              icon={
                <svg className="w-4 h-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.044a2 2 0 002 2h0a2 2 0 002-2v-.044c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.5 18a1.5 1.5 0 003 0h-3z" />
                </svg>
              }
              bgColor="bg-blue-50"
              borderColor="border-blue-200"
            />
          )}

          {/* Actions */}
          {assessment.actions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-stone-800 mb-3">
                Suggested Actions ({assessment.actions.length})
              </h3>
              <ActionQueue
                actions={assessment.actions}
                onAccept={onAcceptAction}
                onDismiss={onDismissAction}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-100 flex justify-between">
          <button
            onClick={onBack}
            className="text-sm px-4 py-2 text-stone-500 hover:text-stone-700 transition-colors"
          >
            Back to conversation
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="text-sm font-medium px-6 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save & Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== FindingsBlock ====================

function FindingsBlock({ title, items, icon, bgColor, borderColor }: {
  title: string
  items: { id: string; title: string; detail: string; severity?: string }[]
  icon: React.ReactNode
  bgColor: string
  borderColor: string
}) {
  return (
    <div className={`rounded-xl ${bgColor} border ${borderColor} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-medium text-stone-800">{title}</h3>
        <span className="text-xs text-stone-400">({items.length})</span>
      </div>
      <div className="space-y-2.5">
        {items.map(item => (
          <div key={item.id}>
            <p className="text-sm font-medium text-stone-700">{item.title}</p>
            {item.detail && (
              <p className="text-xs text-stone-500 mt-0.5">{item.detail}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
