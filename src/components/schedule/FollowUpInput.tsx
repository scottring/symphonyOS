import { useState, useRef, useEffect, useCallback, memo } from 'react'
import type { Task } from '@/types/task'

interface FollowUpInputProps {
  sourceTask: Task
  onSubmit: (title: string) => void
  onDismiss: () => void
  projectName?: string
}

export const FollowUpInput = memo(function FollowUpInput({
  sourceTask,
  onSubmit,
  onDismiss,
  projectName,
}: FollowUpInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus on mount
  useEffect(() => {
    // Small delay to let the DOM settle after task completion animation
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // Auto-dismiss after 8 seconds of no interaction
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>()
  const resetDismissTimer = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    dismissTimer.current = setTimeout(onDismiss, 8000)
  }, [onDismiss])

  useEffect(() => {
    resetDismissTimer()
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [resetDismissTimer])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    resetDismissTimer()
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault()
      onSubmit(value.trim())
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onDismiss()
    }
  }

  // Context chips showing what will be inherited
  const chips: string[] = []
  if (projectName) chips.push(projectName)
  if (sourceTask.context) chips.push(sourceTask.context)

  return (
    <div className="ml-[5.25rem] md:ml-[5.25rem] mr-2 animate-fade-in-up">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-50/60 border border-primary-100">
        {/* Arrow indicating follow-up */}
        <span className="text-primary-400 text-sm shrink-0 font-mono">+</span>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            resetDismissTimer()
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Dismiss on blur if empty, otherwise keep open
            if (!value.trim()) {
              // Small delay to allow click events on submit
              setTimeout(onDismiss, 150)
            }
          }}
          placeholder="Follow-up task..."
          className="flex-1 min-w-0 text-sm bg-transparent text-neutral-800 placeholder:text-neutral-400 outline-none"
        />

        {/* Inherited context chips */}
        {chips.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {chips.map((chip) => (
              <span
                key={chip}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-100/60 text-primary-600"
              >
                {chip}
              </span>
            ))}
          </div>
        )}

        {/* Submit hint */}
        <span className="text-[10px] text-neutral-400 shrink-0 hidden sm:inline">
          Enter
        </span>
      </div>
    </div>
  )
})
