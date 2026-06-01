import { useState, useCallback, useRef } from 'react'
import { Plus } from 'lucide-react'

interface TodayAddInputProps {
  onAdd: (title: string) => void
}

export function TodayAddInput({ onAdd }: TodayAddInputProps) {
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const expand = useCallback(() => {
    setExpanded(true)
    // Auto-focus on next tick so the element is rendered first
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
    setExpanded(false)
  }, [value, onAdd])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      setValue('')
      setExpanded(false)
      inputRef.current?.blur()
    }
  }, [handleSubmit])

  const handleBlur = useCallback(() => {
    // Collapse when focus leaves and there is no value
    if (!value.trim()) {
      setExpanded(false)
    }
  }, [value])

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={expand}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all duration-150"
        aria-label="Add to today"
      >
        <Plus className="w-4 h-4" />
        Add to today
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg border border-primary-300 bg-white shadow-sm transition-all duration-200">
      <span className="text-lg leading-none text-primary-500">+</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Add to today..."
        className="flex-1 bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 outline-none"
      />
      {value.trim() && (
        <button
          type="button"
          onMouseDown={(e) => {
            // Prevent blur from firing before the click registers
            e.preventDefault()
          }}
          onClick={handleSubmit}
          className="px-2.5 py-1 rounded-lg bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 transition-colors"
        >
          Add
        </button>
      )}
    </div>
  )
}
