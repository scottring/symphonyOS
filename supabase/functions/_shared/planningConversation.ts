// supabase/functions/_shared/planningConversation.ts
//
// The pure core of planning-conversation: what a request may carry, the
// prompt, the one tool the model answers through, and what a reply may
// propose. No I/O here, so it is tested directly (planningConversation.test.ts).
//
// The contract, deliberately small:
//  - STATELESS. The client sends the few turns on screen; nothing is stored.
//  - NO DATABASE ACCESS. The function never reads or writes plans; the client
//    sends only what is on the person's screen, with goals named by opaque
//    refs ("g1"), never row ids.
//  - PROPOSALS ONLY. A reply is words plus at most a few proposed lines. The
//    client shows each with Add / Dismiss; an added line joins the draft, and
//    only the person's Save writes it, through the app's own writers.
//  - BOUNDED. Input size, turns, output tokens and proposals are capped here.

export const HORIZONS = ['year', 'season', 'month', 'week', 'today'] as const
export type Horizon = typeof HORIZONS[number]

export const LIMITS = {
  goals: 12,
  lines: 60,
  lineChars: 140,
  turns: 8,
  turnChars: 600,
  /** Everything the client sends, as JSON. */
  requestChars: 12_000,
  replyChars: 700,
  proposals: 5,
  maxTokens: 700,
} as const

export interface GuideGoal { ref: string; title: string }
export interface GuideLine { goal: string | null; horizon: Horizon; text: string; existing: boolean }
export interface GuideTurn { role: 'user' | 'assistant'; text: string }
export interface GuideRequest {
  horizon: Horizon
  labels: Record<Horizon, string>
  goals: GuideGoal[]
  lines: GuideLine[]
  focus: string | null
  turns: GuideTurn[]
}
export interface GuideProposal { level: Horizon; goal: string | null; text: string }
export interface GuideReply { reply: string; proposals: GuideProposal[] }

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string; status: number }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const isHorizon = (v: unknown): v is Horizon => typeof v === 'string' && (HORIZONS as readonly string[]).includes(v)
const REF = /^g\d{1,2}$/

/** What a request may carry — anything else is refused, not trimmed into shape. */
export function parseRequest(raw: string): Parsed<GuideRequest> {
  if (raw.length > LIMITS.requestChars) return { ok: false, error: 'Too much to send at once', status: 413 }
  let b: Record<string, unknown>
  try { b = JSON.parse(raw) } catch { return { ok: false, error: 'Invalid JSON body', status: 400 } }
  if (!b || typeof b !== 'object') return { ok: false, error: 'Invalid body', status: 400 }
  if (!isHorizon(b.horizon)) return { ok: false, error: 'Unknown horizon', status: 400 }
  const labelsIn = (b.labels ?? {}) as Record<string, unknown>
  const labels = Object.fromEntries(HORIZONS.map((h) => [h, str(labelsIn[h], 40)])) as Record<Horizon, string>
  if (!Array.isArray(b.goals) || b.goals.length > LIMITS.goals) return { ok: false, error: 'Too many goals', status: 400 }
  const goals: GuideGoal[] = []
  for (const g of b.goals as Record<string, unknown>[]) {
    const ref = str(g?.ref, 4), title = str(g?.title, LIMITS.lineChars)
    if (!REF.test(ref) || !title || goals.some((x) => x.ref === ref)) return { ok: false, error: 'Invalid goal', status: 400 }
    goals.push({ ref, title })
  }
  const refs = new Set(goals.map((g) => g.ref))
  if (!Array.isArray(b.lines) || b.lines.length > LIMITS.lines) return { ok: false, error: 'Too many lines', status: 400 }
  const lines: GuideLine[] = []
  for (const l of b.lines as Record<string, unknown>[]) {
    const goal = l?.goal == null ? null : str(l.goal, 4)
    const text = str(l?.text, LIMITS.lineChars)
    if ((goal !== null && !refs.has(goal)) || !isHorizon(l?.horizon) || !text) return { ok: false, error: 'Invalid line', status: 400 }
    lines.push({ goal, horizon: l.horizon, text, existing: l.existing === true })
  }
  const focus = b.focus == null ? null : str(b.focus, 4)
  if (focus !== null && !refs.has(focus)) return { ok: false, error: 'Invalid focus', status: 400 }
  if (!Array.isArray(b.turns) || b.turns.length === 0 || b.turns.length > LIMITS.turns) return { ok: false, error: 'Invalid turns', status: 400 }
  const turns: GuideTurn[] = []
  for (const t of b.turns as Record<string, unknown>[]) {
    const text = str(t?.text, LIMITS.turnChars)
    if ((t?.role !== 'user' && t?.role !== 'assistant') || !text) return { ok: false, error: 'Invalid turn', status: 400 }
    turns.push({ role: t.role, text })
  }
  if (turns[turns.length - 1].role !== 'user') return { ok: false, error: 'The last turn must be the person’s', status: 400 }
  return { ok: true, value: { horizon: b.horizon, labels, goals, lines, focus, turns } }
}

