import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

interface TaskConversation {
  id: string
  title: string
  updatedAt: Date
  messages: StoredMessage[]
}

interface PanelConversationsProps {
  taskId: string
}

/**
 * AI conversations that happened about this task (assist drawer chats,
 * persisted to chat_sessions with entity_id = task id). Read-only transcript,
 * expandable inline — the "what did the assistant tell me about this?"
 * re-entry point.
 */
export function PanelConversations({ taskId }: PanelConversationsProps) {
  const [conversations, setConversations] = useState<TaskConversation[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('chat_sessions')
        .select('id, title, messages, updated_at')
        .eq('entity_id', taskId)
        .order('updated_at', { ascending: false })
        .limit(10)
      if (cancelled || !data) return
      setConversations(data.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: new Date(row.updated_at),
        messages: Array.isArray(row.messages) ? (row.messages as StoredMessage[]) : [],
      })))
    })()
    return () => { cancelled = true }
  }, [taskId])

  if (conversations.length === 0) return null

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Conversations</div>
      <div className="space-y-1">
        {conversations.map((c) => {
          const open = openId === c.id
          return (
            <div key={c.id} className="rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb]">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : c.id)}
                className="flex items-center gap-2 w-full text-left py-1.5 px-2 hover:bg-neutral-50 rounded-md"
              >
                {open ? <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />}
                <MessageCircle className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                <span className="flex-1 text-sm text-neutral-800 truncate">{c.title}</span>
                <span className="text-[11px] text-neutral-400 shrink-0">
                  {c.updatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </button>
              {open && (
                <div className="px-2 pb-2 space-y-1.5 max-h-72 overflow-y-auto">
                  {c.messages.map((m, i) => (
                    <div
                      key={i}
                      className={`text-[13px] leading-relaxed whitespace-pre-wrap rounded-lg px-2.5 py-1.5 ${
                        m.role === 'user'
                          ? 'bg-primary-50 text-primary-900 ml-6'
                          : 'bg-neutral-50 text-neutral-700 mr-2'
                      }`}
                    >
                      {m.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
