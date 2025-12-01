import { useState } from 'react'

interface AddTaskFormProps {
  onAdd: (title: string) => void
}

export function AddTaskForm({ onAdd }: AddTaskFormProps) {
  const [title, setTitle] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setTitle('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task..."
        className="flex-1 px-4 py-3 rounded-xl border border-neutral-200 bg-white
                   text-neutral-800 placeholder:text-neutral-400
                   focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                   transition-shadow shadow-sm focus:shadow-md"
      />
      <button
        type="submit"
        className="touch-target px-5 py-3 bg-primary-500 text-white font-medium rounded-xl
                   hover:bg-primary-600 active:bg-primary-700
                   shadow-sm hover:shadow-md
                   transition-all"
      >
        Add
      </button>
    </form>
  )
}
