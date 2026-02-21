import { useCallback, useMemo } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { PlaybookBlock, CreateBlockInput, UpdateBlockInput, DayType } from '@/types/playbook'
import type { CoachingMatch } from '@/lib/coachingMatcher'
import { useCoachingInjection } from '@/hooks/useCoachingInjection'
import { getItemSourceId, getItemType, formatTimeSlot, inferBlockType } from '@/lib/coachingInjectionUtils'
import { BlockPreviewCard } from './BlockPreviewCard'
import { InlineChatThread } from './InlineChatThread'

interface CoachingActionsSectionProps {
  item: TimelineItem
  matches: CoachingMatch[]
  blocks: PlaybookBlock[]
  onAddBlock: (input: CreateBlockInput) => Promise<PlaybookBlock | null>
  onUpdateBlock: (id: string, updates: UpdateBlockInput) => Promise<void>
  onOpenBlockEditor: (prefill: Partial<PlaybookBlock>) => void
  hideCoaching?: boolean
}

export function CoachingActionsSection({
  item,
  matches,
  blocks,
  onAddBlock,
  onUpdateBlock,
  onOpenBlockEditor,
  hideCoaching,
}: CoachingActionsSectionProps) {
  const injection = useCoachingInjection()

  // Check if there's already a linked coaching block for this item
  const existingBlock = useMemo(() => {
    const itemType = getItemType(item)
    const itemId = getItemSourceId(item)
    return blocks.find(b =>
      b.sourceItemRef?.type === itemType && b.sourceItemRef?.id === itemId
    ) ?? null
  }, [item, blocks])

  const handleAutoGenerate = useCallback(() => {
    injection.autoGenerate(
      item,
      matches,
      existingBlock ? { id: existingBlock.id, label: existingBlock.label, narrative: existingBlock.narrative, items: existingBlock.items } : null,
    )
  }, [injection, item, matches, existingBlock])

  const handleChatStart = useCallback(() => {
    injection.chatStart(item, matches)
  }, [injection, item, matches])

  const handleChatRespond = useCallback((message: string) => {
    injection.chatRespond(message, item, matches)
  }, [injection, item, matches])

  const handleChatFinish = useCallback(() => {
    injection.chatFinish(item, matches)
  }, [injection, item, matches])

  const handleRefine = useCallback(() => {
    injection.refineSuggestion(item, matches)
  }, [injection, item, matches])

  const handleConfirmSuggestion = useCallback(async () => {
    const suggestion = injection.confirmSuggestion()
    if (!suggestion) return

    // Always use the item's actual time — don't trust AI-generated timeSlots
    const timeSlot = formatTimeSlot(item.startTime) || suggestion.timeSlot || '8:00'

    // Ensure dayTypes contains valid values, default to both if empty/invalid
    const validDayTypes = new Set<string>(['school-day', 'weekend', 'holiday', 'half-day'])
    const dayTypes = (suggestion.dayTypes || []).filter((d) => validDayTypes.has(d)) as DayType[]
    const safeDayTypes: DayType[] = dayTypes.length > 0 ? dayTypes : ['school-day', 'weekend']

    const sourceItemRef = {
      type: getItemType(item),
      id: getItemSourceId(item),
    }

    try {
      if (existingBlock) {
        await onUpdateBlock(existingBlock.id, {
          label: suggestion.label,
          blockType: suggestion.blockType,
          timeSlot,
          narrative: suggestion.narrative,
          coachingNote: suggestion.coachingNote || null,
          items: suggestion.items.map((it, i) => ({ ...it, id: `item-${Date.now()}-${i}` })),
          dayTypes: safeDayTypes,
        })
      } else {
        const input: CreateBlockInput = {
          label: suggestion.label,
          blockType: suggestion.blockType,
          timeSlot,
          narrative: suggestion.narrative,
          coachingNote: suggestion.coachingNote || null,
          items: suggestion.items,
          dayTypes: safeDayTypes,
          sourceItemRef,
        }
        await onAddBlock(input)
      }
    } catch (err) {
      console.error('handleConfirmSuggestion error:', err)
    }

    injection.reset()
  }, [injection, item, existingBlock, onAddBlock, onUpdateBlock])

  const handleManual = useCallback(() => {
    onOpenBlockEditor({
      timeSlot: formatTimeSlot(item.startTime),
      blockType: inferBlockType(item),
      label: '',
      narrative: '',
      items: [],
      dayTypes: ['school-day'],
    } as Partial<PlaybookBlock>)
  }, [item, onOpenBlockEditor])

  if (hideCoaching) return null

  // Don't show for playbook items (they already ARE coaching blocks)
  if (item.type === 'playbook') return null

  return (
    <div className="mx-4 mt-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-amber-500"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
        </svg>
        <h3 className="text-sm font-medium text-neutral-600">
          {existingBlock ? 'Update Coaching' : 'Get Coaching'}
        </h3>
      </div>

      {/* Idle — action buttons */}
      {injection.mode === 'idle' && (
        <div className="flex gap-2">
          <button
            onClick={handleChatStart}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
            Discuss
          </button>
          <button
            onClick={handleAutoGenerate}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
            Generate
          </button>
          <button
            onClick={handleManual}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-neutral-600 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            Manual
          </button>
        </div>
      )}

      {/* Auto-loading */}
      {injection.mode === 'auto-loading' && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-neutral-500">
          <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
          Generating coaching...
        </div>
      )}

      {/* Preview — show the suggested block */}
      {injection.mode === 'auto-preview' && injection.suggestion && (
        <BlockPreviewCard
          suggestion={injection.suggestion}
          isUpdate={!!existingBlock}
          onConfirm={handleConfirmSuggestion}
          onRefine={handleRefine}
          onDiscard={injection.reset}
        />
      )}

      {/* Chat mode */}
      {injection.mode === 'chat' && (
        <InlineChatThread
          messages={injection.messages}
          loading={injection.loading}
          readyToFinish={injection.readyToFinish}
          error={injection.error}
          onSend={handleChatRespond}
          onFinish={handleChatFinish}
        />
      )}

      {/* Chat finishing — spinner then transitions to preview */}
      {injection.mode === 'chat-finishing' && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-neutral-500">
          <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
          Generating block from conversation...
        </div>
      )}

      {/* Error in idle state */}
      {injection.mode === 'idle' && injection.error && (
        <p className="mt-2 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">{injection.error}</p>
      )}
    </div>
  )
}
