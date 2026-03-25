import { useState, useEffect, useCallback } from 'react'
import { useEventEmails } from '@/hooks/useEventEmails'
import type { EmailThread } from '@/hooks/useEventEmails'
import { Mail, ChevronDown, ChevronRight, Send, ArrowLeft, Loader2 } from 'lucide-react'

interface EventEmailsSectionProps {
  attendeeEmails: string[]
}

// Format email date to relative or short form
function formatEmailDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    }
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

// Extract display name from email "Name <email>" format
function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</)
  return match ? match[1].trim() : from.split('@')[0]
}

// Extract email address from "Name <email>" format
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1] : from
}

function ThreadRow({
  thread,
  onExpand,
}: {
  thread: EmailThread
  onExpand: (threadId: string) => void
}) {
  return (
    <button
      onClick={() => onExpand(thread.threadId)}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-50 transition-colors group"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center shrink-0 mt-0.5">
          <Mail className="w-3.5 h-3.5 text-primary-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-800 truncate">
              {thread.subject || '(no subject)'}
            </span>
            {thread.messageCount > 1 && (
              <span className="shrink-0 text-xs text-neutral-400">
                ({thread.messageCount})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-neutral-500 truncate">
              {extractName(thread.from)}
            </span>
            <span className="text-neutral-300">·</span>
            <span className="text-xs text-neutral-400 shrink-0">
              {formatEmailDate(thread.lastMessageDate)}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5 line-clamp-1">
            {thread.snippet}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-400 shrink-0 mt-1" />
      </div>
    </button>
  )
}

function ReplyComposer({
  threadId,
  defaultTo,
  defaultSubject,
  onSend,
  sending,
}: {
  threadId: string
  defaultTo: string
  defaultSubject: string
  onSend: (threadId: string, to: string, subject: string, body: string) => Promise<boolean>
  sending: boolean
}) {
  const [to, setTo] = useState(defaultTo)
  const [subject] = useState(
    defaultSubject.startsWith('Re: ') ? defaultSubject : `Re: ${defaultSubject}`
  )
  const [body, setBody] = useState('')

  const handleSend = async () => {
    if (!body.trim() || !to.trim()) return
    const success = await onSend(threadId, to, subject, body)
    if (success) {
      setBody('')
    }
  }

  return (
    <div className="border-t border-neutral-100 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400 w-6">To:</span>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 text-sm text-neutral-700 bg-transparent outline-none"
          placeholder="recipient@email.com"
        />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your reply..."
        rows={3}
        className="w-full text-sm text-neutral-700 bg-neutral-50 rounded-lg p-2.5 outline-none border border-neutral-100 focus:border-primary-300 resize-none transition-colors"
      />
      <div className="flex justify-end">
        <button
          onClick={handleSend}
          disabled={!body.trim() || !to.trim() || sending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Send
        </button>
      </div>
    </div>
  )
}

export function EventEmailsSection({ attendeeEmails }: EventEmailsSectionProps) {
  const {
    threads,
    selectedThread,
    loading,
    error,
    fetchThreadsForEvent,
    fetchThreadDetail,
    sendReply,
    clearSelectedThread,
  } = useEventEmails()

  const [expanded, setExpanded] = useState(false)
  const [showReply, setShowReply] = useState(false)
  const [sending, setSending] = useState(false)

  // Filter out self emails (no point searching for your own threads)
  const externalEmails = attendeeEmails.filter(e => !e.includes('self'))

  useEffect(() => {
    if (expanded && externalEmails.length > 0 && threads.length === 0 && !loading) {
      fetchThreadsForEvent(externalEmails)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const handleExpand = useCallback((threadId: string) => {
    fetchThreadDetail(threadId)
    setShowReply(false)
  }, [fetchThreadDetail])

  const handleSendReply = useCallback(async (
    threadId: string,
    to: string,
    subject: string,
    body: string
  ) => {
    setSending(true)
    const result = await sendReply(threadId, to, subject, body)
    setSending(false)
    if (result) {
      setShowReply(false)
    }
    return result
  }, [sendReply])

  if (externalEmails.length === 0) return null

  return (
    <div className="border-t border-neutral-100">
      {/* Section header / toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-2 hover:bg-neutral-50 transition-colors"
      >
        <Mail className="w-4 h-4 text-neutral-400" />
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide flex-1 text-left">
          Email Threads
        </h3>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Thread detail view */}
          {selectedThread ? (
            <div className="bg-bg-elevated rounded-xl border border-neutral-100 overflow-hidden">
              {/* Thread header */}
              <div className="p-3 border-b border-neutral-100 flex items-center gap-2">
                <button
                  onClick={() => {
                    clearSelectedThread()
                    setShowReply(false)
                  }}
                  className="p-1 rounded-md hover:bg-neutral-100 transition-colors"
                  aria-label="Back to thread list"
                >
                  <ArrowLeft className="w-4 h-4 text-neutral-500" />
                </button>
                <h4 className="text-sm font-medium text-neutral-800 truncate flex-1">
                  {selectedThread.subject || '(no subject)'}
                </h4>
                <span className="text-xs text-neutral-400 shrink-0">
                  {selectedThread.messageCount} message{selectedThread.messageCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Messages */}
              <div className="divide-y divide-neutral-50 max-h-80 overflow-y-auto">
                {selectedThread.messages.map((msg, i) => (
                  <div key={i} className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-neutral-700">
                        {extractName(msg.from)}
                      </span>
                      <span className="text-xs text-neutral-400">
                        {formatEmailDate(msg.date)}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-600 whitespace-pre-wrap break-words leading-relaxed">
                      {msg.body.slice(0, 2000)}
                      {msg.body.length > 2000 && '...'}
                    </p>
                  </div>
                ))}
              </div>

              {/* Reply section */}
              {showReply ? (
                <ReplyComposer
                  threadId={selectedThread.threadId}
                  defaultTo={extractEmail(
                    selectedThread.messages[selectedThread.messages.length - 1]?.from || ''
                  )}
                  defaultSubject={selectedThread.subject}
                  onSend={handleSendReply}
                  sending={sending}
                />
              ) : (
                <div className="p-3 border-t border-neutral-100">
                  <button
                    onClick={() => setShowReply(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Reply
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Loading state */}
              {loading && (
                <div className="flex items-center gap-2 py-6 justify-center">
                  <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
                  <span className="text-sm text-neutral-400">Loading email threads...</span>
                </div>
              )}

              {/* Error state */}
              {error && !loading && (
                <div className="py-4 text-center">
                  <p className="text-sm text-neutral-400">{error}</p>
                </div>
              )}

              {/* Empty state */}
              {!loading && !error && threads.length === 0 && (
                <div className="py-6 text-center">
                  <Mail className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
                  <p className="text-sm text-neutral-400">No email threads found with attendees</p>
                </div>
              )}

              {/* Thread list */}
              {!loading && threads.length > 0 && (
                <div className="space-y-0.5">
                  {threads.map((thread) => (
                    <ThreadRow
                      key={thread.threadId}
                      thread={thread}
                      onExpand={handleExpand}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
