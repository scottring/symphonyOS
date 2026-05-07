import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useWallData } from '@/hooks/useWallData'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import type { TimelineItem } from '@/types/timeline'
// import { WallRoutineColumn } from './WallRoutineColumn' // unused — kept for context
import { ShoppingListView } from './views/ShoppingListView'
import { MealPlanColumn } from './views/MealPlanColumn'
import { WallSwimlane } from './WallSwimlane'
import { WallMicButton } from './WallMicButton'
import { WallDinnerPromptWidget } from './WallDinnerPromptWidget'
import { WallItemDetail } from './WallItemDetail'
import { findDinnerEvent, getMealIcon } from './WallDinnerWidget'
import { WallRecipeViewer } from './WallRecipeViewer'
import { extractRecipeNameHint, detectRecipeUrl } from '@/lib/recipeDetection'
import { useContextEngine, ContextOverlay } from './contexts'
import type { ContextEvalData } from './contexts'
import { useWeather } from '@/hooks/useWeather'
import { getWeatherMessage, getWeatherEmoji } from './weatherMessages'
import { useKioskCards } from '@/hooks/useKioskCards'
import { WallAgentCards } from './WallAgentCards'
import { useEmailActionItems } from '@/hooks/useEmailActionItems'
import { WallEmailActions } from './WallEmailActions'
import { WallEmailActionsOverlay } from './WallEmailActionsOverlay'
import { WallDiscussionWidget } from './WallDiscussionWidget'
import { WallDiscussionOverlay } from './WallDiscussionOverlay'
import { useFamilyDiscussionItems, type DiscussionItem } from '@/hooks/useFamilyDiscussionItems'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { WallCameraView } from './WallCameraView'
import { WallTodayTimeline } from './WallTodayTimeline'
import { WallTravelDay, detectTravelDay } from './WallTravelDay'

// ============================================================================
// HELPERS
// ============================================================================

