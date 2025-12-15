import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  Conversation,
  ConversationMessage,
  DbConversation,
  DbConversationMessage,
} from '@/types/conversation'
import { dbToConversation, dbToConversationMessage } from '@/types/conversation'

interface UseConversationReturn {
  // State
  conversation: Conversation | null
  messages: ConversationMessage[]
  isLoading: boolean
  isSending: boolean
  error: string | null

  // Methods
  sendMessage: (content: string) => Promise<void>
  startNewConversation: () => void
  loadConversation: (id: string) => Promise<void>
  clearError: () => void
}

export function useConversation(): UseConversationReturn {
  const { user } = useAuth()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedConvId = useRef<string | null>(null)

  // Load most recent active conversation on mount
  useEffect(() => {
    if (!user) return

    const loadRecentConversation = async () => {
      setIsLoading(true)
      try {
        // Get most recent active conversation
        const { data: convData, error: convError } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('last_message_at', { ascending: false })
          .limit(1)
          .single()

        if (convError && convError.code !== 'PGRST116') {
          // PGRST116 = no rows returned, which is fine
          console.error('Error loading conversation:', convError)
        }

        if (convData) {
          const conv = dbToConversation(convData as DbConversation)
          setConversation(conv)
          loadedConvId.current = conv.id

          // Load messages for this conversation
          const { data: msgData, error: msgError } = await supabase
            .from('conversation_messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: true })

          if (msgError) {
            console.error('Error loading messages:', msgError)
          } else {
            setMessages(
              (msgData || []).map((m) => dbToConversationMessage(m as DbConversationMessage))
            )
          }
        }
      } catch (err) {
        console.error('Error in loadRecentConversation:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadRecentConversation()
  }, [user])

  // Subscribe to new messages in real-time
  useEffect(() => {
    if (!conversation?.id) return

    const channel = supabase
      .channel(`conversation:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newMessage = dbToConversationMessage(payload.new as DbConversationMessage)
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev
            }
            return [...prev, newMessage]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversation?.id])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !content.trim()) return

      setError(null)
      setIsSending(true)

      // Optimistically add user message
      const tempUserMsg: ConversationMessage = {
        id: `temp-${Date.now()}`,
        conversationId: conversation?.id || '',
        userId: user.id,
        role: 'user',
        content: content.trim(),
        actionsTaken: [],
        entityReferences: [],
        aiModel: null,
        aiLatencyMs: null,
        inputTokens: null,
        outputTokens: null,
        createdAt: new Date(),
      }

      setMessages((prev) => [...prev, tempUserMsg])

      try {
        const { data, error: fnError } = await supabase.functions.invoke('chat-message', {
          body: {
            conversationId: conversation?.id || undefined,
            message: content.trim(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        })

        if (fnError) {
          throw new Error(fnError.message || 'Failed to send message')
        }

        // Update conversation if new
        if (!conversation && data.conversationId) {
          const { data: convData } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', data.conversationId)
            .single()

          if (convData) {
            setConversation(dbToConversation(convData as DbConversation))
            loadedConvId.current = convData.id
          }
        }

        // Remove temp message and add real messages
        setMessages((prev) => {
          // Filter out temp message
          const filtered = prev.filter((m) => !m.id.startsWith('temp-'))

          // Add the assistant response
          const assistantMsg: ConversationMessage = {
            id: data.message.id,
            conversationId: data.conversationId,
            userId: user.id,
            role: 'assistant',
            content: data.message.content,
            actionsTaken: data.message.actionsTaken || [],
            entityReferences: data.message.entityReferences || [],
            aiModel: 'claude-3-5-haiku-20241022',
            aiLatencyMs: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: new Date(data.message.createdAt),
          }

          // The user message should have been inserted by the server
          // We'll rely on realtime subscription or re-fetch
          return [...filtered, assistantMsg]
        })
      } catch (err) {
        console.error('Error sending message:', err)
        setError(err instanceof Error ? err.message : 'Failed to send message')

        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => !m.id.startsWith('temp-')))
      } finally {
        setIsSending(false)
      }
    },
    [user, conversation]
  )

  const startNewConversation = useCallback(() => {
    setConversation(null)
    setMessages([])
    setError(null)
    loadedConvId.current = null
  }, [])

  const loadConversation = useCallback(
    async (id: string) => {
      if (!user) return

      setIsLoading(true)
      setError(null)

      try {
        // Load conversation
        const { data: convData, error: convError } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single()

        if (convError) throw convError

        const conv = dbToConversation(convData as DbConversation)
        setConversation(conv)
        loadedConvId.current = conv.id

        // Load messages
        const { data: msgData, error: msgError } = await supabase
          .from('conversation_messages')
          .select('*')
          .eq('conversation_id', id)
          .order('created_at', { ascending: true })

        if (msgError) throw msgError

        setMessages(
          (msgData || []).map((m) => dbToConversationMessage(m as DbConversationMessage))
        )
      } catch (err) {
        console.error('Error loading conversation:', err)
        setError(err instanceof Error ? err.message : 'Failed to load conversation')
      } finally {
        setIsLoading(false)
      }
    },
    [user]
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    conversation,
    messages,
    isLoading,
    isSending,
    error,
    sendMessage,
    startNewConversation,
    loadConversation,
    clearError,
  }
}

// Export a hook for getting conversation history list
export function useConversationHistory() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadHistory = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(20)

      if (error) throw error

      setConversations(
        (data || []).map((c) => dbToConversation(c as DbConversation))
      )
    } catch (err) {
      console.error('Error loading conversation history:', err)
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  return {
    conversations,
    isLoading,
    refresh: loadHistory,
  }
}
