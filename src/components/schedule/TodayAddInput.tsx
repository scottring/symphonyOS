import { useState, useCallback, useRef } from 'react'

interface TodayAddInputProps {
  onAdd: (title: string) => void
}

export function TodayAddInput({ onAdd }: TodayAddInputProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
  }, [value, onAdd])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      setValue('')
      inputRef.current?.blur()
    }
  }, [handleSubmit])

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3 rounded-xl border transition-all duration-200 ${
        focused
          ? 'border-primary-300 bg-white shadow-sm'
          : 'border-neutral-200/60 bg-neutral-50/50 hover:border-neutral-300'
      }`}
    >
      <span className={`text-lg leading-none transition-colors ${focused ? 'text-primary-500' : 'text-neutral-300'}`}>
        +
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Add to today..."
        className="flex-1 bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 outline-none"
      />
      {value.trim() && (
        <button
          onClick={handleSubmit}
          className="px-2.5 py-1 rounded-lg bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 transition-colors"
        >
          Add
        </button>
      )}
    </div>
  )
}
