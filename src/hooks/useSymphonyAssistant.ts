import { useState, useCallback, useEffect, useRef } from 'react'
import { getAgentChatHistory, resetAgentSession } from '@/lib/openBrain'
import { streamAgentChat } from '@/lib/agentStream'
import type { ChatMessage } from '@/hooks/useChat'

const CHANNEL_ID = 'symphony:web'

export function useSymphonyAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toolActivity, setToolActivity] = useState<string[]>([])
  const loadedRef = useRef(false)

  // Load prior history (engine SQLite) on mount, adapted to ChatMessage shape.
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    getAgentChatHistory(CHANNEL_ID, 50).then((history) => {
      if (history && history.length > 0) {
        setMessages(history.map((m, i) => ({
          id: `hist-${i}`,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp * 1000),
        })))
      }
    })
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }
    const assistantId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', timestamp: new Date() },
    ])
    setLoading(true)
    setError(null)
    setToolActivity([])

    const appendText = (chunk: string) =>
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: m.content + chunk } : m))

    await streamAgentChat(text.trim(), CHANNEL_ID, {
      onText: appendText,
      onTool: (name) => setToolActivity((prev) => [...prev, name]),
      onDone: (reply) => {
        // Prefer the authoritative final reply if streamed text was empty.
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId && m.content.length === 0
            ? { ...m, content: reply } : m))
      },
      onError: (message) => setError(message),
    })

    setLoading(false)
  }, [loading])

  const resetSession = useCallback(async () => {
    await resetAgentSession(CHANNEL_ID)
    setMessages([])
    setError(null)
    setToolActivity([])
  }, [])

  return { messages, loading, error, toolActivity, sendMessage, resetSession }
}
