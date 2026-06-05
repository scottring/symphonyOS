import { useState, useCallback } from 'react'
import { streamSymphonyAgent, type AgentApiMessage } from '@/lib/agentStream'
import type { ChatMessage } from '@/types/chat'

// Tools that mutate task/project data. When the agent uses one, the app needs
// to refresh so the change shows without a page reload.
const WRITE_TOOLS = new Set([
  'symphony_create_task',
  'symphony_update_task',
  'symphony_complete_task',
  'symphony_create_project',
])

/**
 * Right-rail assistant scoped to Symphony. Talks to the `symphony-agent`
 * edge function, which runs an Anthropic tool-use loop over the user's own
 * Symphony data (RLS-scoped). Conversation is held in React state and sent
 * with each turn; there is no server-side session in v1.
 *
 * @param onMutate called after a turn in which the agent wrote data, so the
 *   caller can refetch (the task list is not realtime for external writes).
 */
export function useSymphonyAssistant(onMutate?: () => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toolActivity, setToolActivity] = useState<string[]>([])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    // Build the API history from prior turns + this one (before the placeholder).
    const apiMessages: AgentApiMessage[] = [
      ...messages
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: text.trim() },
    ]

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

    let didWrite = false
    await streamSymphonyAgent(apiMessages, {
      onText: appendText,
      onTool: (name) => {
        if (WRITE_TOOLS.has(name)) didWrite = true
        setToolActivity((prev) => [...prev, name])
      },
      onDone: (reply) => {
        // Fall back to the authoritative final reply if no text streamed.
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId && m.content.length === 0
            ? { ...m, content: reply } : m))
      },
      onError: (message) => setError(message),
    })

    if (didWrite) onMutate?.()
    setLoading(false)
  }, [loading, messages, onMutate])

  const resetSession = useCallback(() => {
    setMessages([])
    setError(null)
    setToolActivity([])
  }, [])

  return { messages, loading, error, toolActivity, sendMessage, resetSession }
}
