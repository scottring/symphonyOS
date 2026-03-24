import { useState, useCallback } from 'react'
import { useActionQueue, type ActionQueueItem } from '@/hooks/useActionQueue'
import {
  Mail,
  CheckSquare,
  Calendar,
  UserCog,
  FileText,
  ChevronDown,
  ChevronUp,
  Zap,
  Check,
  X,
} from 'lucide-react'

const ACTION_TYPE_CONFIG: Record<
  ActionQueueItem['action_type'],
  { icon: typeof Mail; label: string; color: string }
> = {
  send_email: { icon: Mail, label: 'Email', color: 'text-blue-600' },
  create_task: { icon: CheckSquare, label: 'Task', color: 'text-primary-600' },
  schedule_meeting: { icon: Calendar, label: 'Meeting', color: 'text-purple-600' },
  update_contact: { icon: UserCog, label: 'Contact', color: 'text-amber-600' },
  write_vault_note: { icon: FileText, label: 'Note', color: 'text-sage-600' },
}

const SOURCE_LABELS: Record<ActionQueueItem['source'], string> = {
  email: 'Email',
  meeting: 'Meeting',
  transcript: 'Transcript',
  ai_chat: 'AI Chat',
  system: 'System',
}

function ActionCard({
  action,
  onApprove,
  onReject,
}: {
  action: ActionQueueItem
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const [acting, setActing] = useState(false)
  const config = ACTION_TYPE_CONFIG[action.action_type]
  const Icon = config.icon

  const handleApprove = useCallback(async () => {
    setActing(true)
    try {
      await onApprove(action.id)
    } finally {
      setActing(false)
    }
  }, [action.id, onApprove])

  const handleReject = useCallback(async () => {
    setActing(true)
    try {
      await onReject(action.id)
    } finally {
      setActing(false)
    }
  }, [action.id, onReject])

  const timeAgo = getTimeAgo(action.created_at)

  return (
    <div className="flex items-start gap-3 p-3 bg-bg-elevated rounded-xl border border-neutral-200/60 shadow-sm transition-all duration-200 animate-in fade-in slide-in-from-top-1">
      {/* Icon */}
      <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
        <Icon size={18} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-neutral-800 leading-snug">{action.summary}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-500 uppercase tracking-wide">
            {SOURCE_LABELS[action.source]}
          </span>
          <span className="text-[11px] text-neutral-400">{timeAgo}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={handleApprove}
          disabled={acting}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition-colors disabled:opacity-50"
          title="Approve"
        >
          <Check size={15} />
        </button>
        <button
          onClick={handleReject}
          disabled={acting}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-500 transition-colors disabled:opacity-50"
          title="Dismiss"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

export function ActionQueueBar() {
  const { actions, pendingCount, approveAction, rejectAction } = useActionQueue()
  const [expanded, setExpanded] = useState(false)

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await approveAction(id)
      } catch {
        // Error logged in hook
      }
    },
    [approveAction]
  )

  const handleReject = useCallback(
    async (id: string) => {
      try {
        await rejectAction(id)
      } catch {
        // Error logged in hook
      }
    },
    [rejectAction]
  )

  // Don't render anything if no pending actions
  if (pendingCount === 0) return null

  return (
    <div className="mb-3">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-primary-50/80 border border-primary-200/50 hover:bg-primary-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-primary-500" />
          <span className="text-sm font-medium text-primary-700">
            {pendingCount} {pendingCount === 1 ? 'action' : 'actions'} waiting for approval
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-primary-400" />
        ) : (
          <ChevronDown size={16} className="text-primary-400" />
        )}
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="mt-2 space-y-2">
          {actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTimeAgo(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}
