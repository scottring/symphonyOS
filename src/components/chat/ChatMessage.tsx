import { useState } from 'react'
import type { ChatMessage as ChatMessageType } from '@/hooks/useChat'

interface ChatMessageProps {
  message: ChatMessageType
  onSourceClick?: (noteId: string) => void
  onAddTask?: (title: string, destination: 'inbox' | 'today') => void
}

/** Extract actionable bullet items from assistant message text */
function extractBulletItems(text: string): { line: string; task: string; start: number; end: number }[] {
  const items: { line: string; task: string; start: number; end: number }[] = []
  const lines = text.split('\n')
  let pos = 0
  for (const line of lines) {
    // Match lines starting with "- " or "• " (common AI bullet patterns)
    const match = line.match(/^\s*[-•]\s+(.+)/)
    if (match) {
      const task = match[1]
        .replace(/\*\*/g, '') // strip bold markers
        .replace(/^\*\s*/, '') // strip leading italic
        .replace(/\s*\*$/, '') // strip trailing italic
        .trim()
      // Skip header-like lines (all caps, very short, or end with ":")
      if (task.length > 5 && !task.endsWith(':') && !/^[A-Z\s]+$/.test(task)) {
        items.push({ line, task, start: pos, end: pos + line.length })
      }
    }
    pos += line.length + 1
  }
  return items
}

function AddTaskButton({ task, onAddTask }: { task: string; onAddTask: (title: string, destination: 'inbox' | 'today') => void }) {
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<'inbox' | 'today' | null>(null)

  if (added) {
    return (
      <span className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-600 text-[10px] font-medium">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        {added === 'today' ? 'Today' : 'Inbox'}
      </span>
    )
  }

  return (
    <span className="relative inline-flex ml-1">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
        title="Add as task"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <span className="absolute left-6 top-0 z-50 flex gap-1 bg-white rounded-lg shadow-lg border border-neutral-200 p-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddTask(task, 'inbox')
              setAdded('inbox')
              setOpen(false)
            }}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 whitespace-nowrap transition-colors"
          >
            Inbox
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddTask(task, 'today')
              setAdded('today')
              setOpen(false)
            }}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-neutral-600 hover:bg-primary-50 hover:text-primary-700 whitespace-nowrap transition-colors"
          >
            Today
          </button>
        </span>
      )}
    </span>
  )
}

export function ChatMessage({ message, onSourceClick, onAddTask }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const bulletItems = !isUser && onAddTask ? extractBulletItems(message.content) : []

  // Render content with inline add buttons for bullet items
  function renderContent() {
    if (bulletItems.length === 0) {
      return <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
    }

    // Build segments: text before/between/after bullets, with buttons after each bullet line
    const segments: React.ReactNode[] = []
    let lastEnd = 0

    for (let i = 0; i < bulletItems.length; i++) {
      const item = bulletItems[i]
      // Text before this bullet
      if (item.start > lastEnd) {
        segments.push(<span key={`pre-${i}`}>{message.content.slice(lastEnd, item.start)}</span>)
      }
      // The bullet line itself + add button
      segments.push(
        <span key={`bullet-${i}`} className="inline">
          {item.line}
          <AddTaskButton task={item.task} onAddTask={onAddTask!} />
        </span>
      )
      lastEnd = item.end
    }
    // Remaining text after last bullet
    if (lastEnd < message.content.length) {
      segments.push(<span key="post">{message.content.slice(lastEnd)}</span>)
    }

    return <div className="text-sm leading-relaxed whitespace-pre-wrap">{segments}</div>
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`
          max-w-[85%] rounded-2xl px-4 py-2.5
          ${isUser
            ? 'bg-primary-600 text-white'
            : 'bg-neutral-100 text-neutral-800'
          }
        `}
      >
        {/* Message content */}
        {renderContent()}

        {/* Source notes */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-neutral-200/50">
            <div className="flex flex-wrap gap-1">
              {message.sources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => onSourceClick?.(source.id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-medium hover:bg-teal-100 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                  {source.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
