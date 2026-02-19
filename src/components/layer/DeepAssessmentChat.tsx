import { useState, useRef, useEffect } from 'react'
import type { ConversationMessage, DomainAssessment } from '@/types/layer'
import type { LayerDomainConfig, LayerHubConfig } from '@/config/layers'

interface DeepAssessmentChatProps {
  config: LayerHubConfig
  domain: LayerDomainConfig
  quickAssessment?: DomainAssessment
  messages: ConversationMessage[]
  loading: boolean
  readyToFinish: boolean
  result: Pick<DomainAssessment, 'summary' | 'strengths' | 'issues' | 'opportunities'> | null
  error: string | null
  onStart: () => void
  onSend: (message: string) => void
  onFinish: () => void
  onBack: () => void
  onDone: () => void
}

export function DeepAssessmentChat({
  config,
  domain,
  messages,
  loading,
  readyToFinish,
  result,
  error,
  onStart,
  onSend,
  onFinish,
  onBack,
  onDone,
}: DeepAssessmentChatProps) {
  const [input, setInput] = useState('')
  const [started, setStarted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-start on mount
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

  // Show results view
  if (result) {
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
              <h1 className="font-display text-2xl font-semibold text-neutral-800">{domain.name}</h1>
              <p className="text-sm text-neutral-500">Deep Assessment Complete</p>
            </div>
          </div>

          {/* Summary */}
          {result.summary && (
            <p className="text-neutral-600 italic text-sm leading-relaxed mb-8 px-1">
              &ldquo;{result.summary}&rdquo;
            </p>
          )}

          {/* Strengths */}
          {result.strengths.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Strengths</h2>
              <ul className="space-y-2">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Issues */}
          {result.issues.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Needs Attention</h2>
              <ul className="space-y-2">
                {result.issues.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                    <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                    </svg>
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Opportunities */}
          {result.opportunities.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Opportunities</h2>
              <ul className="space-y-2">
                {result.opportunities.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                    <span className="text-primary-500 mt-0.5 shrink-0">→</span>
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button
            onClick={onDone}
            className={`w-full py-3 rounded-xl text-sm font-medium text-white transition-colors ${config.accentColor} hover:opacity-90`}
          >
            Back to {domain.name}
          </button>
        </div>
      </div>
    )
  }

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
          <h1 className="font-display text-lg font-semibold text-neutral-800">{domain.name}</h1>
          <p className="text-xs text-neutral-500">Deep Assessment</p>
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
                  : `${config.bgColor} ${config.borderColor} border`
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

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className={`rounded-2xl px-4 py-3 ${config.bgColor} ${config.borderColor} border`}>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
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
            className={`w-full py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 ${config.accentColor} hover:opacity-90`}
          >
            {loading ? 'Generating assessment...' : 'Generate My Assessment'}
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
              className={`px-4 rounded-xl text-white transition-colors disabled:opacity-30 ${config.accentColor} hover:opacity-90`}
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
