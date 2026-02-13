// DomainCard — Structured domain assessment card with headline/summary/findings/actions
// Expandable: collapsed shows headline + harmony badge, expanded shows full findings

import { useState } from 'react'
import { HarmonyBadge } from './HarmonyBadge'
import { ActionQueue } from './ActionQueue'
import { DOMAIN_NAMES, DOMAIN_DESCRIPTIONS, getHarmonyStatus } from '@/types/manual'
import type { DomainId, DomainAssessment, FindingItem, ActionItem } from '@/types/manual'

interface DomainCardProps {
  domainId: DomainId
  assessment: DomainAssessment
  onAssess?: () => void
  onAcceptAction?: (actionId: string) => void
  onDismissAction?: (actionId: string) => void
  onAddToSymphony?: (action: ActionItem) => void
  onNavigateToItem?: (symphonyItemId: string, type: ActionItem['type']) => void
  pushing?: boolean
}

export function DomainCard({
  domainId,
  assessment,
  onAssess,
  onAcceptAction,
  onDismissAction,
  onAddToSymphony,
  onNavigateToItem,
  pushing,
}: DomainCardProps) {
  const [expanded, setExpanded] = useState(false)
  const status = getHarmonyStatus(assessment.harmonyScore)
  const isAssessed = assessment.assessmentDepth !== 'none' && !!assessment.headline

  // Border accent color by harmony status
  const borderColor = status === 'resonating' ? 'border-l-emerald-400'
    : status === 'adjusting' ? 'border-l-amber-400'
    : status === 'discordant' ? 'border-l-red-400'
    : 'border-l-stone-200'

  return (
    <div className={`border border-stone-200 border-l-[3px] ${borderColor} rounded-xl overflow-hidden bg-white`}>
      {/* Header — always visible (div instead of button to avoid nested button issue with Assess) */}
      <div
        onClick={() => isAssessed && setExpanded(!expanded)}
        role={isAssessed ? 'button' : undefined}
        tabIndex={isAssessed ? 0 : undefined}
        onKeyDown={isAssessed ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded) } } : undefined}
        className={`w-full text-left px-5 py-4 ${isAssessed ? 'hover:bg-stone-50 cursor-pointer' : 'cursor-default'} transition-colors`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <h3 className="font-medium text-stone-800">{DOMAIN_NAMES[domainId]}</h3>
              <HarmonyBadge score={assessment.harmonyScore} />
            </div>

            {isAssessed ? (
              <p className="text-sm font-display text-stone-700 line-clamp-1">
                {assessment.headline}
              </p>
            ) : (
              <p className="text-xs text-stone-400">{DOMAIN_DESCRIPTIONS[domainId]}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isAssessed && onAssess && (
              <button
                onClick={(e) => { e.stopPropagation(); onAssess() }}
                className="text-xs font-medium px-3 py-1.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                Assess
              </button>
            )}
            {isAssessed && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-5 h-5 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && isAssessed && (
        <div className="px-5 pb-5 border-t border-stone-100">
          {/* Summary */}
          {assessment.summary && (
            <p className="text-sm text-stone-600 mt-4 leading-relaxed">
              {assessment.summary}
            </p>
          )}

          {/* Strengths */}
          {(assessment.strengths?.length ?? 0) > 0 && (
            <FindingsSection
              title="Strengths"
              items={assessment.strengths}
              accentColor="emerald"
            />
          )}

          {/* Issues */}
          {(assessment.issues?.length ?? 0) > 0 && (
            <FindingsSection
              title="Needs Attention"
              items={assessment.issues}
              accentColor="amber"
            />
          )}

          {/* Opportunities */}
          {(assessment.opportunities?.length ?? 0) > 0 && (
            <FindingsSection
              title="Opportunities"
              items={assessment.opportunities}
              accentColor="blue"
            />
          )}

          {/* Actions */}
          {(assessment.actions?.length ?? 0) > 0 && (
            <div className="mt-5">
              <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">Action Items</h4>
              <ActionQueue
                actions={assessment.actions}
                onAccept={onAcceptAction}
                onDismiss={onDismissAction}
                onAddToSymphony={onAddToSymphony}
                onNavigateToItem={onNavigateToItem}
                pushing={pushing}
              />
            </div>
          )}

          {/* Footer: reassess + meta */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-stone-100">
            <div className="text-[10px] text-stone-400">
              {assessment.lastAssessedAt && (
                <span>
                  Last assessed {new Date(assessment.lastAssessedAt).toLocaleDateString()}
                  {assessment.conversationCount > 1 && ` (${assessment.conversationCount} conversations)`}
                </span>
              )}
              {assessment.assessmentDepth !== 'deep' && (
                <span className="ml-2 text-amber-500">
                  Depth: {assessment.assessmentDepth}
                </span>
              )}
            </div>
            {onAssess && (
              <button
                onClick={onAssess}
                className="text-xs flex items-center gap-1.5 px-3 py-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.28a.75.75 0 00-.75.75v3.955a.75.75 0 001.5 0v-2.134l.218.218a7 7 0 0011.712-3.138.75.75 0 00-1.449-.394zm.137-7.868a.75.75 0 00-1.5 0v2.134l-.217-.218A7 7 0 002.02 8.61a.75.75 0 001.45.394A5.5 5.5 0 0112.69 6.54l.311.31H10.57a.75.75 0 000 1.5h3.951a.75.75 0 00.75-.75V3.556z" clipRule="evenodd" />
                </svg>
                Reassess
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== FindingsSection ====================

function FindingsSection({ title, items, accentColor }: {
  title: string
  items: FindingItem[]
  accentColor: 'emerald' | 'amber' | 'blue' | 'red'
}) {
  const dotColor = accentColor === 'emerald' ? 'bg-emerald-400'
    : accentColor === 'amber' ? 'bg-amber-400'
    : accentColor === 'blue' ? 'bg-blue-400'
    : 'bg-red-400'

  const severityColors: Record<string, string> = {
    minor: 'text-stone-400',
    moderate: 'text-amber-500',
    significant: 'text-red-500',
  }

  return (
    <div className="mt-5">
      <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-start gap-2.5">
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5 shrink-0`} />
            <div>
              <span className="text-sm font-medium text-stone-700">{item.title}</span>
              {item.severity && (
                <span className={`text-[10px] ml-1.5 ${severityColors[item.severity]}`}>
                  ({item.severity})
                </span>
              )}
              {item.detail && (
                <p className="text-xs text-stone-500 mt-0.5">{item.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
