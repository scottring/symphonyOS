import { useState, useRef, useEffect } from 'react'

interface BrainDumpProjectsProps {
  onAddProject: (name: string) => Promise<string | null>
  onContinue: () => void
  onSkip: () => void
  projectCount?: number
}

export function BrainDumpProjects({ onAddProject, onContinue, onSkip }: BrainDumpProjectsProps) {
  const [input, setInput] = useState('')
  const [projects, setProjects] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleAdd = async () => {
    const name = input.trim()
    if (!name || isAdding) return

    setIsAdding(true)
    const id = await onAddProject(name)
    if (id) {
      setProjects(prev => [...prev, name])
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

  const canContinue = projects.length >= 1

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
          What are you working on?
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-2">
          A project is just a goal that needs multiple steps.
        </p>
        <p className="text-neutral-400 text-center mb-8">
          Renovating the kitchen. Planning a vacation. Finding a new daycare.
        </p>

        {/* Input */}
        <div className="flex gap-2 mb-6">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a project..."
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

        {/* Project list */}
        {projects.length > 0 && (
          <ul className="space-y-2 mb-8">
            {projects.map((project, i) => (
              <li
                key={i}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-100 animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="text-lg">📁</span>
                <span className="text-neutral-700 font-medium">{project}</span>
              </li>
            ))}
          </ul>
        )}

        {/* CTA */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className="btn-primary px-8 py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>

          <button
            onClick={onSkip}
            className="text-sm text-neutral-400 hover:text-neutral-600"
          >
            Skip — I'll add projects later
          </button>
        </div>
      </div>
    </div>
  )
}
