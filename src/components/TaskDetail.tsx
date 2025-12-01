import { useState } from 'react'
import type { Task } from '@/types/task'

interface TaskDetailProps {
  task: Task
  onUpdate: (id: string, updates: Partial<Task>) => void
}

export function TaskDetail({ task, onUpdate }: TaskDetailProps) {
  const [newLink, setNewLink] = useState('')

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate(task.id, { notes: e.target.value || undefined })
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(task.id, { phoneNumber: e.target.value || undefined })
  }

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newLink.trim()
    if (!trimmed) return

    const currentLinks = task.links || []
    if (!currentLinks.includes(trimmed)) {
      onUpdate(task.id, { links: [...currentLinks, trimmed] })
    }
    setNewLink('')
  }

  const handleRemoveLink = (linkToRemove: string) => {
    const currentLinks = task.links || []
    const newLinks = currentLinks.filter((link) => link !== linkToRemove)
    onUpdate(task.id, { links: newLinks.length > 0 ? newLinks : undefined })
  }

  return (
    <div className="mt-3 pt-3 border-t border-neutral-100 space-y-4">
      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-neutral-600 mb-1">
          Notes
        </label>
        <textarea
          value={task.notes || ''}
          onChange={handleNotesChange}
          placeholder="Add notes..."
          rows={3}
          className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Phone Number */}
      <div>
        <label className="block text-sm font-medium text-neutral-600 mb-1">
          Phone Number
        </label>
        <input
          type="tel"
          value={task.phoneNumber || ''}
          onChange={handlePhoneChange}
          placeholder="Add phone number..."
          className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Links */}
      <div>
        <label className="block text-sm font-medium text-neutral-600 mb-1">
          Links
        </label>
        {task.links && task.links.length > 0 && (
          <ul className="mb-2 space-y-1">
            {task.links.map((link) => (
              <li key={link} className="flex items-center gap-2 text-sm">
                <a
                  href={link.startsWith('http') ? link : `https://${link}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline truncate flex-1"
                >
                  {link}
                </a>
                <button
                  onClick={() => handleRemoveLink(link)}
                  className="text-neutral-400 hover:text-red-500"
                  aria-label="Remove link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleAddLink} className="flex gap-2">
          <input
            type="text"
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            placeholder="Add a link..."
            className="flex-1 px-3 py-1.5 text-sm rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  )
}
