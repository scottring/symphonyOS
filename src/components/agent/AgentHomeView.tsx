import { useRef, useEffect } from 'react'
import { useAgentChat } from '@/hooks/useAgentChat'
import { useAgentBriefing } from '@/hooks/useAgentBriefing'
import { BriefingSection } from './BriefingSection'
import { AgentChatInput } from './AgentChatInput'

export function AgentHomeView() {
  const { messages, loading: chatLoading, error: chatError, sendMessage } = useAgentChat()
  const { briefing, loading: briefingLoading, error: briefingError, refresh } = useAgentBriefing()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="bg-bg-base pb-16">
      {/* Content area — pb-16 reserves space for fixed chat input */}
      <div>
        {/* Briefing section */}
        {briefingLoading && !briefing && (
          <div className="px-4 pt-4 pb-2">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-48 bg-neutral-200 rounded" />
              <div className="h-4 w-32 bg-neutral-100 rounded" />
              <div className="h-20 bg-neutral-100 rounded-xl" />
            </div>
          </div>
        )}

        {briefingError && !briefing && (
          <div className="px-4 pt-4 pb-2">
            <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">
              {briefingError}
              <button onClick={() => refresh(true)} className="ml-2 underline">Retry</button>
            </div>
          </div>
        )}

        {briefing && (
          <BriefingSection briefing={briefing} onRefresh={() => refresh(true)} />
        )}

        {/* Divider */}
        {(briefing || briefingLoading) && messages.length > 0 && (
          <div className="mx-4 border-t border-neutral-200/60" />
        )}

        {/* Chat messages */}
        <div className="px-4 py-2 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary-500 text-white rounded-br-md'
                    : 'bg-neutral-100 text-neutral-800 rounded-bl-md'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <span>{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-neutral-100 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {chatError && (
            <div className="text-center">
              <span className="text-xs text-red-500">{chatError}</span>
            </div>
          )}
        </div>

        {/* Empty state */}
        {messages.length === 0 && !chatLoading && briefing && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-neutral-400">Ask Michael anything about your tasks, projects, or vault.</p>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Fixed input above bottom nav */}
      <AgentChatInput onSend={sendMessage} disabled={chatLoading} />
    </div>
  )
}
