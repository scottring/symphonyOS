import type { NoteTopic } from '@/types/note'

interface TopicWithCount extends NoteTopic {
  noteCount: number
}

interface TopicFilterProps {
  topics: TopicWithCount[]
  selectedTopicId: string | null
  totalNotesCount: number
  onSelectTopic: (topicId: string | null) => void
}

export function TopicFilter({
  topics,
  selectedTopicId,
  totalNotesCount,
  onSelectTopic,
}: TopicFilterProps) {
  return (
    <div className="px-4 py-3 border-b border-neutral-100 overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        {/* All Notes pill */}
        <button
          className={`
            px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors
            ${!selectedTopicId
              ? 'bg-primary-100 text-primary-700 font-medium'
              : 'bg-transparent text-neutral-500 hover:bg-neutral-100'
            }
          `}
          onClick={() => onSelectTopic(null)}
        >
          All Notes • {totalNotesCount}
        </button>

        {/* Topic pills */}
        {topics.map((topic) => (
          <button
            key={topic.id}
            className={`
              px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors
              ${selectedTopicId === topic.id
                ? 'bg-primary-100 text-primary-700 font-medium'
                : 'bg-transparent text-neutral-500 hover:bg-neutral-100'
              }
            `}
            style={
              selectedTopicId === topic.id && topic.color
                ? { backgroundColor: `${topic.color}20`, color: topic.color }
                : topic.color && selectedTopicId !== topic.id
                ? { color: topic.color }
                : undefined
            }
            onClick={() => onSelectTopic(topic.id)}
          >
            {topic.name} • {topic.noteCount}
          </button>
        ))}
      </div>
    </div>
  )
}
