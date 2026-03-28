import { useState, useCallback, useEffect, useRef } from 'react'
import { agentChat, getAgentChatHistory, resetAgentSession, type AgentChatMessage } from '@/lib/openBrain'

const CHANNEL_ID = 'web:default'

export function useAgentChat() {
  const [messages, setMessages] = useState<AgentChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  // Load chat history on mount
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    getAgentChatHistory(CHANNEL_ID, 50).then((history) => {
      if (history && history.length > 0) {
        setMessages(history)
      }
    })
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    // Optimistically add user message
    const userMsg: AgentChatMessage = {
      role: 'user',
      content: text,
      timestamp: Math.floor(Date.now() / 1000),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    setError(null)

    try {
      const response = await agentChat(text, CHANNEL_ID)

      if (response) {
        const assistantMsg: AgentChatMessage = {
          role: 'assistant',
          content: response.reply,
          timestamp: Math.floor(Date.now() / 1000),
        }
        setMessages((prev) => [...prev, assistantMsg])
      } else {
        setError('Could not reach Open Brain. Is the Mac Mini online?')
      }
    } catch {
      setError('Failed to send message')
    } finally {
      setLoading(false)
    }
  }, [loading])

  const resetSession = useCallback(async () => {
    await resetAgentSession(CHANNEL_ID)
    setMessages([])
    setError(null)
  }, [])

  return {
    messages,
    loading,
    error,
    sendMessage,
    resetSession,
  }
}
