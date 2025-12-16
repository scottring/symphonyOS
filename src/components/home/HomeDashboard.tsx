import { useState, useMemo, useEffect } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import type { Project } from '@/types/project'
import type { DailyBrief as DailyBriefType, DailyBriefItem, DailyBriefActionType } from '@/types/action'
// Daily Brief disabled for now
// import { DailyBriefModal } from '@/components/brief/DailyBriefModal'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { useAuth } from '@/hooks/useAuth'

interface HomeDashboardProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  projects: Project[]
  brief?: DailyBriefType | null
  briefLoading?: boolean
  briefGenerating?: boolean
  onGenerateBrief?: (force?: boolean) => void
  onDismissBrief?: () => void
  onBriefItemAction?: (item: DailyBriefItem, action: DailyBriefActionType) => void
  onScheduleTask?: (taskId: string, date: Date) => void
  onDeferTask?: (taskId: string, date: Date) => void
  onNavigateToSchedule: () => void
  onNavigateToContext: (context: 'work' | 'family' | 'personal') => void
  onNavigateToInbox: () => void
  onNavigateToProjects: () => void
  /** Whether to auto-show the Daily Brief modal */
  autoShowDailyBrief?: boolean
}

// Time-based greeting
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// Format today's date elegantly
function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function HomeDashboard({
  tasks,
  events,
  routines,
  projects,
  brief,
  briefLoading,
  briefGenerating,
  onGenerateBrief,
  onDismissBrief,
  onBriefItemAction,
  onScheduleTask,
  onDeferTask,
  onNavigateToSchedule,
  onNavigateToContext,
  onNavigateToInbox,
  onNavigateToProjects,
  autoShowDailyBrief = true,
}: HomeDashboardProps) {
  // Daily Brief disabled for now
  void onDismissBrief
  void onBriefItemAction
  void brief
  void briefLoading
  void briefGenerating
  void onGenerateBrief
  void onScheduleTask
  void onDeferTask
  void autoShowDailyBrief

  const [mounted, setMounted] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount animation state
    setMounted(true)
  }, [])

  // Get user's first name
  const userName = useMemo(() => {
    if (!user) return 'there'
    // Try to get from user_metadata first
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name
    if (fullName) {
      return fullName.split(' ')[0]
    }
    // Fall back to email prefix
    if (user.email) {
      const emailName = user.email.split('@')[0]
      // Capitalize first letter
      return emailName.charAt(0).toUpperCase() + emailName.slice(1)
    }
    return 'there'
  }, [user])

  // Calculate clarity score
  const clarityMetrics = useSystemHealth({
    tasks,
    projects,
    routines,
  })

  // Calculate stats
  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTime = today.getTime()

    // Helper to convert UTC midnight date to local date value for comparison
    // scheduled_for is stored as midnight UTC, so we extract UTC date components
    const getLocalDateValue = (date: Date | string): number => {
      const d = date instanceof Date ? date : new Date(date)
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime()
    }

    const incompleteTasks = tasks.filter(t => !t.completed)
    const todayTasks = incompleteTasks.filter(t => {
      if (!t.scheduledFor) return false
      return getLocalDateValue(t.scheduledFor) === todayTime
    })

    const overdue = incompleteTasks.filter(t => {
      if (!t.scheduledFor) return false
      return getLocalDateValue(t.scheduledFor) < todayTime
    })

    const inbox = incompleteTasks.filter(t => !t.scheduledFor && !t.isSomeday)

    const todayEvents = events.filter(e => {
      const startStr = e.start_time || e.startTime || ''
      if (!startStr) return false
      // Calendar events may have specific times, not just midnight UTC
      const start = new Date(startStr)
      return start.getFullYear() === today.getFullYear() &&
        start.getMonth() === today.getMonth() &&
        start.getDate() === today.getDate()
    })

    const activeRoutines = routines.filter(r => r.visibility === 'active')

    // Context counts
    const workTasks = incompleteTasks.filter(t => t.context === 'work').length
    const familyTasks = incompleteTasks.filter(t => t.context === 'family').length
    const personalTasks = incompleteTasks.filter(t => t.context === 'personal').length

    return {
      todayTasks: todayTasks.length,
      overdue: overdue.length,
      inbox: inbox.length,
      todayEvents: todayEvents.length,
      activeRoutines: activeRoutines.length,
      activeProjects: projects.filter(p => p.status === 'in_progress').length,
      workTasks,
      familyTasks,
      personalTasks,
    }
  }, [tasks, events, routines, projects])

  // Daily Brief disabled for now
  // const hasBrief = brief && !brief.dismissedAt
  // const showBriefSkeleton = (briefLoading || briefGenerating) && !brief

  return (
    <div className="min-h-full bg-bg-base">
      {/* Hero Section - Clean and Simple */}
      <div className="max-w-6xl mx-auto px-6 pb-6 md:px-12">
        <div
          className={`transition-all duration-500 ease-out ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <p className="text-neutral-500 text-sm tracking-wide mb-2">
            {formatDate()}
          </p>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <h1 className="font-display text-4xl md:text-5xl text-neutral-900 tracking-tight">
              {getGreeting()}, {userName}
            </h1>

            {/* Clarity Score */}
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white border border-neutral-200 shadow-sm">
              <ClarityRing
                score={clarityMetrics.score}
                color={clarityMetrics.healthColor}
                size={44}
              />
              <div>
                <p className="text-sm font-medium text-neutral-800">
                  {clarityMetrics.score}% Clarity
                </p>
                <p className="text-xs text-neutral-500">{clarityMetrics.healthStatus}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats Pills */}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={onNavigateToSchedule}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-neutral-200 hover:border-primary-300 hover:bg-primary-50 transition-all text-sm"
            >
              <span className="w-2 h-2 rounded-full bg-primary-500" />
              <span className="text-neutral-700">{stats.todayTasks} tasks today</span>
            </button>

            <button
              onClick={onNavigateToSchedule}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-neutral-200 hover:border-accent-300 hover:bg-accent-50 transition-all text-sm"
            >
              <span className="w-2 h-2 rounded-full bg-accent-500" />
              <span className="text-neutral-700">{stats.todayEvents} events</span>
            </button>

            {stats.overdue > 0 && (
              <button
                onClick={onNavigateToSchedule}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 hover:border-red-300 transition-all text-sm"
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-700">{stats.overdue} overdue</span>
              </button>
            )}

            {stats.inbox > 0 && (
              <button
                onClick={onNavigateToInbox}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 hover:border-amber-300 transition-all text-sm"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-amber-700">{stats.inbox} in inbox</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 pb-12 md:px-12">
        {/* Daily Brief Section - Disabled for now */}

        {/* Life Contexts - Compact Cards */}
        <section
          className={`mt-10 transition-all duration-700 delay-400 ease-out ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <h2 className="font-display text-xl text-neutral-800 mb-4">Life Contexts</h2>

          <div className="grid grid-cols-3 gap-3 md:gap-4">
            {/* Work */}
            <button
              onClick={() => onNavigateToContext('work')}
              className="group relative overflow-hidden rounded-xl p-4 md:p-5 text-left transition-all hover:shadow-lg bg-neutral-900 hover:bg-neutral-800"
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full blur-xl translate-x-4 -translate-y-4" />
              <div className="relative">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-white/70 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="font-display text-lg md:text-xl text-white">{stats.workTasks}</p>
                <p className="text-xs md:text-sm text-neutral-400">Work</p>
              </div>
            </button>

            {/* Family */}
            <button
              onClick={() => onNavigateToContext('family')}
              className="group relative overflow-hidden rounded-xl p-4 md:p-5 text-left transition-all hover:shadow-lg bg-accent-500 hover:bg-accent-600"
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-xl translate-x-4 -translate-y-4" />
              <div className="relative">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-white/80 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <p className="font-display text-lg md:text-xl text-white">{stats.familyTasks}</p>
                <p className="text-xs md:text-sm text-white/70">Family</p>
              </div>
            </button>

            {/* Personal */}
            <button
              onClick={() => onNavigateToContext('personal')}
              className="group relative overflow-hidden rounded-xl p-4 md:p-5 text-left transition-all hover:shadow-lg bg-primary-600 hover:bg-primary-700"
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-xl translate-x-4 -translate-y-4" />
              <div className="relative">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-white/80 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <p className="font-display text-lg md:text-xl text-white">{stats.personalTasks}</p>
                <p className="text-xs md:text-sm text-white/70">Personal</p>
              </div>
            </button>
          </div>
        </section>

        {/* Quick Access */}
        <section
          className={`mt-10 transition-all duration-700 delay-500 ease-out ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={onNavigateToSchedule}
              className="group rounded-xl border border-neutral-200 bg-white p-4 text-left hover:shadow-md hover:border-neutral-300 transition-all"
            >
              <svg className="w-5 h-5 text-primary-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="font-medium text-neutral-900 text-sm">Today</p>
              <p className="text-xs text-neutral-500">View schedule</p>
            </button>

            <button
              onClick={onNavigateToProjects}
              className="group rounded-xl border border-neutral-200 bg-white p-4 text-left hover:shadow-md hover:border-neutral-300 transition-all"
            >
              <svg className="w-5 h-5 text-sage-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <p className="font-medium text-neutral-900 text-sm">Projects</p>
              <p className="text-xs text-neutral-500">{stats.activeProjects} active</p>
            </button>

            <button
              onClick={onNavigateToSchedule}
              className="group rounded-xl border border-neutral-200 bg-white p-4 text-left hover:shadow-md hover:border-neutral-300 transition-all"
            >
              <svg className="w-5 h-5 text-accent-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p className="font-medium text-neutral-900 text-sm">Routines</p>
              <p className="text-xs text-neutral-500">{stats.activeRoutines} active</p>
            </button>

            <button
              onClick={onNavigateToInbox}
              className="group rounded-xl border border-neutral-200 bg-white p-4 text-left hover:shadow-md hover:border-neutral-300 transition-all"
            >
              <svg className="w-5 h-5 text-amber-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="font-medium text-neutral-900 text-sm">Inbox</p>
              <p className="text-xs text-neutral-500">{stats.inbox} to triage</p>
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * ClarityRing - Compact donut chart showing clarity percentage
 */
interface ClarityRingProps {
  score: number
  color: 'excellent' | 'good' | 'fair' | 'needsAttention'
  size?: number
}

function ClarityRing({ score, color, size = 48 }: ClarityRingProps) {
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const offset = circumference - progress

  // Color based on health status
  const ringColor = {
    excellent: 'stroke-primary-500',
    good: 'stroke-sage-500',
    fair: 'stroke-amber-500',
    needsAttention: 'stroke-orange-500',
  }[color]

  const textColor = {
    excellent: 'text-primary-600',
    good: 'text-sage-600',
    fair: 'text-amber-600',
    needsAttention: 'text-orange-600',
  }[color]

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-200"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${ringColor} transition-all duration-500`}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-semibold ${textColor}`}>
          {score}
        </span>
      </div>
    </div>
  )
}
