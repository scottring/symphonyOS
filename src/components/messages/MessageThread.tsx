import { useState, useRef, useEffect } from 'react'
import type { IMessage } from '@/lib/openBrain'

interface MessageThreadProps {
  messages: IMessage[]
  loading: boolean
  available: boolean | null
  sending: boolean
  contactName?: string
  onSend: (text: string) => Promise<boolean>
  onRefresh: () => void
}

/**
 * Displays an iMessage conversation thread with a compose input.
 * Styled to feel native within Symphony's Nordic Journal design system.
 */
export function MessageThread({
  messages,
  loading,
  available,
  sending,
  contactName,
  onSend,
  onRefresh,
}: MessageThreadProps) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!draft.trim() || sending) return
    const text = draft.trim()
    setDraft('')
    const sent = await onSend(text)
    if (!sent) {
      setDraft(text) // Restore on failure
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Not available state
  if (available === false) {
    return (
      <div className="text-center py-4 text-sm text-neutral-400">
        <p>iMessage not available</p>
        <p className="text-xs mt-1">Open Brain needs Full Disk Access on Mac Mini</p>
      </div>
    )
  }

  // Loading state
  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
        <span className="ml-2 text-sm text-neutral-400">Loading messages...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-medium text-neutral-600">
            Messages{contactName ? ` with ${contactName}` : ''}
          </span>
        </div>
        <button
          onClick={onRefresh}
          className="p-1 hover:bg-neutral-100 rounded transition-colors"
          title="Refresh messages"
        >
          <svg className="w-3.5 h-3.5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-1.5 px-3 py-2 max-h-64 overflow-y-auto"
      >
        {messages.length === 0 && !loading ? (
          <p className="text-xs text-neutral-400 text-center py-4">No messages found</p>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Compose */}
      <div className="flex items-end gap-2 px-3 py-2 border-t border-neutral-100">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message${contactName ? ` ${contactName}` : ''}...`}
          rows={1}
          className="flex-1 resize-none text-sm px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300 focus:border-primary-300"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="p-1.5 rounded-lg bg-primary-600 text-white disabled:opacity-40 hover:bg-primary-700 transition-colors"
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * Individual message bubble
 */
function MessageBubble({ message }: { message: IMessage }) {
  const time = new Date(message.date)
  const timeStr = formatMessageTime(time)
  const serviceLabel = message.service === 'SMS' ? 'SMS' : ''

  return (
    <div className={`flex ${message.isFromMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
          message.isFromMe
            ? 'bg-primary-600 text-white rounded-br-md'
            : 'bg-neutral-100 text-neutral-800 rounded-bl-md'
        }`}
      >
        {message.text ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : message.hasAttachments ? (
          <p className="italic opacity-70">[Attachment]</p>
        ) : (
          <p className="italic opacity-70">[No content]</p>
        )}
        <div className={`flex items-center gap-1 mt-0.5 text-[10px] ${
          message.isFromMe ? 'text-white/60 justify-end' : 'text-neutral-400'
        }`}>
          <span>{timeStr}</span>
          {serviceLabel && <span>· {serviceLabel}</span>}
        </div>
      </div>
    </div>
  )
}

/**
 * Format message timestamp for display.
 * Today: "2:30 PM", yesterday: "Yesterday 2:30 PM", older: "Mar 15, 2:30 PM"
 */
function formatMessageTime(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  if (messageDay.getTime() === today.getTime()) {
    return timeStr
  }
  if (messageDay.getTime() === yesterday.getTime()) {
    return `Yesterday ${timeStr}`
  }

  const month = date.toLocaleDateString(undefined, { month: 'short' })
  return `${month} ${date.getDate()}, ${timeStr}`
}
