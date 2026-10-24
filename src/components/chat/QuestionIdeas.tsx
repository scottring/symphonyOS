// A question Symphony asked, with a lightbulb beside it (2026-10-24). Tapping
// it fetches a few answers the person could give; tapping one puts it in
// their reply, still theirs to edit before sending. Nothing shows until asked.

import { useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { fetchQuestionIdeas, type QuestionIdea, type QuestionLine } from '@/lib/chat/questionIdeas'
import type { ChatMessage } from '@/types/chat'

export interface QuestionIdeasProps {
  /** The conversation up to and including the message asking. */
  conversation: Pick<ChatMessage, 'role' | 'content'>[]
  /** Put a picked idea into the person's reply. */
  onUse: (answer: string, number: number | null) => void
}

type State = { kind: 'closed' } | { kind: 'loading' } | { kind: 'shown'; ideas: QuestionIdea[] } | { kind: 'failed' }

export function QuestionIdeasLine({ line, html, ideas }: { line: QuestionLine; html: string; ideas: QuestionIdeasProps }) {
  const [state, setState] = useState<State>({ kind: 'closed' })
  const [used, setUsed] = useState<number | null>(null)
  const open = state.kind !== 'closed'
  const load = async () => {
    setState({ kind: 'loading' })
    try { setState({ kind: 'shown', ideas: await fetchQuestionIdeas(line.question, ideas.conversation) }) }
    catch { setState({ kind: 'failed' }) }
  }
  const toggle = () => { if (open) setState({ kind: 'closed' }); else void load() }

  return (
    <div className="chat-question">
      <div className="chat-question-line">
        <span dangerouslySetInnerHTML={{ __html: html }} />
        <button type="button" className={`chat-question-bulb${open ? ' is-open' : ''}`} onClick={toggle} aria-expanded={open}
          aria-label={`Ideas for “${line.question}”`} title="Ideas">
          <Lightbulb aria-hidden="true" />
        </button>
      </div>
      {state.kind === 'loading' && <p className="chat-question-note" role="status">Thinking of ideas…</p>}
      {state.kind === 'failed' && <p className="chat-question-note" role="status">No ideas just now. <button type="button" className="canvas-link" onClick={() => void load()}>Try again</button></p>}
      {state.kind === 'shown' && (
        <ul className="chat-question-ideas" aria-label="Ideas, tap one to use it">
          {state.ideas.map((idea, i) => (
            <li key={i}>
              <button type="button" className={`chat-question-idea${used === i ? ' is-used' : ''}`} onClick={() => { ideas.onUse(idea.answer, line.number); setUsed(i) }}>
                <span className="chat-question-idea-answer">{idea.answer}</span>
                {idea.why && <span className="chat-question-idea-why">{idea.why}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
