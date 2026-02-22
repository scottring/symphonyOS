import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useWallData } from '@/hooks/useWallData'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'
import { WallItem } from './WallItem'
import { WallDinnerWidget } from './WallDinnerWidget'
import { WallScreenTimeWidget } from './WallScreenTimeWidget'
import { WallLookAhead } from './WallLookAhead'
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
          <div className="font-display text-[4rem] text-neutral-400 mb-2">Symphony</div>
          <div className="text-[1.25rem] text-neutral-400">Loading...</div>
        </div>
      </div>
    )
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="h-screen w-screen bg-bg-base flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="font-display text-[4rem] text-neutral-700 mb-4">Symphony</div>
          <div className="text-[1.25rem] text-neutral-500 mb-8">
            Sign in to view your family calendar
          </div>
          <a
            href="/"
            className="inline-block px-8 py-3 bg-primary-500 text-white rounded-xl text-[1.15rem] font-medium"
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
          <div className="font-display text-[5rem] text-neutral-400 mb-3 leading-none">
            {formatWallTime(currentTime)}
          </div>
          <div className="text-[1.25rem] text-neutral-400">Loading your day...</div>
        </div>
      </div>
    )
  }

  const todayData = wallData.days.find(d => d.isToday)

  // Count today's items
  const todayItemCount = todayData
    ? SECTION_ORDER.reduce((sum, s) => sum + (todayData.items[s]?.length || 0), 0)
    : 0

  // Cap overdue display at 4 items
  const MAX_OVERDUE_SHOWN = 4
  const overdueShown = wallData.overdueTasks.slice(0, MAX_OVERDUE_SHOWN)
  const overdueRemaining = wallData.overdueTasks.length - overdueShown.length

  return (
    <div className="wall-calendar h-screen w-screen bg-bg-base overflow-hidden flex flex-col select-none">

      {/* ═══ HEADER: Clock + Date + Family Legend ═══ */}
      <header className="shrink-0 flex items-center justify-between px-10 py-4 border-b border-neutral-200/40">
        <div className="flex items-baseline gap-6">
          <time className="font-display text-[5rem] leading-none text-neutral-800 tracking-tight">
            {formatWallTime(currentTime)}
          </time>
          <span className="text-[1.75rem] text-neutral-500 font-medium">
            {formatWallDate(currentTime)}
          </span>
        </div>

        {/* Family legend */}
        <div className="flex items-center gap-5">
          {wallData.familyMembers
            .filter(m => m.member_type === 'core')
            .map(member => {
              const colors = FAMILY_COLORS[member.color as FamilyMemberColor]
              return (
                <div key={member.id} className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-full ${colors?.bg || 'bg-neutral-200'} ring-2 ${colors?.ring || 'ring-neutral-300'}`} />
                  <span className="text-[1.25rem] text-neutral-600 font-medium">
                    {member.name}
                  </span>
                </div>
              )
            })}
        </div>
      </header>

      {/* ═══ MAIN: Today (left) + Widgets (right) ═══ */}
      <main className="flex-1 flex overflow-hidden min-h-0">

        {/* ─── TODAY: Full schedule ─── */}
        <div className="w-[55%] flex flex-col border-r border-neutral-200/40">
          {/* Today header */}
          <div className="shrink-0 px-10 pt-5 pb-3 bg-primary-50/25 border-b border-primary-200/30">
            <div className="flex items-baseline gap-3">
              <span className="text-[1.1rem] font-semibold uppercase tracking-[0.2em] text-primary-500">
                Today
              </span>
              {todayItemCount > 0 && (
                <span className="text-[1rem] text-primary-400 font-medium">
                  {todayItemCount} {todayItemCount === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>
          </div>

          {/* Schedule items */}
          <div className="flex-1 overflow-y-auto px-8 py-4">
            {/* Overdue tasks */}
            {overdueShown.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-[1rem] font-semibold uppercase tracking-[0.15em] text-amber-500">
                    Overdue
                  </span>
                  <div className="h-px flex-1 bg-amber-300/40" />
                </div>
                <div className="space-y-0.5 border-l-2 border-amber-400/50 pl-3">
                  {overdueShown.map(item => (
                    <WallItem
                      key={item.id}
                      item={item}
                      familyMembers={wallData.familyMembers}
                    />
                  ))}
                  {overdueRemaining > 0 && (
                    <div className="text-[1.1rem] text-amber-400 py-1 px-2">
                      +{overdueRemaining} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {todayData && todayItemCount === 0 && todayData.birthdays.length === 0 && todayData.milestones.length === 0 && overdueShown.length === 0 && wallData.inboxCount === 0 && (
              <div className="text-center mt-16">
                <div className="font-display text-[2.5rem] text-neutral-300 italic leading-tight">
                  Nothing scheduled
                </div>
                <div className="text-[1.25rem] text-neutral-300 mt-2">Enjoy the day</div>
              </div>
            )}

            {todayData && SECTION_ORDER.map(section => {
              const items = todayData.items[section]
              if (!items || items.length === 0) return null

              return (
                <div key={section} className="mb-5">
                  {/* Section label */}
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-[1rem] font-semibold uppercase tracking-[0.15em] text-neutral-400">
                      {SECTION_LABELS[section]}
                    </span>
                    <div className="h-px flex-1 bg-neutral-200/50" />
                  </div>

                  {/* Items */}
                  <div className="space-y-0.5">
                    {items.map(item => (
                      <WallItem
                        key={item.id}
                        item={item}
                        familyMembers={wallData.familyMembers}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Birthdays */}
            {todayData && todayData.birthdays.length > 0 && (
              <div className="mt-4">
                {todayData.birthdays.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 px-2">
                    <span className="text-[1.75rem]">&#127874;</span>
                    <span className="text-[1.5rem] font-medium text-accent-500">{b.name}'s Birthday</span>
                  </div>
                ))}
              </div>
            )}

            {/* Milestones */}
            {todayData && todayData.milestones.length > 0 && (
              <div className="mt-2">
                {todayData.milestones.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 px-2">
                    <span className="text-[1.75rem]">&#127919;</span>
                    <span className="text-[1.5rem] font-medium text-sage-600">{m.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Inbox count */}
            {wallData.inboxCount > 0 && (
              <div className="mt-6 pt-4 border-t border-neutral-200/40">
                <div className="flex items-center gap-3 px-2">
                  <span className="text-[1.3rem] text-neutral-400">
                    {wallData.inboxCount} {wallData.inboxCount === 1 ? 'item' : 'items'} in inbox
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── WIDGETS: Stacked cards ─── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <WallDinnerWidget calendarEvents={wallData.calendarEvents} days={wallData.days} />
          <WallScreenTimeWidget summaries={wallData.screenTimeSummaries} />
          <WallLookAhead days={wallData.days} familyMembers={wallData.familyMembers} />
        </div>
      </main>

      {/* Refresh timestamp — subtle bottom-right */}
      {wallData.lastRefresh && (
        <div className="fixed bottom-3 right-4 text-[0.75rem] text-neutral-300">
          {wallData.lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
      )}

      {/* Error indicator */}
      {wallData.error && (
        <div className="fixed bottom-6 right-6 bg-danger-50 text-danger-600 px-5 py-3 rounded-xl text-[1rem] shadow-lg border border-danger-500/20">
          {wallData.error}
        </div>
      )}
    </div>
  )
}
