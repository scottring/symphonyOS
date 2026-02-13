import type { ConversationTurn } from '@/types/conversation'

interface ConversationBubbleProps {
  turn: ConversationTurn
}

export function ConversationBubble({ turn }: ConversationBubbleProps) {
  const isUser = turn.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <div
        className={`max-w-[85%] px-5 py-4 rounded-2xl text-lg md:text-xl leading-relaxed ${
          isUser
            ? 'bg-stone-900 text-white rounded-br-md'
            : 'bg-white border border-stone-200 text-stone-800 rounded-bl-md'
        }`}
      >
        {turn.content}
      </div>
    </div>
  )
}
