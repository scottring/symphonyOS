import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PanelSection } from './PanelSection'

interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  author?: { name?: string; kind?: string }
}

interface TaskConversation {
  id: string
  title: string
  updatedAt: Date
  messages: StoredMessage[]
  /** The item's one shared thread. Listed first, always titled "Discussion". */
  isDiscussion: boolean
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
        .select('id, title, messages, mode, updated_at')
        .eq('entity_id', taskId)
        .order('updated_at', { ascending: false })
        .limit(10)
      if (cancelled || !data) return
      const rows: TaskConversation[] = data.map((row) => {
        const isDiscussion = row.mode === 'discuss'
        return {
          id: row.id,
          // The shared thread is the item's conversation — it never inherits
          // the first message as a title the way an ad-hoc chat does.
          title: isDiscussion ? 'Discussion' : row.title,
          updatedAt: new Date(row.updated_at),
          messages: Array.isArray(row.messages) ? (row.messages as StoredMessage[]) : [],
          isDiscussion,
        }
      })
      // Discussion first, then the older chats in recency order. An untouched
      // thread (created the moment the drawer opened) is not a conversation.
      const withContent = rows.filter((r) => r.messages.length > 0)
      setConversations([
        ...withContent.filter((r) => r.isDiscussion),
        ...withContent.filter((r) => !r.isDiscussion),
      ])
    })()
    return () => { cancelled = true }
  }, [taskId])

  if (conversations.length === 0) return null

  return (
    <PanelSection id="conversations" label="Conversations" preview={`${conversations.length} message${conversations.length === 1 ? '' : 's'}`}>
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
                      {/* In a shared thread the speaker isn't obvious from the
                          side of the bubble — say who it was. */}
                      {c.isDiscussion && m.author?.name && (
                        <span className="block text-[10px] font-medium uppercase tracking-wide opacity-60 mb-0.5">
                          {m.author.name}
                        </span>
                      )}
                      {m.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </PanelSection>
  )
}
