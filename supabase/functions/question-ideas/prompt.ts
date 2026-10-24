// Ideas for a question Symphony asked (2026-10-24). The person taps the
// lightbulb beside one of Symphony's questions and gets a few answers they
// could give, to tap into their reply. Asked for, never pushed: Symphony's
// questions stay plain, and nothing here ranks or recommends.

export const MAX_QUESTION = 500
export const MAX_TURNS = 10
export const MAX_TURN_CHARS = 2000

export interface Turn { role: 'user' | 'assistant'; content: string }
export interface Idea { answer: string; why: string }

export const IDEAS_TOOL = {
  name: 'give_ideas',
  description: 'Give the ideas for the question.',
  input_schema: {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            answer: { type: 'string', description: 'The answer as the person would type it, first person, plain words.' },
            why: { type: 'string', description: 'What sets this one apart, at most 12 words.' },
          },
          required: ['answer', 'why'],
        },
      },
    },
    required: ['ideas'],
  },
} as const

export function buildIdeasPrompt(question: string, conversation: Turn[], today: string): { system: string; user: string } {
  const transcript = conversation
    .map((t) => `${t.role === 'user' ? 'PERSON' : 'SYMPHONY'}: ${t.content.slice(0, MAX_TURN_CHARS)}`)
    .join('\n\n')
  return {
    system: [
      'Symphony, a planning app, asked the person a question while helping them set something up. They tapped a lightbulb beside it to see ideas for how they might answer.',
      'Give three ideas: answers they could give, each a genuinely different approach, written the way they would type it (first person, plain words, no markdown).',
      'A question about steps gets a short ordered list in one line, steps separated by semicolons (at most 6). A question about a day or time gets a specific day and time.',
      'Use only what the conversation says about them. Never invent people, names, places or commitments they did not mention.',
      'These are options, not advice: do not rank them, call one best, or add anything beyond the ideas. Keep each answer under 40 words.',
      `Today is ${today}.`,
    ].join(' '),
    user: `THE CONVERSATION SO FAR:\n${transcript || '(nothing before the question)'}\n\nTHE QUESTION THEY WANT IDEAS FOR:\n${question.slice(0, MAX_QUESTION)}`,
  }
}

/** The request body, or the 400 message for it. */
export function parseIdeasBody(body: unknown): { question: string; conversation: Turn[]; today: string } | { error: string } {
  const b = body as { question?: unknown; conversation?: unknown; today?: unknown } | null
  if (!b || typeof b !== 'object' || typeof b.question !== 'string') return { error: 'question must be a string' }
  const question = b.question.trim()
  if (!question || question.length > MAX_QUESTION) return { error: `question required (≤${MAX_QUESTION} characters)` }
  const turns = Array.isArray(b.conversation) ? b.conversation : []
  const conversation = turns
    .filter((t): t is Turn => !!t && typeof t === 'object'
      && ((t as Turn).role === 'user' || (t as Turn).role === 'assistant')
      && typeof (t as Turn).content === 'string' && (t as Turn).content.trim() !== '')
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_TURN_CHARS) }))
  const today = typeof b.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.today) ? b.today : new Date().toISOString().slice(0, 10)
  return { question, conversation, today }
}

interface ModelResponse { content?: { type: string; name?: string; input?: unknown }[]; stop_reason?: string }

/** The ideas from a forced tool call; null when cut off or malformed. */
export function ideasFromResponse(data: ModelResponse): Idea[] | null {
  if (data.stop_reason === 'max_tokens') return null
  const call = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === IDEAS_TOOL.name)
  const raw = (call?.input as { ideas?: unknown } | undefined)?.ideas
  if (!Array.isArray(raw)) return null
  const ideas = raw
    .filter((i): i is Idea => !!i && typeof (i as Idea).answer === 'string' && (i as Idea).answer.trim() !== '')
    .slice(0, 4)
    .map((i) => ({ answer: i.answer.trim(), why: typeof i.why === 'string' ? i.why.trim() : '' }))
  return ideas.length ? ideas : null
}
