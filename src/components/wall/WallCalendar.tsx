import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useWallData } from '@/hooks/useWallData'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'
import { WallDayColumn } from './WallDayColumn'
import { WallDinnerWidget } from './WallDinnerWidget'
import { WallScreenTimeWidget } from './WallScreenTimeWidget'
import { WallItem } from './WallItem'
import type { DaySection } from '@/lib/timeUtils'

const SECTION_ORDER: DaySection[] = ['allday', 'morning', 'afternoon', 'evening']

const SECTION_LABELS: Record<string, string> = {
  allday: 'All Day',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

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
          <div className="font-display text-5xl text-neutral-400 mb-2">Symphony</div>
          <div className="text-xl text-neutral-400">Loading...</div>
        </div>
      </div>
    )
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="h-screen w-screen bg-bg-base flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="font-display text-5xl text-neutral-700 mb-4">Symphony</div>
          <div className="text-xl text-neutral-500 mb-8">
            Sign in to view your family calendar
          </div>
          <a
            href="/"
            className="inline-block px-8 py-3 bg-primary-500 text-white rounded-xl text-lg font-medium hover:bg-primary-600 transition-colors"
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
          <div className="font-display text-5xl text-neutral-400 mb-3">
            {formatWallTime(currentTime)}
          </div>
          <div className="text-xl text-neutral-400">Loading your week...</div>
        </div>
      </div>
    )
  }

  const todayData = wallData.days.find(d => d.isToday)
  const upcomingDays = wallData.days.filter(d => !d.isToday)

  // Count today's items
  const todayItemCount = todayData
    ? SECTION_ORDER.reduce((sum, s) => sum + (todayData.items[s]?.length || 0), 0)
    : 0

  return (
    <div className="wall-calendar h-screen w-screen bg-bg-base overflow-hidden flex flex-col select-none">

      {/* ═══ TOP BAR: Clock + Date + Family ═══ */}
      <header className="shrink-0 flex items-center justify-between px-8 py-4 border-b border-neutral-200/40">
        <div className="flex items-baseline gap-5">
          <time className="font-display text-[4.5rem] leading-none text-neutral-800 tracking-tight">
            {formatWallTime(currentTime)}
          </time>
          <div className="flex flex-col gap-0.5">
            <span className="text-[1.5rem] text-neutral-600 font-medium leading-tight">
              {formatWallDate(currentTime)}
            </span>
          </div>
        </div>

        {/* Family member legend */}
        <div className="flex items-center gap-5">
          {wallData.familyMembers
            .filter(m => m.member_type === 'core')
            .map(member => {
              const colors = FAMILY_COLORS[member.color as FamilyMemberColor]
              return (
                <div key={member.id} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full ${colors?.bg || 'bg-neutral-200'} ring-2 ${colors?.ring || 'ring-neutral-300'}`} />
                  <span className="text-[1.1rem] text-neutral-600 font-medium">
                    {member.name}
                  </span>
                </div>
              )
            })}
        </div>
      </header>

      {/* ═══ MAIN CONTENT: Today (hero) + Upcoming (sidebar) ═══ */}
      <main className="flex-1 flex overflow-hidden min-h-0">

        {/* ─── TODAY: Hero column ─── */}
        <div className="w-[42%] flex flex-col border-r border-neutral-200/40 bg-bg-elevated">
          {/* Today header */}
          <div className="shrink-0 px-8 pt-5 pb-3 border-b border-primary-200/40 bg-primary-50/30">
            <div className="flex items-baseline gap-3">
              <span className="text-[1rem] font-semibold uppercase tracking-[0.2em] text-primary-500">
                Today
              </span>
              {todayItemCount > 0 && (
                <span className="text-[0.9rem] text-primary-400 font-medium">
                  {todayItemCount} {todayItemCount === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>
          </div>

          {/* Today items */}
          <div className="flex-1 overflow-y-auto px-6 py-3">
            {todayData && todayItemCount === 0 && (
              <div className="text-center mt-12">
                <div className="font-display text-[2rem] text-neutral-300 italic">
                  Nothing scheduled
                </div>
              </div>
            )}

            {todayData && SECTION_ORDER.map(section => {
              const items = todayData.items[section]
              if (!items || items.length === 0) return null

              return (
                <div key={section} className="mb-4">
                  {/* Section label */}
                  <div className="flex items-center gap-3 mb-2 mt-1">
                    <span className="text-[0.8rem] font-semibold uppercase tracking-[0.15em] text-neutral-400">
                      {SECTION_LABELS[section]}
                    </span>
                    <div className="h-px flex-1 bg-neutral-200/60" />
                  </div>

                  {/* Items */}
                  <div className="space-y-1">
                    {items.map(item => (
                      <WallItem
                        key={item.id}
                        item={item}
                        familyMembers={wallData.familyMembers}
                        size="large"
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Birthdays */}
            {todayData && todayData.birthdays.length > 0 && (
              <div className="mt-4 px-2">
                {todayData.birthdays.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <span className="text-[1.8rem]">&#127874;</span>
                    <span className="text-[1.3rem] font-medium text-accent-500">{b.name}'s Birthday</span>
                  </div>
                ))}
              </div>
            )}

            {/* Milestones */}
            {todayData && todayData.milestones.length > 0 && (
              <div className="mt-2 px-2">
                {todayData.milestones.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <span className="text-[1.8rem]">&#127919;</span>
                    <span className="text-[1.3rem] font-medium text-sage-600">{m.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── UPCOMING: 6-day strip ─── */}
        <div className="flex-1 grid grid-cols-6 overflow-hidden">
          {upcomingDays.map(day => (
            <WallDayColumn
              key={day.date.toISOString()}
              day={day}
              familyMembers={wallData.familyMembers}
            />
          ))}
        </div>
      </main>

      {/* ═══ FOOTER: Widget bar ═══ */}
      <footer className="shrink-0 flex items-stretch border-t border-neutral-200/40 bg-bg-elevated">
        <WallDinnerWidget calendarEvents={wallData.calendarEvents} days={wallData.days} />
        <div className="w-px bg-neutral-200/30 my-3" />
        <WallScreenTimeWidget summaries={wallData.screenTimeSummaries} />

        {/* Refresh timestamp */}
        {wallData.lastRefresh && (
          <div className="flex items-end pb-3 pr-6 shrink-0">
            <span className="text-[0.7rem] text-neutral-300">
              {wallData.lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        )}
      </footer>

      {/* Error indicator */}
      {wallData.error && (
        <div className="fixed bottom-6 right-6 bg-danger-50 text-danger-600 px-5 py-3 rounded-xl text-base shadow-lg border border-danger-500/20">
          {wallData.error}
        </div>
      )}
    </div>
  )
}
