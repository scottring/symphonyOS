import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ChatMessage, EntityContext, ChatMode } from '@/hooks/useChat'

export interface ChatSession {
  id: string
  title: string | null
  entityType: string | null
  entityId: string | null
  mode: ChatMode
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

interface DbChatSession {
  id: string
  user_id: string
  title: string | null
  entity_type: string | null
  entity_id: string | null
  mode: string
  messages: Array<{ role: string; content: string; timestamp: string; sources?: unknown[] }>
  created_at: string
  updated_at: string
}

function dbToSession(row: DbChatSession): ChatSession {
  return {
    id: row.id,
    title: row.title,
    entityType: row.entity_type,
    entityId: row.entity_id,
    mode: (row.mode as ChatMode) || 'chat',
    messages: (row.messages || []).map((m, i) => ({
      id: `${row.id}-${i}`,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      sources: m.sources as ChatMessage['sources'],
      timestamp: new Date(m.timestamp),
    })),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

/** Generate a short title from the first user message */
function generateTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')
  if (!firstUserMsg) return 'New chat'
  const text = firstUserMsg.content.trim()
  if (text.length <= 50) return text
  return text.slice(0, 47) + '...'
}

export function useChatSessions() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch recent sessions on mount
  useEffect(() => {
    if (!user) return
    setLoading(true)
    supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error && data) {
          setSessions((data as DbChatSession[]).map(dbToSession))
        }
        setLoading(false)
      })
  }, [user])

  // Save a new session or update an existing one
  const saveSession = useCallback(async (
    sessionId: string | null,
    messages: ChatMessage[],
    entityContext: EntityContext | null,
    mode: ChatMode
  ): Promise<string | null> => {
    if (!user || messages.length === 0) return null

    const messagesJson = messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
      ...(m.sources ? { sources: m.sources } : {}),
    }))

    const title = generateTitle(messages)

    if (sessionId) {
      // Update existing
      const { error } = await supabase
        .from('chat_sessions')
        .update({
          messages: messagesJson,
          title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('user_id', user.id)

      if (!error) {
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, title, messages, updatedAt: new Date() }
            : s
        ))
      }
      return sessionId
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title,
          entity_type: entityContext?.type ?? null,
          entity_id: entityContext?.id ?? null,
          mode,
          messages: messagesJson,
        })
        .select()
        .single()

      if (!error && data) {
        const session = dbToSession(data as DbChatSession)
        setSessions(prev => [session, ...prev])
        return session.id
      }
      return null
    }
  }, [user])

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!user) return
    await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id)
    setSessions(prev => prev.filter(s => s.id !== sessionId))
  }, [user])

  return {
    sessions,
    loading,
    saveSession,
    deleteSession,
  }
}