const LEVEL_WORD: Record<Horizon, string> = {
  year: 'a goal for the year', season: 'a season line (what is true by the end of the season)',
  month: 'a month line (a priority for the month)', week: 'a task for this week', today: 'something to do today',
}

export function systemPrompt(r: GuideRequest): string {
  return `You are the planning guide in Symphony, a personal and family planning app. You help one person fill in their plan one horizon at a time — year, season, month, week, today — across ALL their goals together, never one goal all the way down.

How you work:
- Short, warm, plain language. At most three sentences, then at most one question.
- Ask about the horizon on screen (${r.horizon}: ${r.labels[r.horizon] || r.horizon}). Do not jump to another horizon, and propose ONLY lines at this horizon (level "${r.horizon}").
- When the person says something that belongs on the plan, PROPOSE it as a line — ${LEVEL_WORD[r.horizon]} — in their words, tidied, under 12 words. Never invent specifics they did not say (amounts, dates, names).
- A goal may have several lines. Propose a new line rather than rewriting one already there.
- Use only the goals and lines given. A proposal for a goal names its ref (e.g. "g2"); use null when it serves no goal.
- You cannot save anything. The person adds what they want and saves it themselves; never say you have added or saved anything.
- Nothing has to move every period. "Not this ${r.horizon === 'today' ? 'time' : r.horizon}" is a fine answer.
- Answer only through the propose tool.`
}

/** What is on screen, as plain text for the model. */
export function contextText(r: GuideRequest): string {
  const goal = (ref: string | null) => (ref ? `${ref} "${r.goals.find((g) => g.ref === ref)?.title ?? ''}"` : 'no goal')
  const goals = r.goals.length ? r.goals.map((g) => `- ${g.ref}: ${g.title}`).join('\n') : '- (none yet)'
  const byLevel = HORIZONS.filter((h) => h !== 'year').map((h) => {
    const ls = r.lines.filter((l) => l.horizon === h)
    return ls.length ? `${h} (${r.labels[h] || h}):\n${ls.map((l) => `- ${l.text} — for ${goal(l.goal)}${l.existing ? ' (already on the plan)' : ' (new, not saved)'}`).join('\n')}` : ''
  }).filter(Boolean).join('\n')
  return `Year ${r.labels.year} goals:\n${goals}\n\n${byLevel || 'No lines yet.'}\n\nOn screen now: ${r.horizon}${r.focus ? `, asking about ${goal(r.focus)}` : ''}.`
}

export const PROPOSE_TOOL = {
  name: 'propose',
  description: 'Reply to the person and, optionally, propose lines for their plan. Proposals are shown for the person to add or dismiss; nothing is saved by this tool.',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'What you say to the person: at most three short sentences and one question.' },
      proposals: {
        type: 'array',
        maxItems: LIMITS.proposals,
        items: {
          type: 'object',
          properties: {
            level: { type: 'string', enum: [...HORIZONS], description: 'Always the horizon on screen.' },
            goal: { type: ['string', 'null'], description: 'The goal ref this line serves, e.g. "g2", or null.' },
            text: { type: 'string', description: 'The line, in the person’s words, under 12 words.' },
          },
          required: ['level', 'goal', 'text'],
        },
      },
    },
    required: ['reply', 'proposals'],
  },
} as const

/** The model's tool input, held to the contract: only the horizon on screen,
 *  only goal refs that were sent (or none), bounded text, few proposals.
 *  A proposal outside that is dropped — never re-pointed. */
export function parseToolInput(input: unknown, r: GuideRequest): GuideReply | null {
  if (!input || typeof input !== 'object') return null
  const i = input as Record<string, unknown>
  const reply = str(i.reply, LIMITS.replyChars)
  if (!reply) return null
  const refs = new Set(r.goals.map((g) => g.ref))
  const seen = new Set<string>()
  const proposals: GuideProposal[] = []
  for (const p of Array.isArray(i.proposals) ? i.proposals as Record<string, unknown>[] : []) {
    const text = str(p?.text, LIMITS.lineChars)
    if (!text || p?.level !== r.horizon) continue
    if (p.goal != null && (typeof p.goal !== 'string' || !refs.has(p.goal))) continue
    const goal = (p.goal as string | null | undefined) ?? null
    const key = `${p.level}|${goal}|${text.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    proposals.push({ level: r.horizon, goal, text })
    if (proposals.length >= LIMITS.proposals) break
  }
  return { reply, proposals }
}

/** The Messages API body: bounded, one tool, the tool required. */
export function messagesBody(r: GuideRequest, model: string) {
  const turns = r.turns.map((t) => ({ role: t.role, content: t.text }))
  // The screen rides with the person's latest turn, so the history stays as said.
  const last = turns[turns.length - 1]
  last.content = `${contextText(r)}\n\nThe person says: ${last.content}`
  // The Messages API wants the first turn from the person.
  while (turns.length && turns[0].role !== 'user') turns.shift()
  return {
    model,
    max_tokens: LIMITS.maxTokens,
    system: systemPrompt(r),
    tools: [PROPOSE_TOOL],
    tool_choice: { type: 'tool', name: PROPOSE_TOOL.name },
    messages: turns,
  }
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5'
