// ConversationMessage — editorial-style conversation display
// AI messages: warm paragraphs with serif questions. User messages: clean journal blocks.
// Replaces the generic chat-bubble ConversationBubble.

import type { ConversationTurn } from '@/types/conversation'

interface ConversationMessageProps {
  turn: ConversationTurn
  isLatest?: boolean
}

export function ConversationMessage({ turn, isLatest = false }: ConversationMessageProps) {
  const isUser = turn.role === 'user'

  if (isUser) {
    return (
      <div className="animate-fade-in py-3">
        <div className="flex items-start gap-3">
          <div className="w-1 shrink-0 rounded-full bg-stone-300 self-stretch" />
          <p className="text-base md:text-lg text-stone-700 leading-relaxed">
            {turn.content}
          </p>
        </div>
      </div>
    )
  }

  // AI message — editorial styling
  // Split content: first sentence as the "question" (serif), rest as context
  const parts = splitQuestionAndContext(turn.content)

  return (
    <div className={`animate-fade-in py-4 ${isLatest ? '' : 'opacity-80'}`}>
      {parts.question && (
        <p className="font-display text-xl md:text-2xl text-stone-900 leading-snug mb-2">
          {parts.question}
        </p>
      )}
      {parts.context && (
        <p className="text-base text-stone-500 leading-relaxed">
          {parts.context}
        </p>
      )}
    </div>
  )
}

// Heuristic: the first sentence that ends with "?" is the question.
// Everything before/after it is context.
function splitQuestionAndContext(text: string): { question: string; context: string } {
  // Try to find a question mark sentence
  const sentences = text.split(/(?<=[.?!])\s+/)
  const qIndex = sentences.findIndex(s => s.trim().endsWith('?'))

  if (qIndex >= 0) {
    // The question sentence + anything before it is the "question" block
    const questionParts = sentences.slice(0, qIndex + 1)
    const contextParts = sentences.slice(qIndex + 1)

    // If there's context before the question, move it
    if (qIndex > 0) {
      return {
        question: sentences[qIndex],
        context: [...sentences.slice(0, qIndex), ...contextParts].join(' '),
      }
    }

    return {
      question: questionParts.join(' '),
      context: contextParts.join(' '),
    }
  }

  // No question mark — treat the first sentence as the lead, rest as context
  if (sentences.length > 1) {
    return {
      question: sentences[0],
      context: sentences.slice(1).join(' '),
    }
  }

  return { question: text, context: '' }
}
