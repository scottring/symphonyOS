import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { DailyBrief as DailyBriefType, DailyBriefItem, DailyBriefActionType } from '@/types/action'

interface DailyBriefModalProps {
  isOpen: boolean
  brief: DailyBriefType | null
  isGenerating?: boolean
  onRegenerate?: () => void
  onDismiss: () => void
  onItemAction?: (item: DailyBriefItem, action: DailyBriefActionType) => void
  onScheduleTask?: (taskId: string, date: Date) => void
  onDeferTask?: (taskId: string, date: Date) => void
}

// Icon components
function SunriseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  )
}

// Item type icons
function getItemIcon(type: string, className?: string) {
  const iconClass = className || "w-5 h-5"
  const icons: Record<string, React.ReactNode> = {
    stale_followup: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    conflict: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    overdue: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    upcoming_deadline: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    inbox_reminder: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
    ai_suggestion: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    proactive_suggestion: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  }
  return icons[type] || (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

const ITEM_TYPE_COLORS: Record<string, string> = {
  stale_followup: 'text-amber-600 bg-amber-50',
  conflict: 'text-red-500 bg-red-50',
  deferred_reminder: 'text-blue-500 bg-blue-50',
  upcoming_deadline: 'text-orange-500 bg-orange-50',
  inbox_reminder: 'text-neutral-500 bg-neutral-100',
  routine_check: 'text-sage-500 bg-sage-50',
  ai_suggestion: 'text-amber-500 bg-amber-50',
  overdue: 'text-red-600 bg-red-50',
  empty_project: 'text-neutral-400 bg-neutral-100',
  unassigned: 'text-amber-500 bg-amber-50',
  calendar_reminder: 'text-primary-500 bg-primary-50',
  proactive_suggestion: 'text-primary-600 bg-primary-50',
}

const PRIORITY_ACCENTS: Record<string, string> = {
  high: 'border-l-red-400',
  medium: 'border-l-amber-400',
  low: 'border-l-primary-300',
}

export function DailyBriefModal({
  isOpen,
  brief,
  isGenerating,
  onRegenerate,
  onDismiss,
  onItemAction,
  onScheduleTask,
  onDeferTask,
}: DailyBriefModalProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const modalRef = useRef<HTMLDivElement>(null)

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional animation trigger
      setIsAnimating(true)
      // Expand all items by default for immediate visibility
      if (brief?.items) {
        setExpandedItems(new Set(brief.items.slice(0, 3).map(item => item.id)))
      }
    }
  }, [isOpen, brief])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onDismiss()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onDismiss])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

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

  // Date helpers
  const getDate = (daysFromNow: number) => {
    const date = new Date()
    date.setDate(date.getDate() + daysFromNow)
    date.setHours(0, 0, 0, 0)
    return date
  }

  const getThisWeekend = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const daysUntilSaturday = dayOfWeek === 6 ? 0 : dayOfWeek === 0 ? 6 : 6 - dayOfWeek
    const saturday = new Date(today)
    saturday.setDate(today.getDate() + daysUntilSaturday)
    saturday.setHours(0, 0, 0, 0)
    return saturday
  }

  if (!isOpen || !brief) return null

  return createPortal(
    <div className={`fixed inset-0 z-50 ${isAnimating ? 'animate-fade-in' : ''}`}>
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-neutral-900/30 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Modal container - three-quarter height */}
      <div
        ref={modalRef}
        className={`
          absolute bottom-0 left-0 right-0
          h-[85vh] md:h-[80vh]
          bg-bg-elevated
          rounded-t-3xl
          shadow-2xl
          flex flex-col
          overflow-hidden
          ${isAnimating ? 'daily-brief-modal-enter' : ''}
        `}
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 pt-3 pb-2 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>

        {/* Header - Editorial magazine style */}
        <header className="flex-shrink-0 px-6 md:px-10 pb-6 pt-2 border-b border-neutral-200/60">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shadow-sm">
                <SunriseIcon className="w-7 h-7 text-primary-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-600 tracking-wide uppercase">
                  {new Date(brief.briefDate).toLocaleDateString('en-US', { weekday: 'long' })}
                </p>
                <h1 className="font-display text-3xl md:text-4xl text-neutral-900 tracking-tight -mt-1">
                  Morning Brief
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  disabled={isGenerating}
                  className="p-2.5 rounded-xl text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-all disabled:opacity-50"
                  title="Regenerate brief"
                >
                  <RefreshIcon className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={onDismiss}
                className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
                title="Close brief"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Greeting section - featured */}
          <div className="px-6 md:px-10 py-8 bg-gradient-to-b from-primary-50/50 to-transparent">
            <p className="font-display text-2xl md:text-3xl text-neutral-800 leading-snug">
              {brief.greeting}
            </p>
            {brief.summary && (
              <p className="mt-3 text-lg text-neutral-600 leading-relaxed max-w-2xl">
                {brief.summary}
              </p>
            )}
          </div>

          {/* Items list */}
          {brief.items.length > 0 ? (
            <div className="px-4 md:px-8 pb-8">
              <div className="space-y-3">
                {brief.items.map((item) => (
                  <BriefItemCard
                    key={item.id}
                    item={item}
                    isExpanded={expandedItems.has(item.id)}
                    onToggle={() => toggleExpanded(item.id)}
                    onAction={(action) => onItemAction?.(item, action)}
                    onSchedule={(date) => {
                      if (item.relatedEntityType === 'task' && item.relatedEntityId) {
                        onScheduleTask?.(item.relatedEntityId, date)
                      }
                    }}
                    onDefer={(date) => {
                      if (item.relatedEntityType === 'task' && item.relatedEntityId) {
                        onDeferTask?.(item.relatedEntityId, date)
                      }
                    }}
                    getDate={getDate}
                    getThisWeekend={getThisWeekend}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="px-6 md:px-10 py-16 text-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto shadow-sm">
                <SparklesIcon className="w-10 h-10 text-primary-600" />
              </div>
              <h3 className="mt-6 font-display text-2xl text-neutral-800">
                All clear!
              </h3>
              <p className="mt-2 text-neutral-500 max-w-sm mx-auto">
                No items need your attention right now. Enjoy your day!
              </p>
            </div>
          )}
        </div>

        {/* Footer with "Begin Day" action */}
        <div className="flex-shrink-0 px-6 md:px-10 py-4 bg-bg-elevated border-t border-neutral-200/60">
          <button
            onClick={onDismiss}
            className="w-full py-4 px-6 bg-gradient-to-r from-primary-600 to-primary-500 text-white font-medium text-lg rounded-2xl shadow-primary hover:shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            Begin Your Day
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Individual brief item card
interface BriefItemCardProps {
  item: DailyBriefItem
  isExpanded: boolean
  onToggle: () => void
  onAction: (action: DailyBriefActionType) => void
  onSchedule?: (date: Date) => void
  onDefer?: (date: Date) => void
  getDate: (daysFromNow: number) => Date
  getThisWeekend: () => Date
}

function BriefItemCard({
  item,
  isExpanded,
  onToggle,
  onAction,
  onSchedule,
  onDefer,
  getDate,
  getThisWeekend,
}: BriefItemCardProps) {
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)
  const [showDeferPicker, setShowDeferPicker] = useState(false)
  const scheduleRef = useRef<HTMLButtonElement>(null)
  const deferRef = useRef<HTMLButtonElement>(null)
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 })

  const colorClasses = ITEM_TYPE_COLORS[item.type] || 'text-neutral-500 bg-neutral-100'
  const priorityAccent = PRIORITY_ACCENTS[item.priority] || PRIORITY_ACCENTS.low

  const openSchedulePicker = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = scheduleRef.current?.getBoundingClientRect()
    if (rect) {
      setPickerPosition({ top: rect.bottom + 4, left: rect.left })
    }
    setShowSchedulePicker(true)
    setShowDeferPicker(false)
  }, [])

  const openDeferPicker = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = deferRef.current?.getBoundingClientRect()
    if (rect) {
      setPickerPosition({ top: rect.bottom + 4, left: rect.left })
    }
    setShowDeferPicker(true)
    setShowSchedulePicker(false)
  }, [])

  // Close pickers on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.brief-picker-popover') && !target.closest('.brief-picker-trigger')) {
        setShowSchedulePicker(false)
        setShowDeferPicker(false)
      }
    }
    if (showSchedulePicker || showDeferPicker) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [showSchedulePicker, showDeferPicker])

  const handleScheduleSelect = (e: React.MouseEvent, date: Date) => {
    e.stopPropagation()
    onSchedule?.(date)
    setShowSchedulePicker(false)
  }

  const handleDeferSelect = (e: React.MouseEvent, date: Date) => {
    e.stopPropagation()
    onDefer?.(date)
    setShowDeferPicker(false)
  }

  return (
    <div
      className={`
        bg-white rounded-2xl border border-neutral-200/80
        overflow-hidden transition-all duration-200
        hover:shadow-md hover:border-neutral-200
        border-l-4 ${priorityAccent}
      `}
    >
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 text-left"
      >
        <div className="flex items-start gap-4">
          <span className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${colorClasses.split(' ')[1]}`}>
            <span className={colorClasses.split(' ')[0]}>
              {getItemIcon(item.type, "w-5 h-5")}
            </span>
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-neutral-800 text-base">
              {item.title}
            </h3>
            {!isExpanded && (
              <p className="text-sm text-neutral-500 line-clamp-1 mt-0.5">
                {item.description}
              </p>
            )}
          </div>
          <ChevronDownIcon
            className={`w-5 h-5 text-neutral-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-5 pb-5 pt-0">
          <p className="text-sm text-neutral-600 ml-14 mb-4 leading-relaxed">
            {item.description}
          </p>

          {/* Actions */}
          {item.suggestedActions.length > 0 && (
            <div className="flex flex-wrap gap-2 ml-14">
              {item.suggestedActions.map((action, idx) => {
                // Handle schedule action with popover
                if (action.action === 'schedule') {
                  return (
                    <div key={idx} className="relative">
                      <button
                        ref={scheduleRef}
                        onClick={openSchedulePicker}
                        className={`brief-picker-trigger px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                          idx === 0
                            ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        {action.label}
                      </button>
                      {showSchedulePicker && createPortal(
                        <div
                          className="brief-picker-popover fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-xl p-2 min-w-[180px]"
                          style={{ top: pickerPosition.top, left: pickerPosition.left }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="space-y-1">
                            <button
                              onClick={(e) => handleScheduleSelect(e, getDate(0))}
                              className="w-full px-4 py-2.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700 font-medium"
                            >
                              Today
                            </button>
                            <button
                              onClick={(e) => handleScheduleSelect(e, getDate(1))}
                              className="w-full px-4 py-2.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
                            >
                              Tomorrow
                            </button>
                            <button
                              onClick={(e) => handleScheduleSelect(e, getThisWeekend())}
                              className="w-full px-4 py-2.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
                            >
                              This Weekend
                            </button>
                            <button
                              onClick={(e) => handleScheduleSelect(e, getDate(7))}
                              className="w-full px-4 py-2.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
                            >
                              Next Week
                            </button>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  )
                }

                // Handle defer action with popover
                if (action.action === 'defer') {
                  return (
                    <div key={idx} className="relative">
                      <button
                        ref={deferRef}
                        onClick={openDeferPicker}
                        className={`brief-picker-trigger px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                          idx === 0
                            ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        {action.label}
                      </button>
                      {showDeferPicker && createPortal(
                        <div
                          className="brief-picker-popover fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-xl p-2 min-w-[180px]"
                          style={{ top: pickerPosition.top, left: pickerPosition.left }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="space-y-1">
                            <button
                              onClick={(e) => handleDeferSelect(e, getDate(1))}
                              className="w-full px-4 py-2.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                            >
                              Tomorrow
                            </button>
                            <button
                              onClick={(e) => handleDeferSelect(e, getThisWeekend())}
                              className="w-full px-4 py-2.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                            >
                              This Weekend
                            </button>
                            <button
                              onClick={(e) => handleDeferSelect(e, getDate(7))}
                              className="w-full px-4 py-2.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                            >
                              Next Week
                            </button>
                            <button
                              onClick={(e) => handleDeferSelect(e, getDate(14))}
                              className="w-full px-4 py-2.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                            >
                              In 2 Weeks
                            </button>
                            <button
                              onClick={(e) => handleDeferSelect(e, getDate(30))}
                              className="w-full px-4 py-2.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                            >
                              Next Month
                            </button>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  )
                }

                // Regular action button
                return (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAction(action.action)
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                      idx === 0
                        ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {action.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DailyBriefModal
