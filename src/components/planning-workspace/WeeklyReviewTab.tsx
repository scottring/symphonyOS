import { useState, useMemo } from 'react'
import type { PlaybookBlock, CreateBlockInput, UpdateBlockInput, FamilyRule, BlockType, DayType } from '@/types/playbook'
import { BLOCK_TYPE_CONFIG } from '@/types/playbook'
import type { BlockFeedbackSummary, WeeklyStats as WeeklyStatsType } from '@/hooks/useWeeklyFeedback'
import type { AISuggestion, AIPlaybookResult } from '@/hooks/useAIPlaybookSuggestions'
import { BlockFeedbackCard } from './BlockFeedbackCard'
import { WeeklyStats } from './WeeklyStats'
import { BlockEditor } from '../playbook/BlockEditor'

interface WeeklyReviewTabProps {
  // Feedback data
  blockSummaries: BlockFeedbackSummary[]
  overallStats: WeeklyStatsType
  flaggedBlocks: BlockFeedbackSummary[]
  feedbackLoading: boolean
  weekOf: string
  onWeekChange: (weekOf: string) => void
  // Block management
  blocks: PlaybookBlock[]
  onAddBlock: (input: CreateBlockInput) => Promise<PlaybookBlock | null>
  onUpdateBlock: (id: string, updates: UpdateBlockInput) => Promise<void>
  onDeleteBlock: (id: string) => Promise<void>
  onReorderBlocks: (blockIds: string[]) => Promise<void>
  // Rules (for the rules check section)
  rules: FamilyRule[]
  // AI suggestions
  aiResult: AIPlaybookResult | null
  aiLoading: boolean
  aiError: string | null
  onGenerateAI: (weekOf: string) => void
  onAcceptSuggestion: (index: number) => void
  onRejectSuggestion: (index: number) => void
}

