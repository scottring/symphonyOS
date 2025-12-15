import { useEffect, useRef, useState, useCallback } from 'react'
import { useConversation } from '@/hooks/useConversation'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onCreateTask: (title: string) => Promise<void>
}

// Intent detection: determine if input should go to AI or create a task directly
function detectIntent(input: string): 'ai' | 'task' {
  const trimmed = input.trim().toLowerCase()

  // Explicit AI prefix
  if (trimmed.startsWith('ask ') || trimmed.startsWith('ai ')) {
    return 'ai'
  }

  // Questions (contains ?)
  if (input.includes('?')) {
    return 'ai'
  }

  // Starts with question words
  const questionStarters = [
    'what', 'when', 'where', 'how', 'why', 'who', 'which',
    'can', 'could', 'should', 'would', 'will', 'is', 'are', 'do', 'does', 'did',
    'show', 'list', 'find', 'search', 'help', 'tell'
  ]
  const firstWord = trimmed.split(/\s+/)[0]
  if (questionStarters.includes(firstWord)) {
    return 'ai'
  }

  // Action commands that need AI
  const actionPatterns = [
    /^move\s/i,
    /^reschedule\s/i,
    /^change\s/i,
    /^update\s/i,
    /^push\s/i,
    /^defer\s/i,
    /^complete\s/i,
    /^mark\s/i,
    /^delete\s/i,
    /^cancel\s/i,
    /^plan\s/i,
    /^organize\s/i,
    /^prioritize\s/i,
  ]
  if (actionPatterns.some(pattern => pattern.test(trimmed))) {
    return 'ai'
  }

  // References to existing items
  const referencePatterns = [
    /my\s+(tasks?|schedule|calendar|dinner|lunch|breakfast|morning|afternoon|evening|day|week)/i,
    /today'?s?\s/i,
    /tomorrow'?s?\s/i,
    /this\s+(week|morning|afternoon|evening)/i,
    /the\s+(prep|dinner|lunch)/i,
  ]
  if (referencePatterns.some(pattern => pattern.test(trimmed))) {
    return 'ai'
  }

  // Default: treat as a new task
  return 'task'
}

export function CommandPalette({ isOpen, onClose, onCreateTask }: CommandPaletteProps) {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'auto' | 'ai' | 'task'>('auto')
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    isSending,
    error,
    sendMessage,
    clearError,
    startNewConversation,
  } = useConversation()

  // Detected intent based on current input
  const detectedIntent = input.trim() ? detectIntent(input) : null

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setInput('')
      setMode('auto')
    }
  }, [isOpen])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isSending || isCreatingTask) return

    const text = input.trim()
    const intent = mode === 'auto' ? detectIntent(text) : mode

    if (intent === 'task') {
      // Create task directly
      setIsCreatingTask(true)
      try {
        await onCreateTask(text)
        setInput('')
        onClose()
      } finally {
        setIsCreatingTask(false)
      }
    } else {
      // Send to AI
      // Remove "ask " or "ai " prefix if present
      const cleanedText = text.replace(/^(ask|ai)\s+/i, '')
      setInput('')
      await sendMessage(cleanedText)
    }
  }, [input, mode, isSending, isCreatingTask, onCreateTask, onClose, sendMessage])

  const handleSuggestionClick = useCallback((text: string) => {
    setInput(text)
    inputRef.current?.focus()
  }, [])

  const handleNewConversation = useCallback(() => {
    startNewConversation()
    setInput('')
    inputRef.current?.focus()
  }, [startNewConversation])

  if (!isOpen) return null

  const hasConversation = messages.length > 0
  const isProcessing = isSending || isCreatingTask

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 bg-gradient-to-r from-primary-50 to-white">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <SymphonyIcon className="w-4 h-4 text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-neutral-800 text-sm">Symphony</h2>
            <p className="text-xs text-neutral-500 truncate">
              {hasConversation ? 'Ask a question or add a task' : 'Type anything — tasks, questions, or commands'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasConversation && (
              <button
                onClick={handleNewConversation}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
                title="New conversation"
              >
                <NewChatIcon className="w-4 h-4" />
              </button>
            )}
            <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 bg-neutral-100 rounded border border-neutral-200">
              esc
            </kbd>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages area (only shown when there's a conversation) */}
        {hasConversation && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[80px] max-h-[40vh]">
            {messages.slice(-8).map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary-500 text-white rounded-br-md'
                      : 'bg-neutral-100 text-neutral-800 rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-neutral-100 rounded-2xl rounded-bl-md px-3 py-2">
                  <TypingIndicator />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-100">
            <div className="flex items-center justify-between">
              <p className="text-xs text-red-700">{error}</p>
              <button onClick={clearError} className="text-red-500 hover:text-red-700">
                <CloseIcon className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-neutral-100">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Add a task or ask Symphony anything..."
                className="w-full pl-4 pr-20 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300"
                disabled={isProcessing}
              />
              {/* Intent indicator */}
              {input.trim() && !isProcessing && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {detectedIntent === 'ai' ? (
                    <span className="px-2 py-0.5 text-[10px] font-medium text-primary-600 bg-primary-50 rounded-full">
                      AI
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded-full">
                      Task
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isProcessing}
              className="px-4 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isProcessing ? (
                <LoadingSpinner className="w-4 h-4" />
              ) : detectedIntent === 'ai' ? (
                <SendIcon className="w-4 h-4" />
              ) : (
                <PlusIcon className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Quick suggestions when no input and no conversation */}
          {!hasConversation && !input.trim() && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">Quick actions</p>
              <div className="flex flex-wrap gap-2">
                <QuickChip onClick={() => handleSuggestionClick("What's on my plate today?")} icon="ai">
                  What's on my plate?
                </QuickChip>
                <QuickChip onClick={() => handleSuggestionClick("Move dinner prep to 5pm")} icon="ai">
                  Reschedule tasks
                </QuickChip>
                <QuickChip onClick={() => handleSuggestionClick("Buy groceries")} icon="task">
                  Add a task
                </QuickChip>
                <QuickChip onClick={() => handleSuggestionClick("What's for dinner tonight?")} icon="ai">
                  What's for dinner?
                </QuickChip>
              </div>
            </div>
          )}

          {/* Mode override hint */}
          {input.trim() && (
            <p className="mt-2 text-[11px] text-neutral-400">
              {detectedIntent === 'task' ? (
                <>Press Enter to create task • Start with "ask" to chat with AI</>
              ) : (
                <>Press Enter to ask AI • Type a simple phrase like "Buy milk" to create a task</>
              )}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

function QuickChip({
  children,
  onClick,
  icon
}: {
  children: React.ReactNode
  onClick: () => void
  icon: 'ai' | 'task'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors"
    >
      {icon === 'ai' ? (
        <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      )}
      {children}
    </button>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }} />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
