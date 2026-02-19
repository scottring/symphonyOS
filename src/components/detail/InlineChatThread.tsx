import { useState, useRef, useEffect } from 'react'
import type { ConversationMessage } from '@/types/coaching'

interface InlineChatThreadProps {
  messages: ConversationMessage[]
  loading: boolean
  readyToFinish: boolean
  error: string | null
  onSend: (message: string) => void
  onFinish: () => void
}

export function InlineChatThread({ messages, loading, readyToFinish, error, onSend, onFinish }: InlineChatThreadProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

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

  return (
    <div className="flex flex-col">
      {/* Messages */}
      <div className="max-h-64 overflow-y-auto space-y-2 mb-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-amber-50 border border-amber-200'
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

        {/* Loading dots */}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3 py-2 bg-amber-50 border border-amber-200">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">{error}</p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Generate button - appears after first user response */}
      {readyToFinish && (
        <button
          onClick={onFinish}
          disabled={loading}
          className="w-full py-2.5 mb-2 rounded-xl text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate Coaching Block'}
        </button>
      )}

      {/* Chat input - always visible */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={readyToFinish ? "Continue chatting or generate..." : "Type your thoughts..."}
          rows={1}
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 transition-all resize-none disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="px-3 rounded-xl text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-30"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
