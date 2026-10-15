// The kitchen wall's spoken question → a short spoken answer, from what the
// wall already shows. No tools, no database: the wall sends its own snapshot
// (src/lib/wall/voice/wallSnapshot.ts), and the answer may use only that.
import { ASSISTANT_PERSONALITY, RESULT_LANGUAGE_RULES } from '../_shared/assistantExperience.ts'

export const MAX_QUESTION = 300
export const MAX_SNAPSHOT = 6000

export function buildWallPrompt(question: string, snapshot: string): { system: string; user: string } {
  return {
    system: [
      ASSISTANT_PERSONALITY,
      RESULT_LANGUAGE_RULES,
      'You answer a question asked out loud at a family kitchen wall display. Your answer is spoken aloud and shown on the screen.',
      'Answer ONLY from WHAT THE WALL SHOWS below. If it is not there, say you do not see it on the wall, in one short sentence. Never guess, never invent times, names or plans.',
      'One or two short sentences, plain spoken English, times written as they appear (4:15). No lists, no markdown, no emoji.',
      'Everyone in the household can hear this. Do not suggest goals, advice or anything beyond the answer.',
      'If the person is not asking a question but asks to ADD, CHANGE, MOVE, REMOVE or SCHEDULE something (a routine, the week plan, a task), you cannot do it. Reply with exactly "CHANGE: " followed by their request tidied into one short line of at most 120 characters, keeping the names and wording they used, and nothing else.',
    ].join(' '),
    user: `WHAT THE WALL SHOWS:\n${snapshot.slice(0, MAX_SNAPSHOT)}\n\nQUESTION: ${question.slice(0, MAX_QUESTION)}`,
  }
}

/** The request body, or the 400 message for it. Non-strings never reach .trim(). */
export function parseAskBody(body: unknown): { question: string; snapshot: string } | { error: string } {
  const b = body as { question?: unknown; snapshot?: unknown } | null
  if (!b || typeof b !== 'object' || typeof b.question !== 'string' || typeof b.snapshot !== 'string') {
    return { error: 'question and snapshot must be strings' }
  }
  const question = b.question.trim()
  const snapshot = b.snapshot.trim()
  if (!question || question.length > MAX_QUESTION) return { error: 'question required (≤300 characters)' }
  if (!snapshot) return { error: 'snapshot required' }
  return { question, snapshot }
}

export const MAX_CHANGE = 120

export type WallReply = { answer: string } | { change: string }

/** The model's text as an answer, or as a change request ("CHANGE: …"). */
export function parseWallReply(text: string): WallReply | null {
  const clean = cleanAnswer(text)
  const m = clean.match(/^change\s*:\s*(.*)$/i)
  if (m) {
    const change = m[1].trim().slice(0, MAX_CHANGE).trim()
    return change ? { change } : null
  }
  return clean ? { answer: clean } : null
}

interface ModelResponse { content?: { type: string; text?: string }[]; stop_reason?: string }

/** The reply from a Messages API response. A response cut off by max_tokens
 *  (e.g. "I do not") is never spoken as if it were an answer: null. */
export function replyFromResponse(data: ModelResponse): WallReply | null {
  if (data.stop_reason === 'max_tokens') return null
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ')
  return parseWallReply(text)
}

/** The answer as one clean spoken line. */
export function cleanAnswer(text: string): string {
  return text.replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 400)
}
