import type { WorkspaceContext } from '@/lib/workspace/context'
import type { ChangeCardNote, ChangeSet } from '@/lib/canvas/changeCard'
// src/lib/agentTurn.ts
//
// One turn of the Symphony agent, minus the React. Extracted from
// useSymphonyAssistant so the Discuss thread (useDiscussThread) can run the
// same turn — same write-tool detection, same source notes, same
// never-leave-the-bubble-empty rule — without a second copy of the streaming
// code drifting away from the first.

import { UNKNOWN_OUTCOME, type TurnOutcome } from '@/lib/turnOutcome'
import { streamSymphonyAgent, type AgentApiMessage, type AgentProposalItem, type AgentSourceNote, type AssistantTaskContext, type AttachmentMeta } from '@/lib/agentStream'

/** Tools that mutate task/project data. When the agent uses one, the app needs
 *  to refresh so the change shows without a page reload. */
export const WRITE_TOOLS = new Set([
  'symphony_create_plan_item',
  'symphony_link_plan_item',
  'symphony_update_intention',
  'symphony_create_task',
  'symphony_create_calendar_event',
  'symphony_update_task',
  'symphony_complete_task',
  'symphony_create_routine',
  'symphony_update_routine',
  'symphony_create_note',
  'symphony_set_meal',
  'symphony_create_contact',
  'symphony_update_contact',
  'symphony_create_list',
  'symphony_add_list_item',
  'symphony_check_list_item',
  'symphony_delete_list_item',
  'symphony_draft_email',
])

export interface AgentTurnHandlers {
  surface?: 'wall' | 'onboarding' | 'onboarding_activity'
  onPlanSaved?: (saved: { id: string; level: number; date: string }) => void
  onWorkspace?: (page:string,date?:string)=>void
  workspaceContext?: WorkspaceContext
  /** What became of the last change card, for the agent. */
  changeCard?: ChangeCardNote
  /** A streamed text delta. */
  onText?: (chunk: string) => void
  /** Every tool the agent used, write or read. */
  onTool?: (name: string) => void
  /** A write tool's reported outcome (only from agent builds that send it). */
  onToolResult?: (result: { name: string; ok: boolean; ids?: string[]; error?: string }) => void
  /** Suggestions to show as proposals, never written until kept. */
  onProposal?: (items: AgentProposalItem[]) => void
  onChangeSet?: (set: ChangeSet) => void
  onPoint?: (p: { dates: string[]; taskIds: string[] }) => void
  /** Reused when the same message is retried, for server-side de-duplication. */
  turnId?: string
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
  /** The server's verdict on what the turn did. Never absent: a stream that
   *  failed without one is 'unverified'. */
  outcome: TurnOutcome
  /** The server's id for this turn, for a problem report. No content. */
  requestId?: string
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
  let outcome: TurnOutcome | undefined
  let requestId: string | undefined
  // Set on a tool event, cleared on the next text delta. A tool call sits
  // between two text segments in the transcript (e.g. "Let me check." / tool
  // use / "Found it."); without a separator those segments run together into
  // one sentence ("Let me check.Found it.").
  let needsSeparatorBeforeNextText = false

  try {
    await streamSymphonyAgent(messages, {
      onText: (chunk) => {
        let out = chunk
        if (needsSeparatorBeforeNextText) {
          needsSeparatorBeforeNextText = false
          if (text.length > 0 && !/\s$/.test(text)) {
            out = `\n\n${chunk}`
          }
        }
        text += out
        handlers.onText?.(out)
      },
      onTool: (name) => {
        if (WRITE_TOOLS.has(name)) didWrite = true
        needsSeparatorBeforeNextText = true
        handlers.onTool?.(name)
      },
      onDone: (reply, _sessionId, replySources, serverOutcome, serverRequestId) => {
        outcome = serverOutcome
        requestId = serverRequestId

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
      onError: (message, serverOutcome, serverRequestId) => {
        streamError = message
        if (serverOutcome) outcome = serverOutcome
        if (serverRequestId) requestId = serverRequestId
        handlers.onError?.(message)
      },
      onToolResult: handlers.onToolResult,
      onProposal: handlers.onProposal,
      onChangeSet: handlers.onChangeSet,
      onPoint: handlers.onPoint,
      turnId: handlers.turnId,
      surface: handlers.surface,
      workspaceContext: handlers.workspaceContext,
      changeCard: handlers.changeCard,
      onWorkspace: handlers.onWorkspace,
      onPlanSaved: handlers.onPlanSaved,
      attachment: handlers.attachment,
      currentMemberId: handlers.currentMemberId,
      taskContext: handlers.taskContext,
    })
  } catch {
    streamError = 'Connection dropped'
    handlers.onError?.('The assistant connection dropped.')
  }

  if (text.length === 0) {
    text = !streamError && outcome?.state === 'proposed'
      ? 'The updated plan is ready to review. Nothing is saved until you approve.'
      : !streamError && outcome?.say?.trim() ? outcome.say : streamError
      ? `Something went wrong on my end (${streamError}). Please try that again.`
      : 'Something went wrong on my end — please try that again.'
    handlers.onFallbackText?.(text)
  }

  // No verdict from the server (an older build, or a dropped stream): a
  // turn that used a write tool is unverified, one that did not is answered
  // or failed. Never 'saved' on a guess.
  const fallback: TurnOutcome = streamError
    ? (didWrite ? UNKNOWN_OUTCOME : { state: 'failed', writes: [], say: 'Nothing saved.' })
    : didWrite ? UNKNOWN_OUTCOME : { state: 'answered', writes: [], say: 'Nothing was changed.' }
  return { text, sources, didWrite, error: streamError, outcome: outcome ?? fallback, ...(requestId ? { requestId } : {}) }
}
