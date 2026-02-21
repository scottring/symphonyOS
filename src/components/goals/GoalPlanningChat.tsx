import { useState, useRef, useEffect } from 'react'
import type { ConversationMessage, GoalPlanningResult } from '@/types/goal'

interface GoalPlanningChatProps {
  goalName: string
  messages: ConversationMessage[]
  loading: boolean
  readyToFinish: boolean
  planningResult: GoalPlanningResult | null
  error: string | null
  onStart: () => void
  onSend: (message: string) => void
  onFinish: () => void
  onBack: () => void
  onAcceptBlock: (block: GoalPlanningResult['suggestedBlocks'][0]) => void
  onDone: () => void
}

export function GoalPlanningChat({
  goalName,
  messages,
  loading,
  readyToFinish,
  planningResult,
  error,
  onStart,
  onSend,
  onFinish,
  onBack,
  onAcceptBlock,
  onDone,
}: GoalPlanningChatProps) {
  const [input, setInput] = useState('')
  const [started, setStarted] = useState(false)
  const [acceptedBlocks, setAcceptedBlocks] = useState<Set<number>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!started && messages.length === 0) {
      setStarted(true)
      onStart()
    }
  }, [started, messages.length, onStart])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleAcceptBlock = (block: GoalPlanningResult['suggestedBlocks'][0], index: number) => {
    setAcceptedBlocks(prev => new Set(prev).add(index))
    onAcceptBlock(block)
  }

  // Results view
  if (planningResult) {
    return (
      <div className="h-full overflow-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={onDone}
              className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <div>
              <h1 className="font-display text-2xl font-semibold text-neutral-800">{goalName}</h1>
              <p className="text-sm text-neutral-500">Your Plan</p>
            </div>
          </div>

          {/* Strategy */}
          <p className="text-neutral-600 italic text-sm leading-relaxed mb-8 px-1">
            &ldquo;{planningResult.strategy}&rdquo;
          </p>

          {/* Milestones */}
          {planningResult.milestones.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Milestones</h2>
              <div className="space-y-3">
                {planningResult.milestones.map((m, i) => (
                  <div key={i} className="p-4 rounded-xl bg-white border border-neutral-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium text-neutral-800">{m.title}</h3>
                        {m.description && (
                          <p className="text-xs text-neutral-500 mt-1">{m.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-400 shrink-0">
                        {m.targetValue != null && m.unit && (
                          <span className="px-2 py-0.5 bg-primary-50 text-primary-600 rounded-full font-medium">
                            {m.targetValue} {m.unit}
                          </span>
                        )}
                        {m.targetDate && (
                          <span>{new Date(m.targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Suggested Blocks */}
          {planningResult.suggestedBlocks.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Suggested Coaching Blocks</h2>
              <div className="space-y-3">
                {planningResult.suggestedBlocks.map((block, i) => {
                  const isAccepted = acceptedBlocks.has(i)
                  return (
                    <div key={i} className={`p-4 rounded-xl border transition-all ${isAccepted ? 'bg-primary-50 border-primary-200' : 'bg-white border-neutral-100'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium text-neutral-800">{block.label}</h3>
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-neutral-100 text-neutral-500 rounded">
                              {block.timeSlot}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 leading-relaxed">{block.narrative}</p>
                        </div>
                        <button
                          onClick={() => handleAcceptBlock(block, i)}
                          disabled={isAccepted}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 ${
                            isAccepted
                              ? 'bg-primary-100 text-primary-600 cursor-default'
                              : 'bg-primary-500 text-white hover:bg-primary-600'
                          }`}
                        >
                          {isAccepted ? 'Added' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <button
            onClick={onDone}
            className="w-full py-3 rounded-xl text-sm font-medium text-white transition-colors bg-primary-500 hover:bg-primary-600"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // Chat view
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-100">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </button>
        <div>
          <h1 className="font-display text-lg font-semibold text-neutral-800">{goalName}</h1>
          <p className="text-xs text-neutral-500">Plan with AI</p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-50 border border-neutral-200'
              }`}
            >
              <p className={`text-sm leading-relaxed ${
                msg.role === 'user' ? 'text-white' : 'text-neutral-700'
              }`}>
                {msg.content}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-neutral-50 border border-neutral-200">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-6 py-4 border-t border-neutral-100 bg-white">
        {readyToFinish ? (
          <button
            onClick={onFinish}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 bg-primary-500 hover:bg-primary-600"
          >
            {loading ? 'Generating your plan...' : 'Generate My Plan'}
          </button>
        ) : (
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Share your thoughts..."
              rows={1}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl bg-neutral-50 border border-neutral-200 text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-300/50 focus:border-primary-300 transition-all resize-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="px-4 rounded-xl text-white transition-colors disabled:opacity-30 bg-primary-500 hover:bg-primary-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
