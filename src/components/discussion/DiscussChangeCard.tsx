// src/components/discussion/DiscussChangeCard.tsx
//
// The change card Symphony proposed in this Discussion, shown in the thread.
// It is the shell's one pending card (CanvasActivityContext), so Save, Undo
// and the save receipt are the chat pane's own: the same ChangeCard, the same
// approveChangeSet (begin/finish_reviewed_change) and the same Undo
// (undo_reviewed_change). A card proposed somewhere else is not shown here.

import { useState } from 'react'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { ChangeCard } from '@/components/canvas/ChangeCard'
import { ChatReceipt } from '@/components/canvas/ConversationStrip'

interface Props {
  /** The key of the card this thread proposed (useDiscussThread.cardKey). */
  cardKey: string | null
  /** A Symphony turn is running: the card may be about to change. */
  busy: boolean
}

export function DiscussChangeCard({ cardKey, busy }: Props) {
  const { changeSet, approveChangeSet, dismissChangeSet, receipt, undo, retry } = useCanvasActivity()
  // The title of the card saved from here, so only its receipt is shown.
  const [savedTitle, setSavedTitle] = useState<string | null>(null)
  const card = cardKey && changeSet?.key === cardKey ? changeSet : null
  const saving = receipt?.state === 'saving' || card?.state === 'saving'
  // While the card itself shows saving or the failure, it owns the receipt.
  const cardOwnsReceipt = !!card && receipt?.request === card.title && ['saving', 'failed', 'partial'].includes(receipt.state)
  const showReceipt = !!receipt && !!savedTitle && receipt.source === 'manual' && receipt.request === savedTitle
    && receipt.state !== 'working' && !cardOwnsReceipt
  if (!card && !showReceipt) return null
  return (
    <div className="mb-3">
      {card && (
        <ChangeCard
          chat
          set={card}
          today={new Date()}
          updating={busy}
          onApprove={() => { setSavedTitle(card.title); void approveChangeSet() }}
          onDismiss={dismissChangeSet}
        />
      )}
      {showReceipt && receipt && <ChatReceipt receipt={receipt} onUndo={() => void undo()} onRetry={retry} busy={busy || saving} />}
    </div>
  )
}
