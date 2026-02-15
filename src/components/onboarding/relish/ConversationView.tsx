// ConversationView — editorial conversation layout for domain assessments and profiles
// Clean single-column layout with domain context breadcrumbs

import { useEffect, useRef } from 'react'
import { ConversationMessage } from './ConversationMessage'
import { ResponseInput } from './ResponseInput'
import type { ConversationTurn } from '@/types/conversation'
import type { DomainId } from '@/types/manual'
import { DOMAIN_NAMES } from '@/types/manual'

interface ConversationViewProps {
  turns: ConversationTurn[]
  isLoading: boolean
  onSendMessage: (message: string) => void
  domainId?: DomainId
  familyName?: string
  error?: string | null
  minTurns?: number
  maxTurns?: number
}

export function ConversationView({
  turns,
  isLoading,
  onSendMessage,
  domainId,
  familyName,
  error,
  minTurns = 3,
  maxTurns = 10,
}: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length, isLoading])

  // Compute turn info for the counter
  const userTurns = turns.filter(t => t.role === 'user').length
  const goodTurns = Math.ceil((minTurns + maxTurns) / 2) // midpoint = "good depth"

  // Depth state: what color is the bar?
  const depthState: 'empty' | 'building' | 'minimum' | 'good' | 'deep' =
    userTurns === 0 ? 'empty' :
    userTurns < minTurns ? 'building' :
    userTurns < goodTurns ? 'minimum' :
    userTurns < maxTurns ? 'good' : 'deep'

  const depthPercent = Math.min(100, Math.round((userTurns / maxTurns) * 100))

  const depthBarColor = {
    empty: 'bg-stone-200',
    building: 'bg-stone-300',
    minimum: 'bg-amber-400',
    good: 'bg-emerald-400',
    deep: 'bg-emerald-500',
  }[depthState]

  const depthLabel = {
    empty: '',
    building: 'Getting started...',
    minimum: 'Good start — keep going for richer insights',
    good: 'Strong depth',
    deep: 'Wrapping up...',
  }[depthState]

  return (
    <div className="flex flex-col h-full">
      {/* ==================== Conversation Panel ==================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topic breadcrumbs + turn counter */}
        <div className="border-b border-stone-100 px-5 py-3 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-stone-400 min-w-0">
              {domainId && (
                <>
                  <span className="font-medium text-stone-600">Assessment</span>
                  <span className="text-stone-300">/</span>
                  <span className="truncate">{DOMAIN_NAMES[domainId]}</span>
                </>
              )}
              {!domainId && familyName && (
                <span className="font-medium text-stone-600">{familyName}</span>
              )}
            </div>
            {userTurns > 0 && (
              <span className="text-xs text-stone-400 tabular-nums shrink-0 ml-3">
                {userTurns} of ~{maxTurns}
              </span>
            )}
          </div>

          {/* Depth progress bar */}
          {userTurns > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${depthBarColor}`}
                  style={{ width: `${depthPercent}%` }}
                />
              </div>
              {depthLabel && (
                <p className={`mt-1 text-[11px] ${
                  depthState === 'good' || depthState === 'deep' ? 'text-emerald-600' :
                  depthState === 'minimum' ? 'text-amber-600' : 'text-stone-400'
                }`}>
                  {depthLabel}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 lg:px-10 py-6">
          <div className="max-w-xl">
            {turns.map((turn, i) => (
              <ConversationMessage
                key={i}
                turn={turn}
                isLatest={i === turns.length - 1}
              />
            ))}

            {isLoading && (
              <div className="animate-fade-in py-4">
                <div className="flex gap-1.5 items-center">
                  <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-stone-100 bg-white px-5 md:px-8 lg:px-10 py-4">
          <div className="max-w-xl">
            <ResponseInput
              onSend={onSendMessage}
              disabled={isLoading}
              domainId={domainId}
              turnCount={turns.length}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
