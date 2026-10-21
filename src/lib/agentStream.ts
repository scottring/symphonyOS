import type { WorkspaceContext } from '@/lib/workspace/context'
import { parseTurnOutcome, type TurnOutcome } from '@/lib/turnOutcome'
import type { ChangeCardNote, ChangeSet } from '@/lib/canvas/changeCard'
import { supabase } from '@/lib/supabase'
import { explainContext } from '@/lib/explain/pageGuides'
import { parseSteps } from '@/lib/explain/steps'
import { requestShow } from '@/lib/explain/showSignal'

export interface AgentSourceNote { id: string; title: string; vaultPath?: string }

/** Something Symphony suggests rather than does: shown dashed on the canvas
 *  until the person keeps it. `level` is the planning horizon (0 year
 *  intention … 3 week action); `parentId` an existing item it would sit under. */
export interface AgentProposalItem {
  key: string
  title: string
  level: 0 | 1 | 2 | 3
  parentId?: string | null
  /** Set: a suggestion to link this existing item under parentId. */
  itemId?: string
  periodStart?: string
  reason?: string
}

export type AgentStreamEvent =
  | { type: 'plan_saved'; id: string; level: number; date: string }
  | { type: 'workspace'; page: string; date?: string }
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'tool_result'; name: string; ok: boolean; ids?: string[]; error?: string }
  | { type: 'proposal'; items: AgentProposalItem[] }
  | { type: 'change_set'; set: ChangeSet }
  | { type: 'point'; dates: string[]; taskIds: string[] }
  | { type: 'show'; steps: unknown }
  | { type: 'done'; reply: string; sessionId: string | null; sources?: AgentSourceNote[]; outcome?: unknown; requestId?: string }
  | { type: 'error'; message: string; outcome?: unknown; requestId?: string }

/**
 * Parse a growing SSE buffer. Returns the complete events found and the
 * leftover (incomplete) tail to prepend to the next chunk. Pure + testable.
 */
export function parseSSEChunk(buffer: string): { events: AgentStreamEvent[]; rest: string } {
  const frames = buffer.split('\n\n')
  const rest = frames.pop() ?? ''
  const events: AgentStreamEvent[] = []
  for (const frame of frames) {
    const line = frame.trim()
    if (!line.startsWith('data:')) continue
    const json = line.slice(line.indexOf(':') + 1).trim()
    try {
      events.push(JSON.parse(json) as AgentStreamEvent)
    } catch {
      // skip malformed frame
    }
  }
  return { events, rest }
}

export interface AttachmentMeta {
  storagePath: string
  fileName: string
  fileType: string
  fileSize: number
}

/** The task or routine a conversation is about. Sent to the edge fn, which
 *  injects it as context so the agent can help make the item doable without
 *  the user re-describing it. */
export interface AssistantTaskContext {
  id: string
  title: string
  /** Defaults to 'task' when omitted. */
  kind?: 'task' | 'routine'
  notes?: string | null
  projectName?: string | null
}

/** The planning session a conversation is happening inside. Sent to the edge
 *  fn, which injects it as context so the guide can coach the current step —
 *  what's on the list, what the level above holds — without the user
 *  re-describing any of it. All lists are titles only (small + fast). */
export interface AssistantSessionContext {
  /** 'annual' | 'seasonal' | 'monthly' | 'weekly' | 'daily' */
  horizon: string
  periodLabel: string
  stepId: string
  stepTitle: string
  /** This step's bucket, when it reads/writes one ('quarter', 'month', …). */
  bucket?: string
  /** Open items on this horizon's list right now. */
  listTitles?: string[]
  /** The level above, for breaking big items into level-sized moves. */
  aboveTitles?: string[]
  /** Active year goals (seasonal sessions look at these). */
  goalNames?: string[]
}

export interface StreamHandlers {
  onPlanSaved?: (saved: { id: string; level: number; date: string }) => void
  onWorkspace?: (page:string,date?:string)=>void
  workspaceContext?: WorkspaceContext
  /** What became of the last change card (pending, approved or dismissed). */
  changeCard?: ChangeCardNote
  onText?: (text: string) => void
  onTool?: (name: string) => void
  /** A write tool's outcome, when the server reports it (newer agent builds). */
  onToolResult?: (result: { name: string; ok: boolean; ids?: string[]; error?: string }) => void
  onProposal?: (items: AgentProposalItem[]) => void
  onChangeSet?: (set: ChangeSet) => void
  onPoint?: (p: { dates: string[]; taskIds: string[] }) => void
  /** Stable per user message. A resent turn reuses it so the server can
   *  recognise writes it already made instead of making them twice. */
  turnId?: string
  onSession?: (sessionId: string) => void
  onDone?: (reply: string, sessionId: string | null, sources?: AgentSourceNote[], outcome?: TurnOutcome, requestId?: string) => void
  /** `outcome` carries the writes made before the failure, when the server got that far. */
  onError?: (message: string, outcome?: TurnOutcome, requestId?: string) => void
  attachment?: AttachmentMeta
  /** The caller's own family-member id, so the agent can assign personal
   *  routines to them (otherwise they're unassigned and the Today "my tasks"
   *  filter hides them). */
  currentMemberId?: string
  /** When set, the whole conversation is scoped to this task. */
  taskContext?: AssistantTaskContext
  /** When set, the whole conversation is scoped to this planning session. */
  sessionContext?: AssistantSessionContext
  /** 'wall': the kitchen wall — the agent reads only the family layer and
   *  proposes every change (supabase/functions/symphony-agent/wallMode.ts). */
  surface?: 'wall' | 'onboarding' | 'onboarding_activity'
  /** The wall's "Help me plan the week": the days being planned (YYYY-MM-DD). */
  wallPlan?: { from: string; to: string }
  /** Another deployed copy of the agent function (e.g. a test copy). */
  functionName?: string
  /** Abort the request (the wall's timeout): the server's stream closes and
   *  its next tool send fails, so a turn that outlived the listener stops
   *  writing instead of finishing unseen. */
  signal?: AbortSignal
}

