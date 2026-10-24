// The lightbulb beside a question Symphony asks in chat (2026-10-24). Scott:
// the chat "asked structural questions and didn't push any answers on me" —
// ideas come only when the person taps for them (the question-ideas function).

import { supabase } from '@/lib/supabase'
import type { ChatMessage } from '@/types/chat'

export interface QuestionLine {
  /** The line's index in the message, split on newlines. */
  index: number
  /** The question as asked, without its list marker or bold. */
  question: string
  /** Its number when the message asks more than one ("1." → 1), else null. */
  number: number | null
}

const MARKER = /^\s*(?:(\d{1,2})[.)]|[-•*])\s+/

/** Each line of a reply that asks the person something. */
export function questionLines(text: string): QuestionLine[] {
  const found: { index: number; question: string; listed: number | null }[] = []
  text.split('\n').forEach((line, index) => {
    const listed = line.match(MARKER)?.[1]
    const question = line.replace(MARKER, '').replace(/\*\*|__/g, '').trim()
    if (question.length >= 8 && /\?["”')*_]*$/.test(question)) found.push({ index, question, listed: listed ? Number(listed) : null })
  })
  return found.map((q, i) => ({ index: q.index, question: q.question, number: found.length > 1 ? q.listed ?? i + 1 : null }))
}

export interface QuestionIdea { answer: string; why: string }

/** A few answers the person could give. Throws with a plain message on failure. */
export async function fetchQuestionIdeas(question: string, conversation: Pick<ChatMessage, 'role' | 'content'>[]): Promise<QuestionIdea[]> {
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase.functions.invoke('question-ideas', {
    body: { question, today, conversation: conversation.filter((m) => m.content.trim()).map((m) => ({ role: m.role, content: m.content })) },
  })
  const ideas = (data as { ideas?: QuestionIdea[] } | null)?.ideas
  if (error || !ideas?.length) throw new Error('No ideas just now.')
  return ideas
}

/** Where a picked idea goes in the reply: numbered when there are several questions. */
export function withIdea(draft: string, answer: string, number: number | null): string {
  const line = number ? `${number}. ${answer}` : answer
  return draft.trim() ? `${draft.trimEnd()}\n${line}` : line
}
