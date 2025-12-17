import { useState, useCallback, useEffect, useMemo } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import { HeroCard } from './HeroCard'
import { HeroActions } from './HeroActions'
import { HeroProgress } from './HeroProgress'
import { HeroCelebration } from './HeroCelebration'
import { ArrowLeft } from 'lucide-react'
import './hero-mode.css'

export interface HeroModeProps {
  isOpen: boolean
  tasks: TimelineItem[]
  projects?: Project[]
  contacts?: Contact[]
  onClose: () => void
  onComplete: (taskId: string) => void
  onDefer: (taskId: string, date: Date) => void
  onArchive: (taskId: string) => void
  onDelete: (taskId: string) => void
  onOpenDetail: (item: TimelineItem) => void
}

type ExitAnimation = 'complete' | 'defer' | 'skip' | null

/**
 * HeroMode - The Focus Sanctuary
 *
 * A full-screen, card-stack view for focused task execution.
 * Presents one task at a time with beautiful animations and
 * satisfying gestures.
 */
export function HeroMode({
  isOpen,
  tasks,
  projects = [],
  contacts = [],
  onClose,
  onComplete,
  onDefer,
  onArchive,
  onDelete,
  onOpenDetail,
}: HeroModeProps) {
  // Current position in task queue
  const [currentIndex, setCurrentIndex] = useState(0)

  // Track completed tasks within this session
  const [sessionCompletedIds, setSessionCompletedIds] = useState<Set<string>>(new Set())

  // Animation states
  const [exitAnimation, setExitAnimation] = useState<ExitAnimation>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [enterDirection, setEnterDirection] = useState<'up' | 'right'>('up')

  // Filter out already-completed tasks for the queue
  const taskQueue = useMemo(() => {
    return tasks.filter(t => !t.completed && !sessionCompletedIds.has(t.id))
  }, [tasks, sessionCompletedIds])

  // Current task being displayed
  const currentTask = taskQueue[currentIndex] || null

  // Get project and contact for current task
  const currentProject = useMemo(() => {
    if (!currentTask?.projectId) return null
    return projects.find(p => p.id === currentTask.projectId) || null
  }, [currentTask, projects])

  const currentContact = useMemo(() => {
    if (!currentTask?.contactId) return null
    return contacts.find(c => c.id === currentTask.contactId) || null
  }, [currentTask, contacts])

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional reset on open
      setCurrentIndex(0)
      setSessionCompletedIds(new Set())
      setExitAnimation(null)
      setShowCelebration(false)
      setEnterDirection('up')
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
      // Note: We intentionally don't bind arrow keys or Enter to actions
      // because it's too easy to accidentally trigger them while browsing
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentTask, currentIndex, onClose])

  // Helper to get tomorrow's date
  const getTomorrow = useCallback(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    return tomorrow
  }, [])

  // Handle task completion
  const handleComplete = useCallback(() => {
    if (!currentTask) return

    // Trigger exit animation
    setExitAnimation('complete')
    setShowCelebration(true)

    // After animation, move to next task
    setTimeout(() => {
      const taskId = currentTask.id.replace(/^(task|routine|event)-/, '')
      onComplete(taskId)
      setSessionCompletedIds(prev => new Set(prev).add(currentTask.id))
      setExitAnimation(null)
      setEnterDirection('right')

      // Hide celebration after a moment
      setTimeout(() => setShowCelebration(false), 800)
    }, 400)
  }, [currentTask, onComplete])

  // Handle defer to later
  const handleDefer = useCallback((date: Date) => {
    if (!currentTask) return

    // Trigger exit animation
    setExitAnimation('defer')

    // After animation, move to next task
    setTimeout(() => {
      const taskId = currentTask.id.replace(/^(task|routine|event)-/, '')
      onDefer(taskId, date)
      setSessionCompletedIds(prev => new Set(prev).add(currentTask.id))
      setExitAnimation(null)
      setEnterDirection('right')
    }, 350)
  }, [currentTask, onDefer])

  // Handle archive
  const handleArchive = useCallback(() => {
    if (!currentTask) return

    // Trigger exit animation (same as defer - slides away)
    setExitAnimation('defer')

    // After animation, move to next task
    setTimeout(() => {
      const taskId = currentTask.id.replace(/^(task|routine|event)-/, '')
      onArchive(taskId)
      setSessionCompletedIds(prev => new Set(prev).add(currentTask.id))
      setExitAnimation(null)
      setEnterDirection('right')
    }, 350)
  }, [currentTask, onArchive])

  // Handle delete
  const handleDelete = useCallback(() => {
    if (!currentTask) return

    // Trigger exit animation (same as defer - slides away)
    setExitAnimation('defer')

    // After animation, move to next task
    setTimeout(() => {
      const taskId = currentTask.id.replace(/^(task|routine|event)-/, '')
      onDelete(taskId)
      setSessionCompletedIds(prev => new Set(prev).add(currentTask.id))
      setExitAnimation(null)
      setEnterDirection('right')
    }, 350)
  }, [currentTask, onDelete])

  // Handle skip (move to end of queue for this session)
  const handleSkip = useCallback(() => {
    if (!currentTask) return

    // Trigger exit animation
    setExitAnimation('skip')

    // After animation, just advance (task stays in queue but we move past it)
    setTimeout(() => {
      setExitAnimation(null)
      setEnterDirection('right')
      setCurrentIndex(prev => prev + 1)
    }, 400)
  }, [currentTask])

  // Handle opening detail panel
  const handleOpenDetail = useCallback(() => {
    if (!currentTask) return
    onOpenDetail(currentTask)
  }, [currentTask, onOpenDetail])

  // Handle swipe gestures
  const handleSwipeComplete = useCallback(() => {
    handleComplete()
  }, [handleComplete])

  const handleSwipeDefer = useCallback(() => {
    handleDefer(getTomorrow())
  }, [handleDefer, getTomorrow])

  const handleSwipeExit = useCallback(() => {
    onClose()
  }, [onClose])

  // Don't render if not open
  if (!isOpen) return null

  // All tasks done - show celebration
  const allDone = taskQueue.length === 0 || currentIndex >= taskQueue.length

  return (
    <div className="absolute inset-0 z-30 hero-background">
      {/* Subtle radial backdrop */}
      <div className="absolute inset-0 hero-backdrop" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 safe-area-top">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 -ml-3 text-neutral-500 hover:text-neutral-700 transition-colors rounded-lg hover:bg-neutral-100/50"
          aria-label="Exit Hero Mode"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Exit</span>
        </button>

        {!allDone && (
          <div className="text-sm text-neutral-500 font-medium">
            {currentIndex + 1} of {taskQueue.length}
          </div>
        )}
      </header>

      {/* Main content area */}
      <main className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 pb-8" style={{ minHeight: 'calc(100vh - 140px)' }}>
        {allDone ? (
          // Empty state - all done!
          <div className="text-center animate-fade-in-up">
            <div className="text-6xl mb-6 hero-empty-emoji">
              🎉
            </div>
            <h2 className="font-display text-3xl text-neutral-800 mb-3">
              All caught up!
            </h2>
            <p className="text-neutral-500 mb-8 max-w-xs mx-auto">
              You've completed all your tasks for this time block. Take a breath.
            </p>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors shadow-primary"
            >
              Back to Today
            </button>
          </div>
        ) : currentTask ? (
          <>
            {/* The Hero Card */}
            <HeroCard
              key={currentTask.id}
              task={currentTask}
              project={currentProject}
              contact={currentContact}
              exitAnimation={exitAnimation}
              enterDirection={enterDirection}
              onSwipeComplete={handleSwipeComplete}
              onSwipeDefer={handleSwipeDefer}
              onSwipeExit={handleSwipeExit}
            />

            {/* Celebration overlay */}
            <HeroCelebration show={showCelebration} />
          </>
        ) : null}
      </main>

      {/* Footer with actions and progress */}
      {!allDone && currentTask && (
        <footer className="relative z-10 px-6 pb-8 safe-area-bottom">
          {/* Action buttons */}
          <HeroActions
            onComplete={handleComplete}
            onDefer={handleDefer}
            onMore={handleOpenDetail}
            onSkip={handleSkip}
            onArchive={handleArchive}
            onDelete={handleDelete}
            currentScheduledFor={currentTask.originalTask?.scheduledFor}
            currentIsAllDay={currentTask.allDay}
          />

          {/* Progress dots */}
          <div className="mt-6 flex justify-center">
            <HeroProgress
              total={taskQueue.length}
              current={currentIndex}
              completedCount={sessionCompletedIds.size}
            />
          </div>
        </footer>
      )}
    </div>
  )
}

export default HeroMode
