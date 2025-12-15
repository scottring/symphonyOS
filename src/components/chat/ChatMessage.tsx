import type { ConversationMessage, ActionTaken, EntityReference } from '@/types/conversation'

interface ChatMessageProps {
  message: ConversationMessage
  onEntityClick?: (ref: EntityReference) => void
}

export function ChatMessage({ message, onEntityClick }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isTemp = message.id.startsWith('temp-')

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary-600 text-white rounded-br-md'
            : 'bg-neutral-100 text-neutral-800 rounded-bl-md'
        } ${isTemp ? 'opacity-60' : ''}`}
      >
        {/* Message content */}
        <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">
          {formatMessageContent(message.content)}
        </div>

        {/* Actions taken badge */}
        {message.actionsTaken.length > 0 && (
          <div className="mt-2 pt-2 border-t border-neutral-200/20">
            <div className="flex flex-wrap gap-1.5">
              {message.actionsTaken.map((action, i) => (
                <ActionBadge key={i} action={action} />
              ))}
            </div>
          </div>
        )}

        {/* Entity references */}
        {message.entityReferences.length > 0 && (
          <div className="mt-2 pt-2 border-t border-neutral-200/20">
            <div className="flex flex-wrap gap-1.5">
              {message.entityReferences.slice(0, 5).map((ref) => (
                <EntityChip
                  key={ref.id}
                  reference={ref}
                  onClick={() => onEntityClick?.(ref)}
                />
              ))}
              {message.entityReferences.length > 5 && (
                <span className="text-xs opacity-70">
                  +{message.entityReferences.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`mt-1 text-xs ${
            isUser ? 'text-white/60' : 'text-neutral-400'
          }`}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  )
}

function ActionBadge({ action }: { action: ActionTaken }) {
  const getLabel = () => {
    switch (action.type) {
      case 'task_created':
        return `Created: ${action.title || 'task'}`
      case 'task_updated':
        return `Updated: ${action.title || 'task'}`
      case 'task_completed':
        return `Completed: ${action.title || 'task'}`
      case 'tasks_bulk_updated':
        return `Updated ${action.entityIds?.length || 0} tasks`
      case 'tasks_bulk_completed':
        return `Completed ${action.entityIds?.length || 0} tasks`
      case 'sms_sent':
        return 'SMS sent'
      case 'email_sent':
        return 'Email sent'
      default:
        return action.type
    }
  }

  const hasError = !!action.error

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        hasError
          ? 'bg-red-100 text-red-700'
          : 'bg-primary-100 text-primary-700'
      }`}
    >
      {hasError ? (
        <ErrorIcon className="w-3 h-3" />
      ) : (
        <CheckIcon className="w-3 h-3" />
      )}
      {hasError ? action.error : getLabel()}
    </span>
  )
}

function EntityChip({
  reference,
  onClick,
}: {
  reference: EntityReference
  onClick?: () => void
}) {
  const getIcon = () => {
    switch (reference.type) {
      case 'task':
        return <TaskIcon className="w-3 h-3" />
      case 'project':
        return <ProjectIcon className="w-3 h-3" />
      case 'contact':
        return <ContactIcon className="w-3 h-3" />
      case 'event':
        return <CalendarIcon className="w-3 h-3" />
      default:
        return null
    }
  }

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/80 text-neutral-600 hover:bg-white transition-colors"
    >
      {getIcon()}
      <span className="max-w-[120px] truncate">{reference.title}</span>
    </button>
  )
}

// Formatting helpers
function formatMessageContent(content: string): string {
  // Basic markdown-like formatting
  return content
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Icons
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function TaskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

function ProjectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function ContactIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}
