// Past conversations: the clock button and its list. One menu for the shell's
// chat pane and the older ChatPanel (Assist, paper plans), so they can't drift.

import { useEffect, useRef, useState } from 'react'
import type { ChatSession } from '@/types/chat'

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

export interface ChatHistoryProps {
  sessions: ChatSession[]
  loading?: boolean
  activeSessionId?: string | null
  onLoad: (session: ChatSession) => void
  onDelete?: (sessionId: string) => void
  onNew?: () => void
}

export function ChatHistoryMenu({ sessions, loading = false, activeSessionId, onLoad, onDelete, onNew }: ChatHistoryProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={root} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) } }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Chat history"
        className={`p-1.5 rounded-md transition-colors ${
          open
            ? 'text-primary-600 bg-primary-50'
            : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
        title="Chat history"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 max-h-80 bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-neutral-100 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Recent conversations</span>
            {sessions.length > 0 && onNew && (
              <button
                type="button"
                onClick={() => { onNew(); setOpen(false) }}
                className="text-[10px] text-primary-600 hover:text-primary-700 font-medium"
              >
                New chat
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-64">
            {loading ? (
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
                  onClick={() => { onLoad(session); setOpen(false) }}
                >
                  {/* A button so history opens from the keyboard; its click
                      bubbles to the row's load handler. */}
                  <button type="button" aria-current={session.id === activeSessionId ? 'true' : undefined} className="flex-1 min-w-0 text-left">
                    <span className="block text-xs font-medium text-neutral-700 truncate">
                      {session.title || 'Untitled chat'}
                    </span>
                    <span className="block text-[10px] text-neutral-400 mt-0.5">
                      {session.messages.length} messages · {formatSessionDate(session.updatedAt)}
                    </span>
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(session.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-neutral-300 hover:text-red-500 transition-all"
                      title="Delete conversation"
                      aria-label="Delete conversation"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
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
  )
}
