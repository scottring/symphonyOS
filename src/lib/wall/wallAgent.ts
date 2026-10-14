// The full Symphony agent, asked from the kitchen wall (Kitchen wall v2,
// stage 2). Same edge function and stream as the desktop conversation
// (src/lib/agentStream.ts), with `surface: 'wall'`: the agent reads only the
// family layer, answers in a spoken sentence or two, and turns every change
// into a change card for a grown-up to approve. The only things it saves
// itself are a family-list line and a scratchpad note / talk-about, reported
// in `saved` so the wall can offer Undo.
//
// Not wired into the UI yet (stage 3).

import { streamSymphonyAgent, type AgentApiMessage } from '@/lib/agentStream'
import type { ChangeCardNote, ChangeSet } from '@/lib/canvas/changeCard'

export interface WallTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface WallAgentOptions {
  /** What became of the last change card, so the next turn knows. */
  changeCard?: ChangeCardNote
  /** The speaker's family-member id, when the wall knows who is talking. */
  currentMemberId?: string
  /** Stable per spoken request; a retry reuses it. */
  turnId?: string
  /** Each piece of the answer as it streams. */
  onText?: (text: string) => void
  /** Another deployed copy of the agent (a preview build's test copy). */
  functionName?: string
}

export interface WallAgentReply {
  /** The spoken answer. */
  reply: string
  /** The change card to show for approval, when the request changes plans. */
  changeSet?: ChangeSet
  /** Days and tasks the answer is about, to light up on the wall. */
  pointed?: { dates: string[]; taskIds: string[] }
  /** What the agent saved itself (a list line, a scratchpad note), for Undo. */
  saved?: { name: string; ids: string[] }[]
  /** The conversation so far, including this turn: pass it back next time. */
  history: WallTurn[]
}

/** The wall's agent function: VITE_WALL_AGENT_FUNCTION in a preview build
 *  (the test copy), else the live agent. Anything malformed is ignored. */
export function wallAgentFunctionName(): string | undefined {
  const name = import.meta.env.VITE_WALL_AGENT_FUNCTION
  return typeof name === 'string' && /^[a-z0-9-]+$/.test(name) ? name : undefined
}

/** Keep the conversation short: a kitchen exchange, not a planning session. */
export const MAX_HISTORY_TURNS = 12

/** History the API accepts: alternating, starting with the person, non-empty. */
export function apiMessages(history: readonly WallTurn[], text: string): AgentApiMessage[] {
  const turns = history.filter((t) => (t.role === 'user' || t.role === 'assistant') && t.content.trim()).slice(-MAX_HISTORY_TURNS)
  const out: AgentApiMessage[] = []
  for (const t of turns) {
    const last = out.at(-1)
    if (last && last.role === t.role) last.content = `${last.content}\n${t.content}`
    else out.push({ role: t.role, content: t.content })
  }
  while (out.length && out[0].role !== 'user') out.shift()
  const lastTurn = out.at(-1)
  if (lastTurn?.role === 'user') lastTurn.content = `${lastTurn.content}\n${text}`
  else out.push({ role: 'user', content: text })
  return out
}

/**
 * Ask the agent one thing from the wall. Resolves with the spoken reply and
 * whatever it proposed or pointed at; rejects when the agent could not answer.
 */
export async function askWallAgent(text: string, history: readonly WallTurn[] = [], opts: WallAgentOptions = {}): Promise<WallAgentReply> {
  const question = text.trim()
  if (!question) throw new Error('Nothing was asked')
  // Filled by the stream's callbacks.
  const got: {
    streamed: string
    /** Only the words after the last tool call: the answer, not the preamble. */
    afterTool: string
    reply: string | null
    changeSet?: ChangeSet
    pointed?: { dates: string[]; taskIds: string[] }
    failure: string | null
    saved: { name: string; ids: string[] }[]
  } = { streamed: '', afterTool: '', reply: null, failure: null, saved: [] }

  await streamSymphonyAgent(apiMessages(history, question), {
    surface: 'wall',
    functionName: opts.functionName ?? wallAgentFunctionName(),
    ...(opts.changeCard ? { changeCard: opts.changeCard } : {}),
    ...(opts.currentMemberId ? { currentMemberId: opts.currentMemberId } : {}),
    ...(opts.turnId ? { turnId: opts.turnId } : {}),
    onText: (t) => { got.streamed += t; got.afterTool += t; opts.onText?.(t) },
    onTool: () => { got.afterTool = '' },
    onChangeSet: (set) => { got.changeSet = set },
    onPoint: (p) => { got.pointed = p.dates.length || p.taskIds.length ? p : undefined },
    onToolResult: (r) => { if (r.ok && r.ids?.length) got.saved.push({ name: r.name, ids: r.ids }) },
    onDone: (reply) => { got.reply = reply ?? '' },
    onError: (message) => { got.failure = message },
  })

  if (got.failure) throw new Error(got.failure)
  if (got.reply === null) throw new Error('No answer from Symphony')
  const { changeSet, pointed, saved } = got
  // A card with no words still needs a sentence to speak.
  // Spoken: the closing words, not "Let me check…" said before a tool ran.
  const reply = got.afterTool.trim() || (got.reply || got.streamed).trim() || (changeSet ? 'That’s on the card for a grown-up to approve.' : '')
  if (!reply) throw new Error('No answer from Symphony')
  return {
    reply,
    ...(changeSet ? { changeSet } : {}),
    ...(pointed ? { pointed } : {}),
    ...(saved.length ? { saved } : {}),
    history: [...history, { role: 'user', content: question }, { role: 'assistant', content: reply }],
  }
}
