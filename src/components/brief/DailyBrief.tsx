import { useState } from 'react'
import type { DailyBrief as DailyBriefType, DailyBriefItem, DailyBriefActionType } from '@/types/action'

interface DailyBriefProps {
  brief: DailyBriefType
  isGenerating?: boolean
  onRegenerate?: () => void
  onDismiss?: () => void
  onItemAction?: (item: DailyBriefItem, action: DailyBriefActionType) => void
}

// Icon components for item types
function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  )
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  )
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

function SunriseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

// Get icon component for item type
function getItemIcon(type: string, className?: string) {
  const iconClass = className || "w-5 h-5"
  switch (type) {
    case 'stale_followup':
      return <MessageIcon className={iconClass} />
    case 'conflict':
      return <AlertTriangleIcon className={iconClass} />
    case 'deferred_reminder':
      return <PinIcon className={iconClass} />
    case 'upcoming_deadline':
      return <ClockIcon className={iconClass} />
    case 'inbox_reminder':
      return <InboxIcon className={iconClass} />
    case 'routine_check':
      return <RefreshIcon className={iconClass} />
    case 'ai_suggestion':
      return <LightbulbIcon className={iconClass} />
    case 'overdue':
      return <AlertCircleIcon className={iconClass} />
    case 'empty_project':
      return <FolderIcon className={iconClass} />
    case 'unassigned':
      return <UserIcon className={iconClass} />
    case 'calendar_reminder':
      return <CalendarIcon className={iconClass} />
    case 'proactive_suggestion':
      return <SparklesIcon className={iconClass} />
    default:
      return <ClipboardIcon className={iconClass} />
  }
}

// Icon colors by item type
const ITEM_TYPE_COLORS: Record<string, string> = {
  stale_followup: 'text-amber-600',
  conflict: 'text-red-500',
  deferred_reminder: 'text-blue-500',
  upcoming_deadline: 'text-orange-500',
  inbox_reminder: 'text-neutral-500',
  routine_check: 'text-sage-500',
  ai_suggestion: 'text-amber-500',
  overdue: 'text-red-600',
  empty_project: 'text-neutral-400',
  unassigned: 'text-amber-500',
  calendar_reminder: 'text-primary-500',
  proactive_suggestion: 'text-primary-600',
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'border-l-red-500 bg-red-50/50',
  medium: 'border-l-amber-500 bg-amber-50/50',
  low: 'border-l-blue-500 bg-blue-50/50',
}

export function DailyBrief({
  brief,
  isGenerating,
  onRegenerate,
  onDismiss,
  onItemAction,
}: DailyBriefProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  if (brief.dismissedAt) {
    return null
  }

  return (
    <div className="card bg-gradient-to-br from-primary-50 to-white border border-primary-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-primary-100/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <SunriseIcon className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-neutral-800">
                Morning Brief
              </h2>
              <p className="text-sm text-neutral-500">
                {new Date(brief.briefDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                disabled={isGenerating}
                className="p-2 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50"
                title="Regenerate brief"
              >
                <svg
                  className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
                title="Dismiss brief"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Greeting & Summary */}
      <div className="px-5 py-4 bg-white/50">
        <p className="text-neutral-800 font-medium">{brief.greeting}</p>
        {brief.summary && (
          <p className="mt-1 text-sm text-neutral-600">{brief.summary}</p>
        )}
      </div>

      {/* Items */}
      {brief.items.length > 0 && (
        <div className="divide-y divide-neutral-100">
          {brief.items.map((item) => (
            <DailyBriefItemCard
              key={item.id}
              item={item}
              isExpanded={expandedItems.has(item.id)}
              onToggle={() => toggleExpanded(item.id)}
              onAction={(action) => onItemAction?.(item, action)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {brief.items.length === 0 && (
        <div className="px-5 py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto">
            <SparklesIcon className="w-6 h-6 text-primary-600" />
          </div>
          <p className="mt-3 text-neutral-600">
            No items need your attention right now. Nice work!
          </p>
        </div>
      )}
    </div>
  )
}

interface DailyBriefItemCardProps {
  item: DailyBriefItem
  isExpanded: boolean
  onToggle: () => void
  onAction: (action: DailyBriefActionType) => void
}

function DailyBriefItemCard({ item, isExpanded, onToggle, onAction }: DailyBriefItemCardProps) {
  const iconColor = ITEM_TYPE_COLORS[item.type] || 'text-neutral-500'
  const priorityStyle = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.low

  return (
    <div className={`border-l-4 ${priorityStyle}`}>
      <button
        onClick={onToggle}
        className="w-full px-5 py-3 text-left hover:bg-white/50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <span className={`flex-shrink-0 ${iconColor}`}>
            {getItemIcon(item.type, "w-5 h-5")}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-neutral-800 line-clamp-1">
              {item.title}
            </h3>
            {!isExpanded && (
              <p className="text-sm text-neutral-500 line-clamp-1 mt-0.5">
                {item.description}
              </p>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-5 pb-4">
          <p className="text-sm text-neutral-600 ml-8 mb-3">
            {item.description}
          </p>

          {/* Actions */}
          {item.suggestedActions.length > 0 && (
            <div className="flex flex-wrap gap-2 ml-8">
              {item.suggestedActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAction(action.action)
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    idx === 0
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Export a skeleton component for loading state
export function DailyBriefSkeleton() {
  return (
    <div className="card bg-gradient-to-br from-primary-50 to-white border border-primary-100 overflow-hidden animate-pulse">
      <div className="px-5 py-4 border-b border-primary-100/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-100 rounded-full" />
          <div>
            <div className="h-5 w-32 bg-primary-100 rounded" />
            <div className="h-4 w-24 bg-primary-50 rounded mt-1" />
          </div>
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="h-5 w-3/4 bg-neutral-100 rounded" />
        <div className="h-4 w-1/2 bg-neutral-50 rounded mt-2" />
      </div>
      <div className="space-y-0.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-5 py-3 bg-white/50">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-neutral-100 rounded" />
              <div className="flex-1">
                <div className="h-4 w-2/3 bg-neutral-100 rounded" />
                <div className="h-3 w-1/2 bg-neutral-50 rounded mt-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
