import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useWallData } from '@/hooks/useWallData'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'
import { WallDayColumn } from './WallDayColumn'
import { WallDinnerWidget } from './WallDinnerWidget'
import { WallScreenTimeWidget } from './WallScreenTimeWidget'

function formatWallTime(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`
}

function formatWallDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateRange(days: { date: Date }[]): string {
  if (days.length === 0) return ''
  const first = days[0].date
  const last = days[days.length - 1].date
  const firstMonth = first.toLocaleDateString('en-US', { month: 'short' })
  const lastMonth = last.toLocaleDateString('en-US', { month: 'short' })

  if (firstMonth === lastMonth) {
    return `${firstMonth} ${first.getDate()} – ${last.getDate()}`
  }
  return `${firstMonth} ${first.getDate()} – ${lastMonth} ${last.getDate()}`
}

export function WallCalendar() {
  const { user, loading: authLoading } = useAuth()
  const wallData = useWallData()
  const [currentTime, setCurrentTime] = useState(new Date())

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Auth loading state
  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <div className="font-display text-3xl text-neutral-400 mb-2">Symphony</div>
          <div className="text-neutral-400">Loading...</div>
        </div>
      </div>
    )
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="h-screen w-screen bg-bg-base flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="font-display text-4xl text-neutral-700 mb-3">Symphony</div>
          <div className="text-lg text-neutral-500 mb-6">
            Sign in to view your family calendar
          </div>
          <a
            href="/"
            className="inline-block px-6 py-2.5 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    )
  }

  // Data loading
  if (wallData.loading) {
    return (
      <div className="h-screen w-screen bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <div className="font-display text-3xl text-neutral-400 mb-2">
            {formatWallTime(currentTime)}
          </div>
          <div className="text-neutral-400">Loading your week...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="wall-calendar h-screen w-screen bg-bg-base overflow-hidden flex flex-col select-none">
      {/* Header: Clock + Date + Family legend */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 bg-bg-elevated border-b border-neutral-200/50">
        <div className="flex items-baseline gap-4">
          <time className="font-display text-5xl text-neutral-800 tracking-tight">
            {formatWallTime(currentTime)}
          </time>
          <div className="flex flex-col">
            <span className="text-lg text-neutral-500 font-medium">
              {formatWallDate(currentTime)}
            </span>
            {wallData.days.length > 0 && (
              <span className="text-sm text-neutral-400">
                {formatDateRange(wallData.days)}
              </span>
            )}
          </div>
        </div>

        {/* Family member legend */}
        <div className="flex items-center gap-4">
          {wallData.familyMembers
            .filter(m => m.member_type === 'core')
            .map(member => {
              const colors = FAMILY_COLORS[member.color as FamilyMemberColor]
              return (
                <div key={member.id} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-full ${colors?.bg || 'bg-neutral-200'} ring-1 ${colors?.ring || 'ring-neutral-300'}`} />
                  <span className="text-sm text-neutral-600 font-medium">
                    {member.name}
                  </span>
                </div>
              )
            })}

          {/* Refresh indicator */}
          {wallData.lastRefresh && (
            <div className="text-[0.65rem] text-neutral-300 ml-2">
              Updated {wallData.lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
        </div>
      </header>

      {/* 7-day grid */}
      <main className="flex-1 grid grid-cols-7 overflow-hidden">
        {wallData.days.map(day => (
          <WallDayColumn
            key={day.date.toISOString()}
            day={day}
            familyMembers={wallData.familyMembers}
          />
        ))}
      </main>

      {/* Footer: Dinner + Screen Time widgets */}
      <footer className="shrink-0 flex items-stretch border-t border-neutral-200/50 bg-bg-elevated">
        <WallDinnerWidget calendarEvents={wallData.calendarEvents} days={wallData.days} />
        <div className="w-px bg-neutral-200/50" />
        <WallScreenTimeWidget summaries={wallData.screenTimeSummaries} />
      </footer>

      {/* Error indicator (subtle, bottom-right) */}
      {wallData.error && (
        <div className="fixed bottom-4 right-4 bg-danger-100 text-danger-700 px-4 py-2 rounded-lg text-sm shadow-lg">
          {wallData.error}
        </div>
      )}
    </div>
  )
}
