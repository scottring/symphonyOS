import { useState, useCallback } from 'react'
import type { NoteTopic } from '@/types/note'

interface TopicPickerProps {
  topics: NoteTopic[]
  selectedTopicId?: string
  onSelect: (topicId: string | null) => void
  onCreate?: (name: string) => Promise<NoteTopic | null>
}

export function TopicPicker({ topics, selectedTopicId, onSelect, onCreate }: TopicPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const selectedTopic = selectedTopicId ? topics.find((t) => t.id === selectedTopicId) : undefined

  const handleCreate = useCallback(async () => {
    if (!newTopicName.trim() || !onCreate || isCreating) return

    setIsCreating(true)
    try {
      const newTopic = await onCreate(newTopicName.trim())
      if (newTopic) {
        onSelect(newTopic.id)
        setNewTopicName('')
        setIsOpen(false)
      }
    } finally {
      setIsCreating(false)
    }
  }, [newTopicName, onCreate, isCreating, onSelect])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && newTopicName.trim()) {
        e.preventDefault()
        handleCreate()
      }
    },
    [handleCreate, newTopicName]
  )

  return (
    <div className="relative">
      {selectedTopic ? (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary-50 text-primary-700 text-sm"
          style={selectedTopic.color ? { backgroundColor: `${selectedTopic.color}20`, color: selectedTopic.color } : undefined}
        >
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="hover:opacity-80 transition-opacity"
          >
            {selectedTopic.name}
          </button>
          <button
            onClick={() => onSelect(null)}
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
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-sm text-neutral-500 hover:text-primary-600 transition-colors inline-flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          Add topic...
        </button>
      )}

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 w-64 p-2 bg-white rounded-xl shadow-lg border border-neutral-100 z-20">
            {/* Create new topic inline */}
            {onCreate && (
              <div className="p-2 border-b border-neutral-100 mb-2">
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Create topic..."
                  className="w-full text-sm bg-transparent border-none focus:outline-none placeholder:text-neutral-400"
                  disabled={isCreating}
                />
              </div>
            )}

            {/* Existing topics - simple list */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {topics.length === 0 && !newTopicName && (
                <p className="text-sm text-neutral-400 px-3 py-2">No topics yet</p>
              )}
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    topic.id === selectedTopicId
                      ? 'bg-primary-50 text-primary-700'
                      : 'hover:bg-neutral-100'
                  }`}
                  onClick={() => {
                    onSelect(topic.id)
                    setIsOpen(false)
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      style={topic.color ? { color: topic.color } : undefined}
                    >
                      {topic.name}
                    </span>
                    {topic.id === selectedTopicId && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
