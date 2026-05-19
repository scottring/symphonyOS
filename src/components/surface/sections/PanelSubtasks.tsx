import { useState } from 'react'
import type { Task } from '@/types/task'
import { ConceptIcon } from '@/lib/conceptIcons'

interface PanelSubtasksProps {
  subtasks: Task[]
  onToggleSubtask: (id: string) => void
  onAddSubtask?: (title: string) => void
}

export function PanelSubtasks({ subtasks, onToggleSubtask, onAddSubtask }: PanelSubtasksProps) {
  const [draft, setDraft] = useState('')

  if (subtasks.length === 0 && !onAddSubtask) return null

  function commit() {
    const text = draft.trim()
    if (text && onAddSubtask) {
      onAddSubtask(text)
      setDraft('')
    }
  }

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Subtasks</div>
      <div className="flex flex-col gap-1.5">
        {subtasks.map(sub => (
          <button
            key={sub.id}
            onClick={() => onToggleSubtask(sub.id)}
            aria-label={`Mark ${sub.title} ${sub.completed ? 'incomplete' : 'complete'}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-100/60 text-left"
          >
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0
              ${sub.completed ? 'bg-primary-600 border-primary-600 text-white' : 'border-neutral-300 text-transparent'}`}
            >
              <ConceptIcon name="done" decorative size={10} />
            </span>
            <span className={`text-sm flex-1 ${sub.completed ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>
              {sub.title}
            </span>
          </button>
        ))}
        {onAddSubtask && (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
            onBlur={commit}
            placeholder="+ Add a subtask…"
            className="text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50"
          />
        )}
      </div>
    </section>
  )
}
