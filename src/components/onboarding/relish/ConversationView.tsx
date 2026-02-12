import { useEffect, useRef } from 'react'
import { ConversationBubble } from './ConversationBubble'
import { ResponseInput } from './ResponseInput'
import type { ConversationTurn } from '@/types/conversation'
import type { OnboardingPhaseId } from '@/types/manual'

interface ConversationViewProps {
  turns: ConversationTurn[]
  isLoading: boolean
  onSendMessage: (message: string) => void
  phaseId?: OnboardingPhaseId
}

export function ConversationView({ turns, isLoading, onSendMessage, phaseId }: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length, isLoading])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {turns.map((turn, i) => (
          <ConversationBubble key={i} turn={turn} />
        ))}

        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-stone-200 bg-stone-50 px-4 py-3">
        <ResponseInput
          onSend={onSendMessage}
          disabled={isLoading}
          phaseId={phaseId}
          turnCount={turns.length}
        />
      </div>
    </div>
  )
}
