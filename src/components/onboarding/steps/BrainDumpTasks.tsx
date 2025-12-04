import { useState, useRef, useEffect } from 'react'

interface BrainDumpTasksProps {
  onAddTask: (title: string) => Promise<string | null>
  onContinue: () => void
  taskCount?: number
}

export function BrainDumpTasks({ onAddTask, onContinue }: BrainDumpTasksProps) {
  const [input, setInput] = useState('')
  const [tasks, setTasks] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleAdd = async () => {
    const title = input.trim()
    if (!title || isAdding) return

    setIsAdding(true)
    const id = await onAddTask(title)
    if (id) {
      setTasks(prev => [...prev, title])
      setInput('')
    }
    setIsAdding(false)
    // Focus after React re-renders
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAdd()
    }
  }

  const canContinue = tasks.length >= 3

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
          What's on your mind?
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-8">
          Don't overthink this. Just get it out of your head.
          <br />
          You can organize everything later.
        </p>

        {/* Input */}
        <div className="flex gap-2 mb-6">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a task..."
            className="input-base flex-1 min-w-0 text-lg"
            disabled={isAdding}
          />
          <button
            onClick={handleAdd}
            disabled={!input.trim() || isAdding}
            className="btn-primary px-4 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Task list */}
        {tasks.length > 0 && (
          <ul className="space-y-2 mb-8">
            {tasks.map((task, i) => (
              <li
                key={i}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-100 animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="w-5 h-5 rounded-full border-2 border-neutral-300" />
                <span className="text-neutral-700">{task}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Hint */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
          <p className="text-sm text-amber-800">
            💡 <span className="font-medium">Stuck?</span> Think about: errands, calls to make,
            emails to send, things due this week.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="text-center mb-6">
          <span className={`text-sm ${canContinue ? 'text-primary-600' : 'text-neutral-400'}`}>
            {tasks.length} of 3 tasks minimum
          </span>
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className="btn-primary px-8 py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