type Section = 'review' | 'ai' | 'next-week' | 'rules'

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function formatWeekLabel(weekOf: string): string {
  const start = new Date(weekOf + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function shiftWeek(weekOf: string, delta: number): string {
  const d = new Date(weekOf + 'T00:00:00')
  d.setDate(d.getDate() + delta * 7)
  return d.toISOString().split('T')[0]
}

function SuggestionCard({
  suggestion,
  index,
  onAccept,
  onReject,
  onApply,
}: {
  suggestion: AISuggestion
  index: number
  onAccept: (i: number) => void
  onReject: (i: number) => void
  onApply: (s: AISuggestion) => void
}) {
  const typeColors = {
    modify: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', label: 'Modify' },
    add: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', label: 'New Block' },
    remove: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', label: 'Remove' },
  }
  const tc = typeColors[suggestion.type]
  const config = BLOCK_TYPE_CONFIG[suggestion.blockType as BlockType]

  if (suggestion.status !== 'pending') {
    return (
      <div className={`rounded-lg border px-3 py-2 ${suggestion.status === 'accepted' ? 'border-green-200 bg-green-50/30' : 'border-neutral-200 bg-neutral-50 opacity-60'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600">{suggestion.label}</span>
          <span className={`text-[10px] font-medium ${suggestion.status === 'accepted' ? 'text-green-600' : 'text-neutral-400'}`}>
            {suggestion.status === 'accepted' ? 'Accepted' : 'Dismissed'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border ${tc.border} ${tc.bg} p-3 space-y-2`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${tc.text} bg-white/60`}>
            {tc.label}
          </span>
          {config && (
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${config.bgColor} ${config.color}`}>
              {config.label}
            </span>
          )}
        </div>
      </div>

      {/* Label and time */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-800">{suggestion.label}</h4>
        {suggestion.timeSlot && (
          <span className="text-[11px] text-neutral-500">{suggestion.timeSlot}</span>
        )}
      </div>

      {/* Narrative preview */}
      {suggestion.narrative && (
        <p className="text-[12px] text-neutral-600 leading-relaxed line-clamp-3">{suggestion.narrative}</p>
      )}

      {/* Reason */}
      <p className="text-[11px] text-neutral-500 italic">{suggestion.reason}</p>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { onAccept(index); onApply(suggestion) }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition-colors"
        >
          Accept
        </button>
        <button
          onClick={() => onReject(index)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-neutral-300 text-neutral-500 text-xs font-medium hover:bg-neutral-50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export function WeeklyReviewTab({
  blockSummaries,
  overallStats,
  flaggedBlocks,
  feedbackLoading,
  weekOf,
  onWeekChange,
  blocks,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onReorderBlocks: _onReorderBlocks,
  rules,
  aiResult,
  aiLoading,
  aiError,
  onGenerateAI,
  onAcceptSuggestion,
  onRejectSuggestion,
}: WeeklyReviewTabProps) {
  const [expandedSection, setExpandedSection] = useState<Section>('review')
  const [editingBlock, setEditingBlock] = useState<PlaybookBlock | null>(null)
  const [showNewBlockEditor, setShowNewBlockEditor] = useState(false)

  const thisMonday = getMonday(new Date())
  const isCurrentWeek = weekOf === thisMonday
  const isPastWeek = weekOf < thisMonday

  const activeRules = useMemo(() => rules.filter(r => r.status === 'active'), [rules])
  const pendingSuggestions = useMemo(() => aiResult?.suggestions.filter(s => s.status === 'pending') || [], [aiResult])
  const pendingCount = pendingSuggestions.length

  // Sort block summaries: flagged first, then by completion rate
  const sortedSummaries = useMemo(() => {
    return [...blockSummaries].sort((a, b) => {
      if (a.flagged && !b.flagged) return -1
      if (!a.flagged && b.flagged) return 1
      return a.completionRate - b.completionRate
    })
  }, [blockSummaries])

  const handleEditBlockFromFeedback = (blockId: string) => {
    const block = blocks.find(b => b.id === blockId)
    if (block) setEditingBlock(block)
  }

  const handleSaveBlock = async (input: CreateBlockInput | { id: string; updates: UpdateBlockInput }) => {
    if ('id' in input) {
      await onUpdateBlock(input.id, input.updates)
    } else {
      await onAddBlock(input)
    }
    setEditingBlock(null)
    setShowNewBlockEditor(false)
  }

  const handleDeleteBlock = async (id: string) => {
    await onDeleteBlock(id)
    setEditingBlock(null)
  }

  // Apply an accepted AI suggestion
  const handleApplySuggestion = async (suggestion: AISuggestion) => {
    if (suggestion.type === 'add') {
      await onAddBlock({
        timeSlot: suggestion.timeSlot || '12:00',
        label: suggestion.label,
        blockType: (suggestion.blockType as BlockType) || 'routine',
        narrative: suggestion.narrative || '',
        coachingNote: suggestion.coachingNote || null,
        items: (suggestion.items || []).map(item => ({
          who: item.who,
          action: item.action,
          context: item.context,
          coaching: item.coaching,
        })),
        dayTypes: (suggestion.dayTypes as DayType[]) || ['school-day'],
      })
    } else if (suggestion.type === 'modify' && suggestion.blockId) {
      const updates: UpdateBlockInput = {}
      if (suggestion.narrative) updates.narrative = suggestion.narrative
      if (suggestion.coachingNote) updates.coachingNote = suggestion.coachingNote
      if (suggestion.label) updates.label = suggestion.label
      if (suggestion.timeSlot) updates.timeSlot = suggestion.timeSlot
      if (suggestion.blockType) updates.blockType = suggestion.blockType as BlockType
      if (suggestion.items) {
        updates.items = suggestion.items.map((item, i) => ({
          id: `ai-item-${Date.now()}-${i}`,
          who: item.who,
          action: item.action,
          context: item.context,
          coaching: item.coaching,
        }))
      }
      if (suggestion.dayTypes) updates.dayTypes = suggestion.dayTypes as DayType[]
      await onUpdateBlock(suggestion.blockId, updates)
    } else if (suggestion.type === 'remove' && suggestion.blockId) {
      await onDeleteBlock(suggestion.blockId)
    }
  }

  const toggleSection = (section: Section) => {
    setExpandedSection(expandedSection === section ? 'review' : section)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-4 space-y-4">
        {/* Week picker */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onWeekChange(shiftWeek(weekOf, -1))}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="text-center">
            <span className="text-sm font-medium text-neutral-700">{formatWeekLabel(weekOf)}</span>
            {isCurrentWeek && <span className="ml-2 px-2 py-0.5 rounded-full bg-sage-100 text-sage-700 text-[10px] font-medium">This week</span>}
          </div>
          <button
            onClick={() => onWeekChange(shiftWeek(weekOf, 1))}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Section 1: Week in Review */}
        <div className="rounded-xl border border-neutral-200/60 overflow-hidden">
          <button
            onClick={() => toggleSection('review')}
            className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50/50 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-neutral-700">Week in Review</span>
              {flaggedBlocks.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-medium">
                  {flaggedBlocks.length} flagged
                </span>
              )}
            </div>
            <svg className={`w-4 h-4 text-neutral-400 transition-transform ${expandedSection === 'review' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {expandedSection === 'review' && (
            <div className="p-4 space-y-3">
              {feedbackLoading ? (
                <div className="py-8 text-center">
                  <div className="inline-block w-5 h-5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-neutral-400 mt-2">Loading feedback...</p>
                </div>
              ) : blockSummaries.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-neutral-500">No playbook data for this week yet.</p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {isPastWeek ? 'No blocks were used this week.' : 'Complete some playbook blocks to see feedback here.'}
                  </p>
                </div>
              ) : (
                <>
                  <WeeklyStats stats={overallStats} />
                  <div className="space-y-2">
                    {sortedSummaries.map(summary => (
                      <BlockFeedbackCard
                        key={summary.blockId}
                        summary={summary}
                        onEditBlock={handleEditBlockFromFeedback}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Section 2: AI Coaching Suggestions */}
        <div className="rounded-xl border border-amber-200/60 overflow-hidden">
          <button
            onClick={() => toggleSection('ai')}
            className="w-full flex items-center justify-between px-4 py-3 bg-amber-50/30 hover:bg-amber-50/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-neutral-700">AI Coach</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
                  {pendingCount} suggestions
                </span>
              )}
            </div>
            <svg className={`w-4 h-4 text-neutral-400 transition-transform ${expandedSection === 'ai' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {expandedSection === 'ai' && (
            <div className="p-4 space-y-3">
              {/* Coaching insights */}
              {aiResult?.coachingInsights && (
                <div className="px-3 py-2.5 rounded-xl bg-amber-50/50 border border-amber-100">
                  {aiResult.weeklyTheme && (
                    <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">{aiResult.weeklyTheme}</p>
                  )}
                  <p className="text-[12px] text-neutral-600 leading-relaxed">{aiResult.coachingInsights}</p>
                </div>
              )}

              {/* Quick actions for pending suggestions */}
              {pendingCount >= 2 && (
                <div className="flex gap-2 pb-1">
                  <button
                    onClick={() => {
                      pendingSuggestions.forEach((s) => {
                        const realIndex = aiResult!.suggestions.indexOf(s)
                        onAcceptSuggestion(realIndex)
                        handleApplySuggestion(s)
                      })
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition-colors"
                  >
                    Accept all ({pendingCount})
                  </button>
                  <button
                    onClick={() => {
                      pendingSuggestions.forEach((s) => {
                        const realIndex = aiResult!.suggestions.indexOf(s)
                        onRejectSuggestion(realIndex)
                      })
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 text-neutral-500 text-xs font-medium hover:bg-neutral-50 transition-colors"
                  >
                    Dismiss all
                  </button>
                </div>
              )}

              {/* Suggestion cards */}
              {aiResult?.suggestions.map((suggestion, i) => (
                <SuggestionCard
                  key={i}
                  suggestion={suggestion}
                  index={i}
                  onAccept={onAcceptSuggestion}
                  onReject={onRejectSuggestion}
                  onApply={handleApplySuggestion}
                />
              ))}

              {/* Generate / regenerate button */}
              {aiLoading ? (
                <div className="py-6 text-center">
                  <div className="inline-block w-5 h-5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-neutral-400 mt-2">Analyzing your week and generating suggestions...</p>
                </div>
              ) : aiError ? (
                <div className="py-4 text-center">
                  <p className="text-xs text-red-500 mb-2">{aiError}</p>
                  <button
                    onClick={() => onGenerateAI(weekOf)}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                  >
                    Try again
                  </button>
                </div>
              ) : !aiResult ? (
                <button
                  onClick={() => onGenerateAI(weekOf)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-amber-300 text-sm text-amber-600 hover:bg-amber-50/30 hover:border-amber-400 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  Generate AI suggestions for this week
                </button>
              ) : (
                <button
                  onClick={() => onGenerateAI(weekOf)}
                  className="w-full text-center text-[11px] text-amber-500 hover:text-amber-600 py-2"
                >
                  Regenerate suggestions
                </button>
              )}
            </div>
          )}
        </div>

        {/* Section 3: Next Week's Playbook */}
        <div className="rounded-xl border border-neutral-200/60 overflow-hidden">
          <button
            onClick={() => toggleSection('next-week')}
            className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50/50 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-sage-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-neutral-700">Next Week's Playbook</span>
              <span className="text-[10px] text-neutral-400">{blocks.length} blocks</span>
            </div>
            <svg className={`w-4 h-4 text-neutral-400 transition-transform ${expandedSection === 'next-week' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {expandedSection === 'next-week' && (
            <div className="p-4 space-y-2">
              {blocks.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-4">No blocks yet. Add your first block to get started.</p>
              ) : (
                blocks.map(block => (
                  <button
                    key={block.id}
                    onClick={() => setEditingBlock(block)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-neutral-200/60 hover:bg-neutral-50 transition-colors text-left"
                  >
                    <span className="text-xs text-neutral-400 tabular-nums w-14 flex-shrink-0">{block.timeSlot.split('-')[0]}</span>
                    <span className="text-sm text-neutral-700 flex-1 truncate">{block.label}</span>
                    <div className="flex gap-1">
                      {block.dayTypes.map(dt => (
                        <span key={dt} className="px-1.5 py-0.5 rounded bg-neutral-100 text-[9px] text-neutral-400">{dt}</span>
                      ))}
                    </div>
                    <svg className="w-3.5 h-3.5 text-neutral-300 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                ))
              )}
              <button
                onClick={() => setShowNewBlockEditor(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50/30 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add block
              </button>
            </div>
          )}
        </div>

        {/* Section 4: Rules & Responsibilities Check */}
        <div className="rounded-xl border border-neutral-200/60 overflow-hidden">
          <button
            onClick={() => toggleSection('rules')}
            className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50/50 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM4 4h3a3 3 0 006 0h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm2.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm2.45 4a2.5 2.5 0 10-4.9 0h4.9zM12 9a1 1 0 100 2h3a1 1 0 100-2h-3zm-1 4a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-neutral-700">Rules Check</span>
              <span className="text-[10px] text-neutral-400">{activeRules.length} active</span>
            </div>
            <svg className={`w-4 h-4 text-neutral-400 transition-transform ${expandedSection === 'rules' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {expandedSection === 'rules' && (
            <div className="p-4">
              {activeRules.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-4">No active rules. Draft rules in the Research tab and publish them.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-neutral-500 italic mb-3">Review these with the family: "Do any feel unfair? Any new situations?"</p>
                  {activeRules.map(rule => (
                    <div key={rule.id} className="px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200/60">
                      <p className="text-sm text-neutral-700">{rule.rule}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {rule.appliesTo.map(who => (
                          <span key={who} className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] capitalize">{who}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Block editor modal */}
      {(editingBlock || showNewBlockEditor) && (
        <BlockEditor
          block={editingBlock}
          onSave={handleSaveBlock}
          onDelete={handleDeleteBlock}
          onClose={() => { setEditingBlock(null); setShowNewBlockEditor(false) }}
        />
      )}
    </div>
  )
}
