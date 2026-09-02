// src/lib/agentTurn.ts
//
// One turn of the Symphony agent, minus the React. Extracted from
// useSymphonyAssistant so the Discuss thread (useDiscussThread) can run the
// same turn — same write-tool detection, same source notes, same
// never-leave-the-bubble-empty rule — without a second copy of the streaming
// code drifting away from the first.

import { streamSymphonyAgent, type AgentApiMessage, type AgentSourceNote, type AssistantTaskContext, type AttachmentMeta } from '@/lib/agentStream'

/** Tools that mutate task/project data. When the agent uses one, the app needs
 *  to refresh so the change shows without a page reload. */
export const WRITE_TOOLS = new Set([
  'symphony_create_task',
  'symphony_create_calendar_event',
  'symphony_update_task',
  'symphony_complete_task',
  'symphony_delete_task',
  'symphony_create_project',
  'symphony_update_project',
  'symphony_create_routine',
  'symphony_update_routine',
  'symphony_delete_routine',
  'symphony_create_note',
  'symphony_attach_source',
])

export interface AgentTurnHandlers {
  /** A streamed text delta. */
  onText?: (chunk: string) => void
  /** Every tool the agent used, write or read. */
  onTool?: (name: string) => void
  /** The authoritative final reply, only when nothing streamed. */
  onReplyFallback?: (reply: string) => void
  /** Note sources cited by this turn. */
  onSources?: (sources: AgentSourceNote[]) => void
  /** A user-facing failure message. */
  onError?: (message: string) => void
  /** The apology text substituted when the turn produced no reply at all. */
  onFallbackText?: (text: string) => void
  attachment?: AttachmentMeta
  currentMemberId?: string
  taskContext?: AssistantTaskContext
}

export interface AgentTurnResult {
  /** The reply to store. Never empty — see onFallbackText. */
  text: string
  sources?: AgentSourceNote[]
  /** True when the agent called a tool that writes Symphony data. */
  didWrite: boolean
  /** The raw stream failure, when there was one. */
  error: string | null
}

/**
 * Run one agent turn over `messages` and report what came back.
 *
 * Never resolves with an empty `text`: an invisible failure reads as the
 * assistant ignoring the message, so the user re-sends and double-posts (and a
 * silent tool-only turn looks identical). Always say something.
 */
export async function runAgentTurn(
  messages: AgentApiMessage[],
  handlers: AgentTurnHandlers = {},
): Promise<AgentTurnResult> {
  let text = ''
  let sources: AgentSourceNote[] | undefined
  let didWrite = false
  let streamError: string | null = null

  try {
    await streamSymphonyAgent(messages, {
      onText: (chunk) => {
        text += chunk
        handlers.onText?.(chunk)
      },
      onTool: (name) => {
        if (WRITE_TOOLS.has(name)) didWrite = true
        handlers.onTool?.(name)
      },
      onDone: (reply, _sessionId, replySources) => {
        // Fall back to the authoritative final reply if no text streamed.
        if (text.length === 0) {
          text = reply
          handlers.onReplyFallback?.(reply)
        }
        if (replySources && replySources.length > 0) {
          sources = replySources
          handlers.onSources?.(replySources)
        }
      },
      onError: (message) => {
        streamError = message
        handlers.onError?.(message)
      },
      attachment: handlers.attachment,
      currentMemberId: handlers.currentMemberId,
      taskContext: handlers.taskContext,
    })
  } catch {
    streamError = 'Connection dropped'
    handlers.onError?.('The assistant connection dropped.')
  }

  if (text.length === 0) {
    text = streamError
      ? `Something went wrong on my end (${streamError}). Please try that again.`
      : 'Something went wrong on my end — please try that again.'
    handlers.onFallbackText?.(text)
  }

  return { text, sources, didWrite, error: streamError }
}
