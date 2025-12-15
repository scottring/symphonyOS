import { useEffect, useRef } from 'react'
import { useConversation } from '@/hooks/useConversation'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import type { EntityReference } from '@/types/conversation'

interface ChatViewProps {
  onNavigateToTask?: (taskId: string) => void
  onNavigateToProject?: (projectId: string) => void
  onNavigateToContact?: (contactId: string) => void
}

export function ChatView({
  onNavigateToTask,
  onNavigateToProject,
  onNavigateToContact,
}: ChatViewProps) {
  const {
    messages,
    isLoading,
    isSending,
    error,
    sendMessage,
    startNewConversation,
    clearError,
  } = useConversation()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleEntityClick = (ref: EntityReference) => {
    switch (ref.type) {
      case 'task':
        onNavigateToTask?.(ref.id)
        break
      case 'project':
        onNavigateToProject?.(ref.id)
        break
      case 'contact':
        onNavigateToContact?.(ref.id)
        break
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
            <SymphonyIcon className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="font-semibold text-neutral-800">Symphony</h1>
            <p className="text-xs text-neutral-500">Your AI assistant</p>
          </div>
        </div>

        <button
          onClick={startNewConversation}
          className="p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          title="New conversation"
        >
          <NewChatIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <LoadingSpinner className="w-8 h-8 text-primary-500 mx-auto" />
              <p className="mt-2 text-sm text-neutral-500">Loading conversation...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState onSuggestionClick={sendMessage} />
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onEntityClick={handleEntityClick}
              />
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-neutral-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <TypingIndicator />
                </div>
              </div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        disabled={isSending || isLoading}
        placeholder="Ask me anything about your tasks..."
      />
    </div>
  )
}

function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mb-4">
        <SymphonyIcon className="w-8 h-8 text-primary-600" />
      </div>
      <h2 className="text-lg font-semibold text-neutral-800 mb-2">
        Chat with Symphony
      </h2>
      <p className="text-sm text-neutral-500 max-w-sm mb-6">
        Ask me about your tasks, search past messages, or tell me what to do.
      </p>

      <div className="space-y-2 w-full max-w-sm">
        <SuggestionChip onClick={() => onSuggestionClick("What's on my plate today?")}>
          What's on my plate today?
        </SuggestionChip>
        <SuggestionChip onClick={() => onSuggestionClick("What did I tell Frank last week?")}>
          What did I tell Frank last week?
        </SuggestionChip>
        <SuggestionChip onClick={() => onSuggestionClick("Remind me to call mom tomorrow")}>
          Remind me to call mom tomorrow
        </SuggestionChip>
        <SuggestionChip onClick={() => onSuggestionClick("Push my afternoon tasks to tomorrow")}>
          Push my afternoon tasks to tomorrow
        </SuggestionChip>
      </div>
    </div>
  )
}

function SuggestionChip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-left text-sm text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
    >
      {children}
    </button>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

// Icons
function SymphonyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  )
}

function NewChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  )
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
