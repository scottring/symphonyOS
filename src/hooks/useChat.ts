import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface VaultDraft {
  title: string
  content: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { id: string; title: string; vaultPath?: string }[]
  vaultDraft?: VaultDraft
  mealRequest?: string
  timestamp: Date
}

/** Parse :::vault-draft fenced blocks from AI response */
function parseVaultDraft(text: string): { content: string; draft: VaultDraft | undefined } {
  const match = text.match(/:::vault-draft\s*\n##\s*(.+?)\n([\s\S]*?):::/)
  if (!match) return { content: text, draft: undefined }
  const title = match[1].trim()
  const draftContent = match[2].trim()
  // Remove the vault-draft block from the visible message
  const cleanContent = text.replace(/:::vault-draft\s*\n[\s\S]*?:::/, '').trim()
  return { content: cleanContent, draft: { title, content: draftContent } }
}

/** Parse :::meal-request fenced blocks from AI response */
export function parseMealRequest(text: string): { content: string; mealRequest: string | undefined } {
  const match = text.match(/:::meal-request\s*\n([\s\S]*?):::/)
  const body = match?.[1]?.trim()
  if (!body) return { content: text, mealRequest: undefined }
  const cleanContent = text.replace(/:::meal-request\s*\n[\s\S]*?:::/, '').trim()
  return { content: cleanContent, mealRequest: body }
}

export interface EntityContext {
  type: 'task' | 'contact' | 'project' | 'event' | 'routine'
  id: string
  name: string
}

export type ChatMode = 'chat' | 'guided_reflection'

export function useChat() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entityContext, setEntityContext] = useState<EntityContext | null>(null)
  const [mode, setMode] = useState<ChatMode>('chat')
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Track whether session needs saving (new messages since last save)
  const dirtyRef = useRef(false)

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !content.trim()) return

      // Add user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])
      setLoading(true)
      setError(null)
      dirtyRef.current = true

      try {
        // Get current session for auth
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No active session')

        // Build messages array for the API (exclude ids/timestamps)
        const apiMessages = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/symphony-chat`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: apiMessages,
              entityContext: entityContext ?? undefined,
              mode,
            }),
          }
        )

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Request failed' }))
          const detail = errData.details ? `: ${errData.details}` : ''
          throw new Error((errData.error || `HTTP ${response.status}`) + detail)
        }

        const data = await response.json()

        const { content: vaultStripped, draft } = parseVaultDraft(data.message)
        const { content: parsedContent, mealRequest } = parseMealRequest(vaultStripped)
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: parsedContent,
          sources: data.sources,
          vaultDraft: draft,
          mealRequest,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
      } finally {
        setLoading(false)
      }
    },
    [user, messages, entityContext, mode]
  )

  const clearChat = useCallback(() => {
    setMessages([])
    setError(null)
    setMode('chat')
    setSessionId(null)
    dirtyRef.current = false
  }, [])

  const updateEntityContext = useCallback((ctx: EntityContext | null) => {
    setEntityContext(ctx)
  }, [])

  const setGuidedReflection = useCallback(() => {
    setMode('guided_reflection')
  }, [])

  // Load a previous session's messages into the active chat
  const loadSession = useCallback((
    id: string,
    savedMessages: ChatMessage[],
    savedEntityContext: EntityContext | null,
    savedMode: ChatMode
  ) => {
    setSessionId(id)
    setMessages(savedMessages)
    setEntityContext(savedEntityContext)
    setMode(savedMode)
    setError(null)
    dirtyRef.current = false
  }, [])

  // Start a fresh chat (used when clicking "New chat" from history)
  const startNewChat = useCallback(() => {
    setSessionId(null)
    setMessages([])
    setEntityContext(null)
    setMode('chat')
    setError(null)
    dirtyRef.current = false
  }, [])

  return {
    messages,
    loading,
    error,
    entityContext,
    mode,
    sessionId,
    isDirty: dirtyRef,
    sendMessage,
    clearChat,
    updateEntityContext,
    setGuidedReflection,
    loadSession,
    startNewChat,
    setSessionId,
  }
}
