import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, CalendarRange, Check, MoreHorizontal, Trash2 } from 'lucide-react'
import { useMobile } from '@/hooks/useMobile'
import type { Task } from '@/types/task'

interface StagingFloatProps {
  inboxTasks: Task[]
  weekTasks: Task[]
  onPullToToday: (taskId: string) => void
  onSelectTask: (taskId: string) => void
  onCompleteTask?: (taskId: string) => void
  onDeferTask?: (taskId: string, target: 'month' | 'quarter') => void
  onDeleteTask?: (taskId: string) => void
  /** Render as a compact inline trigger (for desktop stats row) */
  inline?: boolean
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
    </svg>
  )
}

interface RowMenuProps {
  taskId: string
  onDefer?: (target: 'month' | 'quarter') => void
  onDelete?: () => void
}

function RowMenu({ onDefer, onDelete }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const estimatedHeight = 140
      const spaceBelow = window.innerHeight - rect.bottom - 4
      const flipUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight
      setPos({
        top: flipUp ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (!onDefer && !onDelete) return null

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        className="flex-shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/70 transition-colors
                   md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 aria-expanded:opacity-100"
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-1.5 min-w-[170px]"
          style={{ top: pos.top, right: pos.right }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {onDefer && (
            <>
              <button
                onClick={() => { onDefer('month'); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-neutral-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
              >
                <CalendarDays className="w-4 h-4" />
                <span>This Month</span>
              </button>
              <button
                onClick={() => { onDefer('quarter'); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-neutral-700 hover:bg-purple-50 hover:text-purple-700 transition-colors"
              >
                <CalendarRange className="w-4 h-4" />
                <span>Someday</span>
              </button>
            </>
          )}
          {onDefer && onDelete && <div className="border-t border-neutral-100 my-1" />}
          {onDelete && (
            <button
              onClick={() => { onDelete(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

export function StagingFloat({
  inboxTasks,
  weekTasks,
  onPullToToday,
  onSelectTask,
  onCompleteTask,
  onDeferTask,
  onDeleteTask,
  inline,
}: StagingFloatProps) {
  const [open, setOpen] = useState(false)
  const isMobile = useMobile()

  const totalCount = inboxTasks.length + weekTasks.length

  const handlePull = useCallback((e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    onPullToToday(taskId)
  }, [onPullToToday])

  const handleComplete = useCallback((e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    onCompleteTask?.(taskId)
  }, [onCompleteTask])

  if (totalCount === 0) return null

  // Combined list: inbox first (newest first), then week tasks
  const sortedInbox = [...inboxTasks].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  const combined = [...sortedInbox, ...weekTasks]

  const panelContent = open && (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className={`z-50 bg-bg-elevated rounded-2xl border border-neutral-200/80 shadow-xl animate-fade-in-scale overflow-hidden ${
        inline ? 'fixed top-14 left-3 right-3 md:absolute md:top-full md:mt-2 md:right-0 md:left-auto md:w-[380px]' : 'absolute left-0 right-0 top-full mt-2'
      }`}>
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-neutral-800">
              This Week
            </h3>
            <span className="text-xs text-neutral-400">
              {inboxTasks.length > 0 && `${inboxTasks.length} inbox`}
              {inboxTasks.length > 0 && weekTasks.length > 0 && ' · '}
              {weekTasks.length > 0 && `${weekTasks.length} this week`}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Task list */}
        <div
          className="px-3 pb-4 max-h-[360px] overflow-y-auto"
          style={{ scrollbarWidth: 'thin' }}
        >
          <div className="flex flex-col gap-1">
            {combined.map((task) => {
              const isInbox = task.bucket === 'inbox'
              return (
                <div
                  key={task.id}
                  data-selectable
                  className="flex items-start gap-2 px-2 py-2.5 rounded-xl hover:bg-neutral-100/60 transition-colors group"
                >
                  {/* Complete checkbox (or source icon if no handler) */}
                  {onCompleteTask ? (
                    <button
                      onClick={(e) => handleComplete(e, task.id)}
                      className={`group/check flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border transition-all flex items-center justify-center
                        ${isInbox ? 'border-neutral-300' : 'border-blue-300'}
                        hover:border-primary-500 hover:bg-primary-50`}
                      aria-label="Mark complete"
                      title="Mark complete"
                    >
                      <Check className="w-2.5 h-2.5 text-primary-600 opacity-0 group-hover/check:opacity-100 transition-opacity" />
                    </button>
                  ) : (
                    <div className="flex-shrink-0 mt-0.5">
                      {isInbox ? (
                        <InboxIcon className="w-4 h-4 text-neutral-400" />
                      ) : (
                        <span className="block w-2.5 h-2.5 mt-0.5 rounded-full bg-blue-400" />
                      )}
                    </div>
                  )}

                  {/* Title — clickable to open task */}
                  <button
                    onClick={() => {
                      onSelectTask(task.id)
                      setOpen(false)
                    }}
                    className="flex-1 text-left text-sm text-neutral-700 leading-snug cursor-pointer min-w-0"
                  >
                    {task.title}
                  </button>

                  {/* Pull button */}
                  <button
                    onClick={(e) => handlePull(e, task.id)}
                    className="flex-shrink-0 mt-0.5 px-2.5 py-1 rounded-lg bg-primary-50 text-primary-600 text-xs font-semibold
                               hover:bg-primary-100 active:bg-primary-200 transition-colors
                               md:opacity-0 md:group-hover:opacity-100"
                  >
                    Today
                  </button>

                  {/* More menu — defer / delete */}
                  <RowMenu
                    taskId={task.id}
                    onDefer={onDeferTask ? (target) => onDeferTask(task.id, target) : undefined}
                    onDelete={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )

  // Portal the panel to document.body on mobile so it escapes ancestor transforms
  // (CSS transforms create a new containing block, breaking position:fixed)
  // On desktop, keep it in-place so md:absolute positioning works relative to parent
  const panel = inline && isMobile
    ? panelContent && createPortal(panelContent, document.body)
    : panelContent

  // Inline mode: compact trigger that sits in the stats row
  if (inline) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen(prev => !prev)}
          className={`
            flex items-center gap-1.5 px-1.5 py-1 md:gap-2 md:px-2 md:py-1.5 rounded-lg transition-colors
            ${open
              ? 'bg-primary-50 text-primary-700'
              : 'hover:bg-neutral-100/60 text-neutral-500'
            }
          `}
        >
          <InboxIcon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${open ? 'text-primary-500' : 'text-neutral-400'}`} />
          <span className="hidden md:inline text-sm font-medium whitespace-nowrap">
            This week
          </span>
          <span className={`
            flex items-center justify-center min-w-[18px] h-[18px] md:min-w-[20px] md:h-5 px-1 rounded-full text-[10px] md:text-[11px] font-semibold tabular-nums
            ${open ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-500'}
          `}>
            {totalCount}
          </span>
        </button>
        {panel}
      </div>
    )
  }

  // Block mode: standalone trigger (mobile)
  return (
    <div className="relative mb-3 md:mb-5">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`
          flex items-center gap-2.5 px-3.5 py-2 rounded-xl
          border transition-all duration-200
          ${open
            ? 'bg-white border-primary-200 shadow-md'
            : 'bg-white/80 border-neutral-200/60 hover:border-neutral-300 hover:shadow-sm'
          }
        `}
      >
        <InboxIcon className={`w-4 h-4 ${open ? 'text-primary-500' : 'text-neutral-400'}`} />
        <span className={`text-sm font-medium ${open ? 'text-primary-700' : 'text-neutral-600'}`}>
          This week
        </span>
        <span className={`
          flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-semibold tabular-nums
          ${open ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-500'}
        `}>
          {totalCount}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {panel}
    </div>
  )
}