export type AgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'document'; source: { type: 'url'; url: string } }

export interface AgentApiMessage {
  role: 'user' | 'assistant'
  content: string | AgentContentBlock[]
}

/** The agent edge function's name. A preview build may set VITE_AGENT_FUNCTION
 *  to a separately deployed test copy; anything malformed falls back to the live one. */
export function agentFunctionName(): string {
  const name = import.meta.env.VITE_AGENT_FUNCTION
  return typeof name === 'string' && /^[a-z0-9-]+$/.test(name) ? name : 'symphony-agent'
}

/** The voice edge function's name. A preview build may set VITE_VOICE_FUNCTION
 *  to a separately deployed test copy; anything malformed falls back to the live one. */
export function voiceFunctionName(): string {
  const name = import.meta.env.VITE_VOICE_FUNCTION
  return typeof name === 'string' && /^[a-z0-9-]+$/.test(name) ? name : 'workspace-voice'
}

/**
 * Stream the Symphony agent edge function for one conversation turn.
 * Sends the full message history; the function verifies the caller's JWT
 * and runs all tool queries RLS-scoped to that user.
 */
/** Why the agent refused, in the person's words: the AI allowance (429/503
 *  with an `ai_*` code, from _shared/aiUsage.ts) says so and when it resets;
 *  an expired session says so; anything else is "offline". Never the raw body. */
export async function describeRefusal(res: { status: number; text?: () => Promise<string> }): Promise<string> {
  if (res.status === 401) return 'Session expired'
  try {
    const body = JSON.parse(await (res.text?.() ?? Promise.resolve(''))) as { error?: unknown; code?: unknown }
    if (typeof body?.code === 'string' && body.code.startsWith('ai_') && typeof body.error === 'string' && body.error.trim()) return body.error.trim()
  } catch { /* not JSON */ }
  return 'Assistant offline'
}

export async function streamSymphonyAgent(
  messages: AgentApiMessage[],
  handlers: StreamHandlers,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    handlers.onError?.('Not signed in')
    return
  }

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${handlers.functionName && /^[a-z0-9-]+$/.test(handlers.functionName) ? handlers.functionName : agentFunctionName()}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        ...(handlers.workspaceContext ? { workspaceContext: explainContext(handlers.workspaceContext) } : {}),
        ...(handlers.changeCard ? { changeCard: handlers.changeCard } : {}),
        ...(handlers.attachment ? { attachment: handlers.attachment } : {}),
        ...(handlers.currentMemberId ? { currentMemberId: handlers.currentMemberId } : {}),
        ...(handlers.taskContext ? { taskContext: handlers.taskContext } : {}),
        ...(handlers.sessionContext ? { sessionContext: handlers.sessionContext } : {}),
        ...(handlers.turnId ? { turnId: handlers.turnId } : {}),
        ...(handlers.surface ? { surface: handlers.surface } : {}),
        ...(handlers.wallPlan ? { wallPlan: handlers.wallPlan } : {}),
      }),
      ...(handlers.signal ? { signal: handlers.signal } : {}),
    },
  )

  if (!res.ok || !res.body) {
    handlers.onError?.(await describeRefusal(res))
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSSEChunk(buffer)
    buffer = rest
    for (const ev of events) {
      if (ev.type === 'plan_saved') handlers.onPlanSaved?.(ev)
      else if (ev.type === 'workspace') handlers.onWorkspace?.(ev.page,ev.date)
      else if (ev.type === 'show') requestShow(parseSteps(ev), 'chat')
      else if (ev.type === 'text') handlers.onText?.(ev.text)
      else if (ev.type === 'tool') handlers.onTool?.(ev.name)
      else if (ev.type === 'tool_result') handlers.onToolResult?.({ name: ev.name, ok: ev.ok, ids: ev.ids, error: ev.error })
      else if (ev.type === 'proposal') handlers.onProposal?.(Array.isArray(ev.items) ? ev.items : [])
      else if (ev.type === 'change_set') { if (ev.set && Array.isArray(ev.set.ops)) handlers.onChangeSet?.(ev.set) }
      else if (ev.type === 'point') handlers.onPoint?.({ dates: Array.isArray(ev.dates) ? ev.dates : [], taskIds: Array.isArray(ev.taskIds) ? ev.taskIds : [] })
      else if (ev.type === 'session') handlers.onSession?.(ev.sessionId)
      else if (ev.type === 'done') handlers.onDone?.(ev.reply, ev.sessionId, ev.sources, parseTurnOutcome(ev.outcome), typeof ev.requestId === 'string' ? ev.requestId : undefined)
      else if (ev.type === 'error') handlers.onError?.(ev.message, parseTurnOutcome(ev.outcome), typeof ev.requestId === 'string' ? ev.requestId : undefined)
    }
  }
}
