import { useState, useMemo, useEffect } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import type { Project } from '@/types/project'
import type { DailyBrief as DailyBriefType, DailyBriefItem, DailyBriefActionType } from '@/types/action'
import { DailyBrief, DailyBriefSkeleton } from '@/components/brief'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { useAuth } from '@/hooks/useAuth'

interface HomeDashboardProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  projects: Project[]
  brief: DailyBriefType | null
  briefLoading: boolean
  briefGenerating: boolean
  onGenerateBrief: (force?: boolean) => void
  onDismissBrief: () => void
  onBriefItemAction: (item: DailyBriefItem, action: DailyBriefActionType) => void
  onNavigateToSchedule: () => void
  onNavigateToContext: (context: 'work' | 'family' | 'personal') => void
  onNavigateToInbox: () => void
  onNavigateToProjects: () => void
}

// Time-based greeting
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// Get time period for illustration styling
function getTimePeriod(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours()
  if (hour < 5) return 'evening'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
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
  onNavigateToSchedule,
  onNavigateToContext,
  onNavigateToInbox,
  onNavigateToProjects,
}: HomeDashboardProps) {
  const [mounted, setMounted] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
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

    const incompleteTasks = tasks.filter(t => !t.completed)
    const todayTasks = incompleteTasks.filter(t => {
      if (!t.scheduledFor) return false
      const scheduled = new Date(t.scheduledFor)
      scheduled.setHours(0, 0, 0, 0)
      return scheduled.getTime() === today.getTime()
    })

    const overdue = incompleteTasks.filter(t => {
      if (!t.scheduledFor) return false
      const scheduled = new Date(t.scheduledFor)
      scheduled.setHours(0, 0, 0, 0)
      return scheduled.getTime() < today.getTime()
    })

    const inbox = incompleteTasks.filter(t => !t.scheduledFor && !t.isSomeday)

    const todayEvents = events.filter(e => {
      const startStr = e.start_time || e.startTime || ''
      if (!startStr) return false
      const start = new Date(startStr)
      start.setHours(0, 0, 0, 0)
      return start.getTime() === today.getTime()
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

  const shouldShowBrief = brief && !brief.dismissedAt
  const showBriefSkeleton = (briefLoading || briefGenerating) && !brief
  const timePeriod = getTimePeriod()

  return (
    <div className="min-h-full bg-bg-base">
      {/* Hero Section with Illustration */}
      <div className="relative overflow-hidden">
        {/* Gradient background based on time of day */}
        <div className={`absolute inset-0 ${
          timePeriod === 'morning'
            ? 'bg-gradient-to-br from-amber-50 via-orange-50/30 to-primary-50/20'
            : timePeriod === 'afternoon'
            ? 'bg-gradient-to-br from-sky-50 via-primary-50/30 to-accent-50/20'
            : 'bg-gradient-to-br from-indigo-50 via-purple-50/30 to-primary-50/20'
        }`} />

        <div className="relative">
          <div className="max-w-6xl mx-auto px-6 md:px-12">
            <div className="flex items-center min-h-[320px] md:min-h-[380px]">
              {/* Left: Greeting & Stats */}
              <div
                className={`flex-1 py-12 md:py-16 transition-all duration-700 ease-out ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
              >
                <p className="text-neutral-500 text-sm tracking-wide uppercase mb-3">
                  {formatDate()}
                </p>
                <h1 className="font-display text-5xl md:text-6xl lg:text-7xl text-neutral-900 tracking-tight leading-none">
                  {getGreeting()}
                </h1>

                {/* Clarity Score inline */}
                <div className="mt-6 flex items-center gap-4">
                  <ClarityRing
                    score={clarityMetrics.score}
                    color={clarityMetrics.healthColor}
                    size={56}
                  />
                  <div>
                    <p className="text-lg font-display text-neutral-800">
                      {clarityMetrics.score}% Clarity
                    </p>
                    <p className="text-sm text-neutral-500">{clarityMetrics.healthStatus}</p>
                  </div>
                </div>

                {/* Quick Stats Pills */}
                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    onClick={onNavigateToSchedule}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur border border-neutral-200 hover:border-primary-300 hover:bg-white transition-all text-sm"
                  >
                    <span className="w-2 h-2 rounded-full bg-primary-500" />
                    <span className="font-medium text-neutral-700">{stats.todayTasks} tasks</span>
                  </button>

                  <button
                    onClick={onNavigateToSchedule}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur border border-neutral-200 hover:border-accent-300 hover:bg-white transition-all text-sm"
                  >
                    <span className="w-2 h-2 rounded-full bg-accent-500" />
                    <span className="font-medium text-neutral-700">{stats.todayEvents} events</span>
                  </button>

                  {stats.overdue > 0 && (
                    <button
                      onClick={onNavigateToSchedule}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50/80 backdrop-blur border border-red-200 hover:border-red-300 hover:bg-red-50 transition-all text-sm"
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="font-medium text-red-700">{stats.overdue} overdue</span>
                    </button>
                  )}

                  {stats.inbox > 0 && (
                    <button
                      onClick={onNavigateToInbox}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50/80 backdrop-blur border border-amber-200 hover:border-amber-300 hover:bg-amber-50 transition-all text-sm"
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="font-medium text-amber-700">{stats.inbox} in inbox</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right: Tree & House Illustration */}
              <div
                className={`hidden md:block w-80 lg:w-96 transition-all duration-1000 delay-200 ease-out ${
                  mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
                }`}
              >
                <HomeIllustration timePeriod={timePeriod} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 pb-12 md:px-12">
        {/* Daily Brief Section */}
        <section
          className={`-mt-4 transition-all duration-700 delay-300 ease-out ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {shouldShowBrief ? (
            <DailyBrief
              brief={brief}
              isGenerating={briefGenerating}
              onRegenerate={() => onGenerateBrief(true)}
              onDismiss={onDismissBrief}
              onItemAction={onBriefItemAction}
            />
          ) : showBriefSkeleton ? (
            <DailyBriefSkeleton />
          ) : (
            /* Generate Brief Card */
            <button
              onClick={() => onGenerateBrief(true)}
              disabled={briefGenerating}
              className="w-full group relative overflow-hidden rounded-2xl border border-primary-200 bg-gradient-to-br from-white to-primary-50/30 p-6 md:p-8 text-left transition-all hover:shadow-xl hover:border-primary-300 disabled:opacity-60"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="font-display text-xl md:text-2xl text-neutral-900 mb-1">
                    Generate your daily brief
                  </h2>
                  <p className="text-neutral-500 text-sm md:text-base">
                    AI-powered insights about what needs your attention today
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-primary-600 font-medium">
                  <span>Start</span>
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </button>
          )}
        </section>

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
 * Beautiful cottage illustration with integrated greeting and clarity score
 * House and tree on the right, greeting text on the left
 * Adapts colors based on time of day
 */
function HomeIllustration({
  timePeriod,
  userName,
  clarityScore,
  clarityColor
}: {
  timePeriod: 'morning' | 'afternoon' | 'evening'
  userName: string
  clarityScore: number
  clarityColor: 'excellent' | 'good' | 'fair' | 'needsAttention'
}) {
  // Time-based greeting
  const greeting = timePeriod === 'morning'
    ? 'Good morning'
    : timePeriod === 'afternoon'
    ? 'Good afternoon'
    : 'Good evening'

  // Color schemes for different times
  const colors = {
    morning: {
      skyTop: '#87CEEB',
      skyBottom: '#B0E0E6',
      grass: '#4CAF50',
      grassDark: '#388E3C',
      clouds: '#FFFFFF',
      woodLight: '#DEB887',
      woodDark: '#8B4513',
      roof: '#607D8B',
      roofDark: '#455A64',
      stone: '#9E9E9E',
      stoneDark: '#757575',
      glass: '#87CEEB',
      foliage: '#66BB6A',
      foliageDark: '#43A047',
      flowers: '#E91E63',
      textColor: '#1a1a1a',
    },
    afternoon: {
      skyTop: '#64B5F6',
      skyBottom: '#90CAF9',
      grass: '#4CAF50',
      grassDark: '#388E3C',
      clouds: '#FFFFFF',
      woodLight: '#DEB887',
      woodDark: '#8B4513',
      roof: '#607D8B',
      roofDark: '#455A64',
      stone: '#9E9E9E',
      stoneDark: '#757575',
      glass: '#81D4FA',
      foliage: '#66BB6A',
      foliageDark: '#43A047',
      flowers: '#E91E63',
      textColor: '#1a1a1a',
    },
    evening: {
      skyTop: '#1a237e',
      skyBottom: '#3949ab',
      grass: '#2E7D32',
      grassDark: '#1B5E20',
      clouds: '#5C6BC0',
      woodLight: '#A1887F',
      woodDark: '#5D4037',
      roof: '#37474F',
      roofDark: '#263238',
      stone: '#616161',
      stoneDark: '#424242',
      glass: '#FFD54F',
      foliage: '#2E7D32',
      foliageDark: '#1B5E20',
      flowers: '#AD1457',
      textColor: '#FFFFFF',
    },
  }

  const c = colors[timePeriod]

  // Clarity ring colors
  const ringColors = {
    excellent: '#22c55e',
    good: '#84cc16',
    fair: '#f59e0b',
    needsAttention: '#f97316',
  }
  const ringColor = ringColors[clarityColor]

  // Calculate ring progress
  const ringRadius = 38
  const ringStroke = 6
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringProgress = (clarityScore / 100) * ringCircumference
  const ringOffset = ringCircumference - ringProgress

  return (
    <svg
      viewBox="0 0 800 400"
      className="w-full h-auto rounded-2xl shadow-lg"
      style={{ transition: 'all 0.5s ease' }}
    >
      <defs>
        <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={c.skyTop} />
          <stop offset="100%" stopColor={c.skyBottom} />
        </linearGradient>
        <linearGradient id="grassGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={c.grass} />
          <stop offset="100%" stopColor={c.grassDark} />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect x="0" y="0" width="800" height="400" fill="url(#skyGrad)" />

      {/* Clouds */}
      <g fill={c.clouds} opacity="0.9">
        <ellipse cx="120" cy="60" rx="50" ry="25" />
        <ellipse cx="160" cy="55" rx="40" ry="20" />
        <ellipse cx="80" cy="55" rx="35" ry="18" />

        <ellipse cx="350" cy="45" rx="45" ry="22" />
        <ellipse cx="390" cy="40" rx="35" ry="18" />
        <ellipse cx="310" cy="42" rx="30" ry="15" />

        <ellipse cx="650" cy="70" rx="55" ry="28" />
        <ellipse cx="700" cy="65" rx="40" ry="20" />
        <ellipse cx="600" cy="68" rx="35" ry="18" />
      </g>

      {/* Ground/Grass */}
      <path d="M0,280 Q400,260 800,280 L800,400 L0,400 Z" fill="url(#grassGrad)" />

      {/* Path to house */}
      <path
        d="M480,400 Q500,350 520,320 Q540,310 560,320"
        fill="none"
        stroke={c.stoneDark}
        strokeWidth="40"
        strokeLinecap="round"
      />
      <path
        d="M480,400 Q500,350 520,320 Q540,310 560,320"
        fill="none"
        stroke={c.stone}
        strokeWidth="35"
        strokeLinecap="round"
      />

      {/* Stone wall */}
      <g transform="translate(620, 290)">
        {[0, 30, 60, 90, 120, 150].map((x, i) => (
          <g key={i}>
            <rect x={x} y="0" width="28" height="18" rx="3" fill={c.stone} stroke={c.stoneDark} strokeWidth="1" />
            <rect x={x + 15} y="20" width="28" height="18" rx="3" fill={c.stone} stroke={c.stoneDark} strokeWidth="1" />
            <rect x={x} y="40" width="28" height="18" rx="3" fill={c.stone} stroke={c.stoneDark} strokeWidth="1" />
          </g>
        ))}
      </g>

      {/* House */}
      <g transform="translate(500, 120)">
        {/* Chimney */}
        <rect x="130" y="20" width="30" height="60" fill={c.stone} />
        <rect x="128" y="15" width="34" height="8" fill={c.stoneDark} />

        {/* Main wall */}
        <rect x="20" y="80" width="180" height="120" fill={c.woodLight} stroke={c.woodDark} strokeWidth="2" />

        {/* Wood planks */}
        {[95, 110, 125, 140, 155, 170, 185].map((y) => (
          <line key={y} x1="20" y1={y} x2="200" y2={y} stroke={c.woodDark} strokeWidth="1" opacity="0.3" />
        ))}

        {/* Roof */}
        <path d="M0,80 L110,10 L220,80 Z" fill={c.roof} />
        <path d="M0,80 L110,10 L110,80 Z" fill={c.roofDark} opacity="0.3" />
        <line x1="0" y1="80" x2="220" y2="80" stroke={c.roofDark} strokeWidth="3" />

        {/* Big front window */}
        <g transform="translate(55, 40)">
          <rect x="0" y="0" width="110" height="80" fill={c.woodDark} rx="2" />
          <rect x="5" y="5" width="100" height="70" fill={c.glass} />
          <line x1="55" y1="5" x2="55" y2="75" stroke={c.woodDark} strokeWidth="4" />
          <line x1="5" y1="40" x2="105" y2="40" stroke={c.woodDark} strokeWidth="4" />
          {/* Window frame top */}
          <path d="M5,5 L55,5 L55,40 L5,40 Z" fill={c.glass} />
          <path d="M55,5 L105,5 L105,40 L55,40 Z" fill={c.glass} />
        </g>

        {/* Door */}
        <rect x="85" y="140" width="50" height="60" fill={c.woodDark} rx="2" />
        <circle cx="125" cy="175" r="4" fill={c.stoneDark} />

        {/* Flower boxes */}
        <g transform="translate(40, 125)">
          <rect x="0" y="0" width="35" height="12" fill={c.woodDark} />
          <circle cx="8" cy="-5" r="6" fill={c.flowers} />
          <circle cx="18" cy="-8" r="5" fill={c.flowers} opacity="0.8" />
          <circle cx="28" cy="-4" r="6" fill={c.flowers} />
        </g>
        <g transform="translate(145, 125)">
          <rect x="0" y="0" width="35" height="12" fill={c.woodDark} />
          <circle cx="8" cy="-5" r="6" fill={c.flowers} />
          <circle cx="18" cy="-8" r="5" fill={c.flowers} opacity="0.8" />
          <circle cx="28" cy="-4" r="6" fill={c.flowers} />
        </g>

        {/* Stone foundation */}
        <rect x="15" y="195" width="190" height="15" fill={c.stone} />
      </g>

      {/* Tree */}
      <g transform="translate(720, 150)">
        {/* Trunk */}
        <path d="M-15,180 Q-25,120 -10,60 Q0,40 10,60 Q25,120 15,180 Z" fill={c.woodDark} />

        {/* Foliage */}
        <ellipse cx="0" cy="30" rx="60" ry="50" fill={c.foliageDark} />
        <ellipse cx="-20" cy="10" rx="45" ry="40" fill={c.foliage} />
        <ellipse cx="25" cy="20" rx="40" ry="35" fill={c.foliage} />
        <ellipse cx="0" cy="-10" rx="35" ry="30" fill={c.foliage} />

        {/* Leaf details */}
        <ellipse cx="-30" cy="25" rx="8" ry="12" fill={c.foliageDark} opacity="0.5" />
        <ellipse cx="35" cy="15" rx="6" ry="10" fill={c.foliageDark} opacity="0.5" />
        <ellipse cx="5" cy="-5" rx="5" ry="8" fill={c.foliageDark} opacity="0.5" />
      </g>

      {/* Small bushes */}
      <g fill={c.foliage}>
        <ellipse cx="470" cy="340" rx="25" ry="18" />
        <ellipse cx="495" cy="345" rx="20" ry="15" />
      </g>

      {/* Sparkle decorations */}
      <g fill={c.textColor} opacity="0.3">
        <path d="M750,350 L752,355 L757,355 L753,358 L755,363 L750,360 L745,363 L747,358 L743,355 L748,355 Z" />
      </g>

      {/* === LEFT SIDE: Greeting and Clarity Score === */}

      {/* Greeting text */}
      <text
        x="50"
        y="140"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="42"
        fontWeight="600"
        fill={c.textColor}
      >
        {greeting},
      </text>
      <text
        x="50"
        y="195"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="48"
        fontWeight="700"
        fill={c.textColor}
      >
        {userName}
      </text>

      {/* Clarity Score Ring */}
      <g transform="translate(120, 300)">
        {/* Background ring */}
        <circle
          cx="0"
          cy="0"
          r={ringRadius}
          fill="none"
          stroke={c.textColor}
          strokeWidth={ringStroke}
          opacity="0.15"
        />
        {/* Progress ring */}
        <circle
          cx="0"
          cy="0"
          r={ringRadius}
          fill="none"
          stroke={ringColor}
          strokeWidth={ringStroke}
          strokeLinecap="round"
          strokeDasharray={ringCircumference}
          strokeDashoffset={ringOffset}
          transform="rotate(-90)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* Score text */}
        <text
          x="0"
          y="6"
          textAnchor="middle"
          fontFamily="DM Sans, sans-serif"
          fontSize="22"
          fontWeight="700"
          fill={c.textColor}
        >
          {clarityScore}
        </text>
        <text
          x="0"
          y="22"
          textAnchor="middle"
          fontFamily="DM Sans, sans-serif"
          fontSize="10"
          fill={c.textColor}
          opacity="0.7"
        >
          clarity
        </text>
      </g>

      {/* Date label */}
      <text
        x="200"
        y="290"
        fontFamily="DM Sans, sans-serif"
        fontSize="14"
        fill={c.textColor}
        opacity="0.6"
      >
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </text>
    </svg>
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
