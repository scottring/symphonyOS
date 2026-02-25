import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useWallData } from '@/hooks/useWallData'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import type { TimelineItem } from '@/types/timeline'
import { WallChoresWidget } from './WallChoresWidget'
import { WallLookAhead } from './WallLookAhead'
import { WallRewardWidget } from './WallRewardWidget'
import { WallScribbleWidget } from './WallScribbleWidget'
import { WallDinnerWidget } from './WallDinnerWidget'

function formatWallTime(date: Date): { time: string, period: string, dateStr: string } {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  const time = `${displayHour}:${minutes.toString().padStart(2, '0')}`

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).toUpperCase()

  return { time, period, dateStr }
}

export function WallCalendar() {
  const { user, loading: authLoading } = useAuth()
  const wallData = useWallData()
  const { markDone, undoDone } = useActionableInstances()
  const { updateTask } = useSupabaseTasks()
  const [currentTime, setCurrentTime] = useState(new Date())

  // Complete/uncomplete a wall item
  const handleComplete = useCallback(async (item: TimelineItem) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (item.type === 'task') {
      const taskId = item.id.replace('task-', '')
      await updateTask(taskId, { completed: !item.completed })
    } else if (item.type === 'routine') {
      const routineId = item.id.replace('routine-', '')
      if (item.completed) {
        await undoDone('routine', routineId, today)
      } else {
        await markDone('routine', routineId, today)
      }
    } else if (item.type === 'event') {
      const eventId = item.id.replace('event-', '')
      if (item.completed) {
        await undoDone('calendar_event', eventId, today)
      } else {
        await markDone('calendar_event', eventId, today)
      }
    }
    wallData.refetch()
  }, [updateTask, markDone, undoDone, wallData])



  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Flatten active items for the chores widget
  const activeItems = useMemo(() => {
    if (!wallData.days.length) return []
    const today = wallData.days.find(d => d.isToday)
    if (!today) return []
    const items: TimelineItem[] = []
    for (const section of ['morning', 'afternoon', 'evening', 'allday'] as const) {
      if (today.items[section]) {
        items.push(...today.items[section].filter(i => i.type !== 'event' && !i.completed && !i.skipped))
      }
    }
    return items
  }, [wallData.days])

  // Auth loading
  if (authLoading) {
    return (
      <div className="wall-calendar h-screen w-screen bg-[#1e293b] flex items-center justify-center select-none">
        <div className="text-center">
          <div className="font-display text-[4rem] text-white/60 mb-2">Symphony</div>
          <div className="text-[1.25rem] text-white/40">Loading...</div>
        </div>
      </div>
    )
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="wall-calendar h-screen w-screen bg-[#1e293b] flex items-center justify-center select-none">
        <div className="text-center max-w-md">
          <div className="font-display text-[4rem] text-white/80 mb-4">Symphony</div>
          <div className="text-[1.25rem] text-white/50 mb-8">
            Sign in to view your family calendar
          </div>
        </div>
      </div>
    )
  }

  // Data loading
  if (wallData.loading) {
    return (
      <div className="wall-calendar h-screen w-screen bg-[#1e293b] flex items-center justify-center select-none">
        <div className="text-center">
          <div className="font-display text-[6rem] text-white/90 mb-3 leading-none tracking-tight">
            {formatWallTime(currentTime).time}
          </div>
          <div className="text-[1.25rem] text-white/40">Loading your day...</div>
        </div>
      </div>
    )
  }

  const { time, period, dateStr } = formatWallTime(currentTime)

  return (
    <div className="wall-calendar w-[1920px] h-[1080px] bg-[#1e293b] overflow-hidden flex flex-col select-none relative p-12 mx-auto">

      {/* ═══ TOP HEADER ═══ */}
      <header className="flex items-center justify-between mb-8 z-10 w-full pr-12">
        <div className="flex items-baseline gap-4">
          <time className="font-bold text-[8rem] leading-none text-white tracking-tight">
            {time}
          </time>
          <span className="text-[3.5rem] font-bold text-white tracking-tight mr-4">
            {period}
          </span>
          <div className="text-[2.5rem] font-bold text-white/50 tracking-wider">
            {dateStr}
          </div>
          <span className="text-[5rem] ml-4 animate-pulse-soft hidden sm:block">
            🌞
          </span>
        </div>

        {/* Who's Home Avatars */}
        <div className="flex flex-col items-end gap-2">
          <span className="text-white font-black uppercase tracking-widest text-[1rem]">
            WHO'S HOME
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1.5 text-white mr-4">
              <span className="w-2.5 h-2.5 bg-green-400 rounded-full" />
              <span className="font-bold text-[1.2rem]">4/4</span>
            </div>

            {/* Example Avatars (Using placeholders or distinct colors) */}
            <div className="w-[4.5rem] h-[4.5rem] rounded-full bg-[#f87171] border-4 border-[#34d399] flex justify-center items-center text-[2rem] shadow-lg relative">
              👨
              <div className="absolute -top-2 bg-white text-slate-900 text-[0.7rem] px-2 py-0.5 rounded-full font-bold uppercase">Dad</div>
            </div>
            <div className="w-[4.5rem] h-[4.5rem] rounded-full bg-[#60a5fa] border-4 border-[#34d399] flex justify-center items-center text-[2rem] shadow-lg relative">
              👩
              <div className="absolute -top-2 bg-white text-slate-900 text-[0.7rem] px-2 py-0.5 rounded-full font-bold uppercase">Mom</div>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ MAIN LAYOUT ═══ */}
      <main className="flex-1 flex gap-12 min-h-0 relative z-10 w-full">

        {/* ─── LEFT COLUMN (60%) ─── */}
        <div className="w-[60%] flex flex-col h-full justify-between pb-4">

          <div className="flex flex-col flex-1">
            <h1 className="text-white text-[3rem] font-black uppercase tracking-wide mb-8 drop-shadow-sm">
              CHORES & TASKS TODAY!
            </h1>

            {/* Chores Bento Box Widget */}
            <WallChoresWidget items={activeItems} onComplete={handleComplete} />
          </div>

          {/* Bottom Area: Rewards & Fun Widgets */}
          <div className="flex items-end mt-12 mb-4 h-[160px]">
            <WallScribbleWidget />
            <WallRewardWidget />
          </div>

        </div>

        {/* ─── RIGHT COLUMN (40%) ─── */}
        <div className="w-[40%] flex flex-col justify-start pt-16 relative h-full">
          {/* Prevent overlap by restricting overflow behind the alien */}
          <div className="flex-1 overflow-hidden pb-[160px]">
            <WallLookAhead days={wallData.days} familyMembers={wallData.familyMembers} />

            <div className="pl-8 w-full mt-2">
              <WallDinnerWidget calendarEvents={wallData.calendarEvents} days={wallData.days} />
            </div>
          </div>

          {/* Alien Mascot with Speech Bubble */}
          <div className="absolute bottom-0 right-[-20px] flex items-end translate-y-8">
            <div className="bg-white rounded-3xl rounded-br-none p-5 max-w-[340px] shadow-xl relative -top-32 right-12 z-30">
              <p className="text-[#1e293b] font-black uppercase tracking-wider text-[1.1rem] leading-snug">
                WHY DID THE SCARECROW WIN THE AWARD? BECAUSE HE WAS OUTSTANDING IN HIS FIELD!
              </p>
              {/* Speech bubble tail */}
              <div className="absolute -bottom-4 right-4 w-8 h-8 bg-white" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
            </div>
            <div className="text-[12rem] leading-none drop-shadow-2xl z-20" style={{ transform: 'scaleX(-1)' }}>
              👽
            </div>
          </div>
        </div>

      </main>

      {/* Refresh timestamp */}
      {wallData.lastRefresh && (
        <div className="fixed top-6 right-6 text-[0.8rem] text-white/20 z-0">
          Last updated: {wallData.lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
      )}

      {/* Error indicator */}
      {wallData.error && (
        <div className="fixed top-6 right-6 bg-red-900/80 text-red-200 px-5 py-3 rounded-xl text-[1rem] shadow-lg border border-red-500/30 backdrop-blur z-0">
          {wallData.error}
        </div>
      )}
    </div>
  )
}