function formatWallTime(date: Date): { time: string; period: string; dateStr: string } {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  const time = `${displayHour}:${minutes.toString().padStart(2, '0')}`
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase()
  return { time, period, dateStr }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WallCalendar() {
  const { user, loading: authLoading } = useAuth()
  const wallData = useWallData()
  const { markDone, undoDone } = useActionableInstances()
  const { weather, error: weatherError } = useWeather()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [nightWake, setNightWake] = useState(false)
  const nightWakeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [showRecipeViewer, setShowRecipeViewer] = useState(false)
  const [detailItem, setDetailItem] = useState<TimelineItem | null>(null)
  const { cards: agentCards, dismissCard } = useKioskCards()
  const {
    items: emailItems,
    urgentItems: emailUrgentItems,
    acknowledge: emailAcknowledge,
    snooze: emailSnooze,
    dismiss: emailDismiss,
    markDone: emailMarkDone,
  } = useEmailActionItems()
  const [showEmailActions, setShowEmailActions] = useState(false)
  const { items: discussionItems, unflagEvent } = useFamilyDiscussionItems()
  const { updateTask } = useSupabaseTasks()
  const [showDiscussion, setShowDiscussion] = useState(false)
  const [travelDayDismissed, setTravelDayDismissed] = useState(false)

  const isTravelDay = useMemo(
    () => detectTravelDay(wallData.calendarEvents),
    [wallData.calendarEvents]
  )
  const [cameraEnabled, setCameraEnabled] = useState(() =>
    localStorage.getItem('wall-camera-enabled') !== 'false'
  )

  const toggleCamera = useCallback((enabled?: boolean) => {
    setCameraEnabled(prev => {
      const next = enabled !== undefined ? enabled : !prev
      localStorage.setItem('wall-camera-enabled', String(next))
      return next
    })
  }, [])

  // ═══ COMPLETION ═══
  const handleComplete = useCallback(async (item: TimelineItem) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (item.type === 'routine') {
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
    } else if (item.type === 'task') {
      const taskId = item.id.replace('task-', '')
      await supabase.from('tasks').update({ completed: !item.completed }).eq('id', taskId)
    }
    wallData.refetch()
  }, [markDone, undoDone, wallData])

  // ═══ CLOCK ═══
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // ═══ REMOTE COMMANDS via Supabase Realtime ═══
  useEffect(() => {
    const channel = supabase.channel('wall-refresh')
      .on('broadcast', { event: 'refresh' }, () => {
        console.log('[wall] remote refresh received')
        window.location.reload()
      })
      .on('broadcast', { event: 'camera' }, (payload) => {
        const action = payload?.payload?.action
        console.log('[wall] remote camera command:', action)
        if (action === 'on') toggleCamera(true)
        else if (action === 'off') toggleCamera(false)
        else toggleCamera()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [toggleCamera])

  // ═══ ITEMS ═══
  const { dailyChoreItems, nonDailyRoutineItems, taskItems, todayEventItems } = useMemo(() => {
    const today = wallData.days.find(d => d.isToday)
    if (!today) {
      return {
        dailyChoreItems: [] as TimelineItem[],
        nonDailyRoutineItems: [] as TimelineItem[],
        taskItems: [] as TimelineItem[],
        todayEventItems: [] as TimelineItem[],
      }
    }
    const dailyChores: TimelineItem[] = []
    const nonDailyRoutines: TimelineItem[] = []
    const tasks: TimelineItem[] = []
    const events: TimelineItem[] = []
    for (const section of ['morning', 'afternoon', 'evening', 'allday'] as const) {
      for (const item of (today.items[section] || [])) {
        if (item.skipped) continue
        if (item.type === 'event') {
          events.push(item)
        } else if (item.type === 'routine') {
          // Hide routines whose author opted out of timeline display (e.g. kid
          // morning/bedtime checklists, which surface only via context views).
          if (item.originalRoutine?.show_on_timeline === false) continue
          const isDaily = item.recurrencePattern?.type === 'daily'
          if (isDaily) dailyChores.push(item)
          else nonDailyRoutines.push(item)
        } else if (item.type === 'task') {
          tasks.push(item)
        }
      }
    }
    // Filter Jax-related daily chores — handled by the Jax care widget
    const JAX_KEYWORDS = ['jax', 'walk jax', 'feed jax', 'jax dinner', 'jax med']
    const nonJaxDailyChores = dailyChores.filter(item => {
      const lower = item.title.toLowerCase()
      return !JAX_KEYWORDS.some(kw => lower.includes(kw))
    })
    return {
      dailyChoreItems: nonJaxDailyChores,
      nonDailyRoutineItems: nonDailyRoutines,
      taskItems: tasks,
      todayEventItems: events,
    }
  }, [wallData.days])

  // ═══ ALL TASKS: today's scheduled + overdue, in one list ═══
  const allTasks = useMemo(
    () => [...taskItems, ...wallData.overdueTasks],
    [taskItems, wallData.overdueTasks],
  )

  // ═══ DETAIL OVERLAY ═══
  const todayData = useMemo(() => wallData.days.find(d => d.isToday), [wallData.days])

  const handleItemTap = useCallback((item: TimelineItem) => {
    setDetailItem(item)
  }, [])
  const handleCloseDetail = useCallback(() => {
    setDetailItem(null)
  }, [])

  // ═══ RECIPE ═══
  const dinnerEvent = useMemo(
    () => findDinnerEvent(wallData.calendarEvents, currentTime),
    [wallData.calendarEvents, currentTime]
  )
  const dinnerMealName = dinnerEvent
    ? extractRecipeNameHint(dinnerEvent.title) || dinnerEvent.title
    : 'Dinner'
  const recipeUrl = useMemo(() => {
    if (!dinnerEvent) return null
    return detectRecipeUrl(dinnerEvent.description)
  }, [dinnerEvent])

  const handleOpenRecipe = useCallback(() => {
    if (recipeUrl) setShowRecipeViewer(true)
  }, [recipeUrl])
  const handleCloseRecipe = useCallback(() => setShowRecipeViewer(false), [])

  // ═══ DISCUSSION ═══
  const handleMarkDiscussed = useCallback(async (item: DiscussionItem) => {
    if (item.kind === 'task') {
      await updateTask(item.id, { needsDiscussion: false, discussionNote: undefined })
    } else {
      await unflagEvent(item.id)
    }
  }, [updateTask, unflagEvent])

  // ═══ CONTEXT ENGINE ═══
  const contextEvalData = useMemo((): ContextEvalData | null => {
    if (wallData.loading) return null
    return {
      now: currentTime,
      days: wallData.days,
      calendarEvents: wallData.calendarEvents,
      familyMembers: wallData.familyMembers,
      overdueTasks: wallData.overdueTasks,
      todayChores: dailyChoreItems,
      todayTasks: taskItems,
      emailActionItems: emailItems,
    }
  }, [currentTime, wallData, dailyChoreItems, taskItems])

  const {
    surfacedRules,
    activeContext,
    activateContext,
    dismissActiveContext,
    dismissRule: _dismissRule,
    debugMode,
    toggleDebugMode,
  } = useContextEngine(contextEvalData)

  // ═══ WEATHER BACKGROUND ═══
  const weatherMsg = useMemo(() => {
    if (!weather) return null
    return getWeatherMessage(weather.currentTemp, weather.weatherCode, currentTime.getHours())
  }, [weather, currentTime])

  // ═══ DEBUG MODE (triple-tap clock) ═══
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null)
  const handleClockTap = useCallback(() => {
    tapCountRef.current += 1
    if (tapCountRef.current >= 3) {
      toggleDebugMode()
      tapCountRef.current = 0
    }
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 600)
  }, [toggleDebugMode])

  // ═══ NIGHTTIME SLEEP MODE (10 PM – 5:30 AM) ═══
  const isNighttime = useMemo(() => {
    const h = currentTime.getHours()
    const m = currentTime.getMinutes()
    return h >= 22 || h < 5 || (h === 5 && m < 30)
  }, [currentTime])

  useEffect(() => {
    if (showDiscussion && discussionItems.length === 0) {
      setShowDiscussion(false)
    }
  }, [showDiscussion, discussionItems.length])

  useEffect(() => {
    if (!isNighttime) {
      setNightWake(false)
      if (nightWakeTimerRef.current) {
        clearTimeout(nightWakeTimerRef.current)
        nightWakeTimerRef.current = null
      }
    }
  }, [isNighttime])

  const handleNightTap = useCallback(() => {
    setNightWake(true)
    if (nightWakeTimerRef.current) clearTimeout(nightWakeTimerRef.current)
    nightWakeTimerRef.current = setTimeout(() => setNightWake(false), 30_000)
  }, [])

  // ════════════════════════════════════════════════════════════════
  // RENDER: Night mode
  // ════════════════════════════════════════════════════════════════

  if (isNighttime && !nightWake) {
    const { time: sleepTime, period: sleepPeriod } = formatWallTime(currentTime)
    return (
      <div
        className="wall-calendar h-screen w-screen bg-black flex items-center justify-center select-none cursor-default"
        onClick={handleNightTap}
      >
        <div className="text-white/[0.04] font-bold text-[6rem] leading-none tracking-tight">
          {sleepTime} {sleepPeriod}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Loading states
  // ════════════════════════════════════════════════════════════════

  if (authLoading || !user) {
    return (
      <div className="wall-calendar h-screen w-screen bg-[#1e293b] flex items-center justify-center select-none">
        <div className="text-center">
          <div className="font-display text-[4rem] text-white/60 mb-2">Symphony</div>
          <div className="text-[1.25rem] text-white/40">
            {authLoading ? 'Loading...' : 'Sign in to view your family calendar'}
          </div>
        </div>
      </div>
    )
  }

  if (wallData.loading) {
    const { time: loadTime } = formatWallTime(currentTime)
    return (
      <div className="wall-calendar h-screen w-screen bg-[#1e293b] flex items-center justify-center select-none">
        <div className="text-center">
          <div className="font-display text-[6rem] text-white/90 mb-3 leading-none">{loadTime}</div>
          <div className="text-[1.25rem] text-white/40">Loading your day...</div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Travel Day takeover
  // ════════════════════════════════════════════════════════════════

  if (isTravelDay && !travelDayDismissed) {
    return (
      <WallTravelDay
        calendarEvents={wallData.calendarEvents}
        weather={weather}
        currentTime={currentTime}
        onBack={() => setTravelDayDismissed(true)}
      />
    )
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Main kiosk view
  // ════════════════════════════════════════════════════════════════

  const { time, period, dateStr } = formatWallTime(currentTime)

  // Glass card style — consistent across all modules
  const glass = 'bg-white/[0.08] backdrop-blur-md border border-white/[0.1] rounded-[1.25rem]'

  return (
    <div
      className="wall-calendar w-[1920px] h-[1080px] overflow-hidden flex flex-col select-none relative mx-auto bg-[#141414]"
    >

      {/* ═══ HEADER BAR ═══ */}
      <header className="relative z-10 px-10 pt-6 pb-4 flex items-center justify-between">
        {/* Left: Weather cluster */}
        <div className="flex items-center gap-5">
          {weather ? (
            <>
              <span className="text-[3.5rem] leading-none drop-shadow-lg">
                {getWeatherEmoji(weather.weatherCode)}
              </span>
              <div className="flex items-baseline gap-2.5">
                <span className="text-white font-black text-[3.5rem] leading-none tracking-tight">
                  {weather.currentTemp}°
                </span>
                <span className="text-white/50 font-bold text-[1.3rem] uppercase tracking-wider">
                  {weather.condition}
                </span>
              </div>
              <div className="text-white/30 font-bold text-[1.05rem] tracking-wide ml-2">
                {weather.highTemp}° / {weather.lowTemp}°
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-[3.5rem] leading-none">🌤️</span>
              <span className="text-white/30 font-bold text-[2rem]">--°</span>
              {weatherError && (
                <span className="text-red-400/60 font-bold text-[0.7rem] uppercase tracking-wider ml-2">
                  {weatherError}
                </span>
              )}
            </div>
          )}

          {/* Weather message — inline */}
          {weatherMsg && (
            <div className="flex items-center gap-2.5 ml-6 px-4 py-1.5 rounded-xl bg-white/[0.06] border border-white/[0.08]">
              <span className="text-[1.1rem]">{weatherMsg.icon}</span>
              <span className="text-white/60 font-bold text-[1rem]">{weatherMsg.message}</span>
              {weatherMsg.screenTimeAdvice === 'none' && (
                <span className="text-[#6DC4A7] font-black text-[0.8rem] uppercase tracking-widest">No Screens</span>
              )}
              {weatherMsg.screenTimeAdvice === 'reading-first' && (
                <span className="text-[#F9C35C] font-black text-[0.8rem] uppercase tracking-widest">Reading First</span>
              )}
            </div>
          )}
        </div>

        {/* Right: Clock */}
        <div className="flex items-baseline gap-2">
          <time
            className="font-black text-[3.5rem] leading-none text-white tracking-tight cursor-default"
            onClick={handleClockTap}
          >
            {time}
          </time>
          <span className="text-[1.5rem] font-bold text-white/50">{period}</span>
          <span className="text-[1.1rem] font-bold text-white/30 tracking-wider ml-3">{dateStr}</span>
        </div>
      </header>

      {/* ═══ TODAY'S SCHEDULE — Calendar Events ═══ */}
      <div className="relative z-10 px-10" style={{ height: 170 }}>
        <WallTodayTimeline todayData={todayData} />
      </div>

      {/* ═══ MAIN CONTENT — CSS Grid ═══ */}
      <main className="flex-1 grid min-h-0 relative z-10 px-10 pb-6 gap-4"
        style={{ gridTemplateColumns: '1fr 260px 380px', gridTemplateRows: '1fr auto' }}
      >

        {/* ─── PANEL: Swimlane (per-person Today view, includes routines/chores) ─── */}
        <div className={`${glass} p-5 min-h-0 flex flex-col overflow-hidden`}>
          <WallSwimlane
            familyMembers={wallData.familyMembers}
            taskItems={allTasks}
            routineItems={[...nonDailyRoutineItems, ...dailyChoreItems]}
            calendarEvents={todayEventItems}
            onComplete={handleComplete}
            onItemTap={handleItemTap}
          />
        </div>

        {/* ─── PANEL: Need now (synced from Apple Reminders via the bridge) ─── */}
        <div className={`${glass} p-5 min-h-0 overflow-hidden flex flex-col`}>
          <ShoppingListView appleListName="Need now" title="Need Now" />
        </div>

        {/* ─── PANEL: This Week's Meals (replaces LookAhead in Phase 7) ─── */}
        <div className={`${glass} p-5 min-h-0 overflow-hidden flex flex-col`}>
          <MealPlanColumn />
        </div>

        {/* ─── BOTTOM ROW: Widget Strip ─── */}
        <div className="flex gap-3 col-span-3 items-stretch">
          {/* Dinner Widget */}
          <div className={`${glass} px-4 py-2 flex-1 flex items-center gap-3 ${recipeUrl ? 'cursor-pointer' : ''}`}
            onClick={recipeUrl ? handleOpenRecipe : undefined}
          >
            <div className="text-[1.8rem]">
              {dinnerEvent ? getMealIcon(dinnerEvent.title) : '🍽️'}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-white/40 font-black uppercase tracking-widest text-[0.6rem]">
                Tonight
              </span>
              {dinnerEvent ? (
                <span className="text-white font-bold text-[1rem] truncate leading-tight">
                  {dinnerMealName}
                </span>
              ) : (
                <span className="text-white/30 text-[0.9rem] italic">No dinner planned</span>
              )}
            </div>
            {recipeUrl && (
              <span className="text-white/30 text-[0.9rem]">📖</span>
            )}
          </div>

          {/* Dinner conversation prompt from Relish */}
          <div className={`${glass} px-4 py-2`} style={{ flex: '2 1 0%' }}>
            <WallDinnerPromptWidget />
          </div>

          {/* Email Action Items Widget */}
          {emailItems.length > 0 && (
            <div className={`${glass} px-4 py-2 flex-1 flex items-center`}>
              <WallEmailActions
                items={emailItems}
                urgentItems={emailUrgentItems}
                onClick={() => setShowEmailActions(true)}
              />
            </div>
          )}

          {/* Discussion Widget */}
          {discussionItems.length > 0 && (
            <div className={`${glass} px-4 py-2 flex-1 flex items-center`}>
              <WallDiscussionWidget
                items={discussionItems}
                onClick={() => setShowDiscussion(true)}
              />
            </div>
          )}

          {/* Agent Cards Widget */}
          {agentCards.length > 0 && (
            <div className={`${glass} px-4 py-2 flex-1 flex flex-col justify-center`}>
              <WallAgentCards cards={agentCards} onDismiss={dismissCard} />
            </div>
          )}

          {/* Context Dock (inline, compact) */}
          {!activeContext && surfacedRules.length > 0 && (
            <div className={`${glass} px-2 py-1.5 flex items-center gap-1`}>
              {surfacedRules.map((rule) => (
                <button
                  key={rule.id}
                  onClick={() => activateContext(rule.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border backdrop-blur-md transition-all hover:scale-[1.03] active:scale-[0.97] select-none"
                  style={{
                    backgroundColor: rule.color + '20',
                    borderColor: rule.color + '35',
                    touchAction: 'manipulation',
                  }}
                  title={rule.label}
                >
                  <span className="text-[1rem]">{rule.icon}</span>
                  <span className="text-white font-black text-[0.6rem] uppercase tracking-wider leading-none">
                    {rule.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Camera — inline live thumbnail (tap to expand) */}
          {cameraEnabled && (
            <div
              className={`${glass} flex-shrink-0 overflow-hidden`}
              style={{ width: 150, padding: 4 }}
            >
              <WallCameraView />
            </div>
          )}
        </div>
      </main>

      {/* ═══ UTILITIES ═══ */}

      {/* Floating mic — voice → family inbox */}
      <WallMicButton />

      {/* Camera toggle */}
      <button
        onClick={() => toggleCamera()}
        className="fixed bottom-2 right-24 flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                   bg-white/5 hover:bg-white/10 border border-white/10
                   text-white/20 hover:text-white/50 transition-all z-10 text-[0.7rem]"
      >
        <span>{cameraEnabled ? '📷' : '📷'}</span>
        <span className="font-bold uppercase tracking-wider">
          {cameraEnabled ? 'Cam On' : 'Cam Off'}
        </span>
      </button>

      <button
        onClick={() => window.location.reload()}
        className="fixed bottom-2 right-3 flex items-center gap-2 px-2.5 py-1 rounded-lg
                   bg-white/5 hover:bg-white/10 border border-white/10
                   text-white/20 hover:text-white/50 transition-all z-10 text-[0.7rem]"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.5 9A8 8 0 0119.8 7.5M19.5 15A8 8 0 014.2 16.5" />
        </svg>
        {wallData.lastRefresh
          ? wallData.lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : 'Refresh'}
      </button>

      {wallData.error && (
        <div className="fixed top-6 right-6 bg-red-900/80 text-red-200 px-5 py-3 rounded-xl text-[1rem] shadow-lg border border-red-500/30 backdrop-blur z-50">
          {wallData.error}
        </div>
      )}

      {isNighttime && nightWake && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white/5 text-white/30 px-4 py-2 rounded-xl text-[0.85rem] font-bold uppercase tracking-widest border border-white/10 z-50">
          Sleeping soon...
        </div>
      )}

      {debugMode && (
        <div className="fixed top-6 left-6 bg-amber-500/20 text-amber-300 px-4 py-2 rounded-xl text-[0.85rem] font-bold uppercase tracking-widest border border-amber-500/30 z-50">
          Debug: All Contexts
        </div>
      )}

      {/* ContextDock moved inline to widget strip */}

      {activeContext && contextEvalData && (
        <ContextOverlay
          activeContext={activeContext}
          data={contextEvalData}
          onDismiss={dismissActiveContext}
        />
      )}

      {showRecipeViewer && recipeUrl && (
        <WallRecipeViewer
          url={recipeUrl}
          mealName={dinnerMealName}
          mealIcon={dinnerEvent ? getMealIcon(dinnerEvent.title) : '🍽️'}
          onClose={handleCloseRecipe}
        />
      )}

      {showEmailActions && (
        <WallEmailActionsOverlay
          items={emailItems}
          familyMembers={wallData.familyMembers}
          onAcknowledge={emailAcknowledge}
          onSnooze={emailSnooze}
          onDismiss={emailDismiss}
          onDone={emailMarkDone}
          onClose={() => setShowEmailActions(false)}
        />
      )}

      {showDiscussion && (
        <WallDiscussionOverlay
          items={discussionItems}
          onMarkDiscussed={async (item) => {
            await handleMarkDiscussed(item)
            // Don't auto-close — let the user keep marking; auto-close handled by effect below
          }}
          onClose={() => setShowDiscussion(false)}
        />
      )}


      {detailItem && (
        <WallItemDetail item={detailItem} onClose={handleCloseDetail} />
      )}
    </div>
  )
}
