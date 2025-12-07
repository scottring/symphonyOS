import { useState, useRef, useCallback } from 'react'
import type { NoteTopic } from '@/types/note'

interface NotesQuickCaptureProps {
  onSave: (content: string, topicId?: string) => Promise<void>
  topics?: NoteTopic[]
  placeholder?: string
}

export function NotesQuickCapture({ onSave, topics = [], placeholder = 'Jot something down...' }: NotesQuickCaptureProps) {
  const [content, setContent] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [selectedTopicId, setSelectedTopicId] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(async () => {
    if (!content.trim() || isSaving) return

    setIsSaving(true)
    try {
      await onSave(content.trim(), selectedTopicId)
      setContent('')
      setSelectedTopicId(undefined)
      setShowOptions(false)
    } finally {
      setIsSaving(false)
    }
  }, [content, selectedTopicId, onSave, isSaving])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
      if (e.key === 'Escape') {
        setShowOptions(false)
        inputRef.current?.blur()
      }
    },
    [handleSubmit]
  )

  const selectedTopic = selectedTopicId ? topics.find((t) => t.id === selectedTopicId) : undefined

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => setShowOptions(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 text-xl font-display placeholder:text-neutral-400 bg-transparent border-none focus:outline-none focus:placeholder:opacity-50 transition-all"
          disabled={isSaving}
        />
        {content.trim() && (
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="p-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            aria-label="Save note"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Selected topic indicator */}
      {selectedTopic && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-sm bg-primary-50 text-primary-700"
            style={selectedTopic.color ? { backgroundColor: `${selectedTopic.color}20`, color: selectedTopic.color } : undefined}
          >
            {selectedTopic.name}
            <button
              onClick={() => setSelectedTopicId(undefined)}
              className="hover:opacity-70"
              aria-label="Remove topic"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </span>
        </div>
      )}

      {/* Expandable options on focus */}
      {showOptions && !selectedTopic && topics.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-white rounded-xl shadow-lg border border-neutral-100 space-y-2 z-10">
          <p className="text-xs text-neutral-400 uppercase tracking-wide font-medium">Add to topic</p>
          <div className="flex flex-wrap gap-2">
            {topics.slice(0, 5).map((topic) => (
              <button
                key={topic.id}
                onClick={() => {
                  setSelectedTopicId(topic.id)
                  setShowOptions(false)
                }}
                className="px-3 py-1.5 rounded-full text-sm bg-neutral-100 text-neutral-600 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                style={topic.color ? { backgroundColor: `${topic.color}10`, color: topic.color } : undefined}
              >
                {topic.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
