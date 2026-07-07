import { useRef, useEffect, useCallback, useState } from 'react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { VaultDraftCard } from './VaultDraftCard'
import { MealRequestCards } from './MealRequestCards'
import type { ChatMessage as ChatMessageType, EntityContext, ChatMode, ChatSession } from '@/types/chat'
import type { ChatAttachment } from './ChatAttachment'

interface ChatPanelProps {
  messages: ChatMessageType[]
  loading: boolean
  error: string | null
  entityContext: EntityContext | null
  onSend: (message: string, attachment?: ChatAttachment) => void
  onClear: () => void
  onClose: () => void
  onSourceClick?: (noteId: string) => void
  onSaveToVault?: (title: string, content: string) => Promise<boolean>
  onAddTask?: (title: string, destination: 'inbox' | 'today') => void
  toolActivity?: string[]
  mode?: ChatMode
  /** Tappable starter prompts shown in the empty state; click sends them. */
  suggestions?: string[]
  // Chat history
  sessions?: ChatSession[]
  sessionsLoading?: boolean
  onLoadSession?: (session: ChatSession) => void
  onDeleteSession?: (sessionId: string) => void
  onNewChat?: () => void
  activeSessionId?: string | null
}

/** Format a date for the session list */
function formatSessionDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ChatPanel({
  messages,
  loading,
  error,
  entityContext,
  onSend,
  onClear,
  onClose,
  onSourceClick,
  onSaveToVault,
  onAddTask,
  toolActivity,
  mode = 'chat',
  suggestions,
  sessions = [],
  sessionsLoading = false,
  onLoadSession,
  onDeleteSession,
  onNewChat,
  activeSessionId,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dismissedDrafts, setDismissedDrafts] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Close history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showHistory])

  const placeholder = entityContext
    ? `Ask about ${entityContext.name}...`
    : 'Ask Symphony anything...'

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showHistory) {
        setShowHistory(false)
      } else {
        onClose()
      }
    }
  }, [onClose, showHistory])

  return (
    <div
      className="flex flex-col h-full min-h-0 bg-white border-l border-neutral-200"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-neutral-800">
              {mode === 'guided_reflection' ? 'Think It Through' : 'Symphony AI'}
            </h3>
            {entityContext && (
              <p className="text-[10px] text-neutral-400">
                {entityContext.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* New chat button */}
          {messages.length > 0 && onNewChat && (
            <button
              onClick={onNewChat}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              title="New chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {/* History button */}
          {onLoadSession && (
            <div className="relative" ref={historyRef}>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1.5 rounded-md transition-colors ${
                  showHistory
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                }`}
                title="Chat history"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
              </button>
              {/* History dropdown */}
              {showHistory && (
                <div className="absolute right-0 top-full mt-1 w-72 max-h-80 bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-neutral-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-500">Recent conversations</span>
                    {sessions.length > 0 && onNewChat && (
                      <button
                        onClick={() => { onNewChat(); setShowHistory(false) }}
                        className="text-[10px] text-primary-600 hover:text-primary-700 font-medium"
                      >
                        New chat
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto max-h-64">
                    {sessionsLoading ? (
                      <div className="px-3 py-6 text-center text-xs text-neutral-400">Loading...</div>
                    ) : sessions.length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-neutral-400">No conversations yet</div>
                    ) : (
                      sessions.map((session) => (
                        <div
                          key={session.id}
                          className={`group flex items-start gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                            session.id === activeSessionId
                              ? 'bg-primary-50'
                              : 'hover:bg-neutral-50'
                          }`}
                          onClick={() => { onLoadSession(session); setShowHistory(false) }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-neutral-700 truncate">
                              {session.title || 'Untitled chat'}
                            </p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">
                              {session.messages.length} messages · {formatSessionDate(session.updatedAt)}
                            </p>
                          </div>
                          {onDeleteSession && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteSession(session.id)
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-300 hover:text-red-500 transition-all"
                              title="Delete conversation"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Clear button */}
          {messages.length > 0 && (
            <button
              onClick={onClear}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              title="Clear chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            title="Close chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-primary-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm text-neutral-500 mb-1">
              {mode === 'guided_reflection' && entityContext
                ? `Let's think through ${entityContext.name}`
                : entityContext
                ? `Ask about ${entityContext.name}`
                : 'Ask me anything'
              }
            </p>
            <p className="text-xs text-neutral-400">
              {mode === 'guided_reflection'
                ? "I'll ask questions to help you explore this — save the result if it's worth keeping"
                : "I can manage your tasks, projects, and calendar in Symphony"
              }
            </p>
            {suggestions && suggestions.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 w-full max-w-[260px]">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSend(s)}
                    className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200 transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              <ChatMessage
                message={msg}
                onSourceClick={onSourceClick}
                onAddTask={onAddTask}
              />
              {msg.vaultDraft && onSaveToVault && !dismissedDrafts.has(msg.id) && (
                <VaultDraftCard
                  title={msg.vaultDraft.title}
                  content={msg.vaultDraft.content}
                  onSave={(title, content) => onSaveToVault(title, content)}
                  onDismiss={() => setDismissedDrafts(prev => new Set([...prev, msg.id]))}
                />
              )}
              {msg.mealRequest && (
                <MealRequestCards request={msg.mealRequest} />
              )}
            </div>
          ))
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start mb-3">
            <div className="bg-neutral-100 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-auto max-w-[85%] rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2 mb-3">
            {error}
          </div>
        )}
      </div>

      {/* Tool activity */}
      {toolActivity && toolActivity.length > 0 && loading && (
        <div className="px-4 py-1.5 text-xs text-neutral-400 border-t border-neutral-200/60">
          {toolActivity[toolActivity.length - 1].replace(/^mcp__symphony__symphony_/, '').replace(/^symphony_/, '').replace(/_/g, ' ')}…
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={(msg, attachment) => onSend(msg, attachment)}
        loading={loading}
        placeholder={placeholder}
      />
    </div>
  )
}
