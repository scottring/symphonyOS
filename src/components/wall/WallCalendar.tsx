import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useWallData } from '@/hooks/useWallData'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import { WallMicButton } from './WallMicButton'
import { WallItemDetail } from './WallItemDetail'
import { findDinnerEvent, getMealIcon } from './WallDinnerWidget'
import { WallRecipeViewer } from './WallRecipeViewer'
import { extractRecipeNameHint, detectRecipeUrl } from '@/lib/recipeDetection'
import { useContextEngine, ContextOverlay } from './contexts'
import type { ContextEvalData } from './contexts'
import { useWeather } from '@/hooks/useWeather'
import { getWeatherMessage } from './weatherMessages'
import { useKioskCards } from '@/hooks/useKioskCards'
import { useEmailActionItems } from '@/hooks/useEmailActionItems'
import { WallEmailActionsOverlay } from './WallEmailActionsOverlay'
import { WallDiscussionOverlay } from './WallDiscussionOverlay'
import { useFamilyDiscussionItems, type DiscussionItem } from '@/hooks/useFamilyDiscussionItems'
import { WallCameraView } from './WallCameraView'
import { WallTravelDay, detectTravelDay } from './WallTravelDay'
import { useWallRhythm } from './rhythm/useWallRhythm'
import { useDailyDiscussionPrompt } from '@/hooks/useDailyDiscussionPrompt'
import { WallChrome } from './WallChrome'
import { WallRhythmBar } from './WallRhythmBar'
import { WallNowCard } from './WallNowCard'
import { WallRightColumn } from './WallRightColumn'
import { buildDayGrid, type DayGridTapTarget, type QuadrantContent } from './now/buildDayGrid'
import { WallQuadrantExpand } from './now/WallQuadrantExpand'
import { buildTodayItems } from './today/todayItem'
import { resolveNowFocus, type OverrideRef } from './nowFocus'
import type { RhythmMode } from './rhythm/rhythmMode'
import { useImminentEntity } from './now/useImminentEntity'

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
  const { dismissCard: _dismissCard } = useKioskCards()
  const {
    items: emailItems,
    acknowledge: emailAcknowledge,
    snooze: emailSnooze,
    dismiss: emailDismiss,
    markDone: emailMarkDone,
  } = useEmailActionItems()
  const [showEmailActions, setShowEmailActions] = useState(false)
  const { items: discussionItems, unflagEvent, updateTask } = useFamilyDiscussionItems()
  const [showDiscussion, setShowDiscussion] = useState(false)
  const [travelDayDismissed, setTravelDayDismissed] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(() =>
    localStorage.getItem('wall-camera-enabled') !== 'false'
  )

  // ─── New layout state ───
  const rhythm = useWallRhythm()
  const { prompt, dismissed: promptDismissed } = useDailyDiscussionPrompt()
  const [pinnedMode, setPinnedMode] = useState<RhythmMode | null>(null)
  const [override, setOverride] = useState<OverrideRef | null>(null)
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null)

  // Mirror rhythm override into the local override state
  useEffect(() => {
    setOverride(rhythm.overrideMode ? { kind: 'mode', mode: rhythm.overrideMode } : null)
  }, [rhythm.overrideMode])

  const isTravelDay = useMemo(
    () => detectTravelDay(wallData.calendarEvents),
    [wallData.calendarEvents]
  )

  const toggleCamera = useCallback((enabled?: boolean) => {
    setCameraEnabled(prev => {
      const next = enabled !== undefined ? enabled : !prev
      localStorage.setItem('wall-camera-enabled', String(next))
      return next
    })
  }, [])

  // ─── Today data derived ───
  const todayDayData = useMemo(() => wallData.days.find(d => d.isToday), [wallData.days])

  const todayItems = useMemo(() =>
    todayDayData ? buildTodayItems(todayDayData.items, selectedOwnerId) : [],
    [todayDayData, selectedOwnerId]
  )
  // Daily timed routines (morning/bedtime steps) feed the Now Card. Non-daily
  // routines arrive with startTime=null (from the 'unscheduled' bucket) and
  // surface in the right column's Today list so they're still glanceable.
  const todayItemsForList = useMemo(
    () => todayItems.filter(i => i.kind !== 'routine-step' || i.startTime === null),
    [todayItems],
  )
  const routineSteps = useMemo(
    () => todayItems.filter(i => i.kind === 'routine-step' && i.startTime !== null),
    [todayItems],
  )
  const discussItems = useMemo(() => todayItemsForList.filter(it => it.needsDiscussion), [todayItemsForList])
  const upcomingDays = useMemo(() => wallData.days.filter(d => !d.isToday), [wallData.days])

  // Tasks for the imminent entity calculation
  const todayTasksForImminent = useMemo((): Task[] => {
    if (!todayDayData) return []
    const result: Task[] = []
    for (const section of ['allday', 'morning', 'afternoon', 'evening'] as const) {
      for (const item of todayDayData.items[section] ?? []) {
        if (item.type === 'task' && item.originalTask) {
          result.push(item.originalTask)
        }
      }
    }
    return result
  }, [todayDayData])

  const imminentEntity = useImminentEntity({
    events: wallData.calendarEvents,
    tasks: todayTasksForImminent,
    now: currentTime,
    windowMinutes: 30,
  })

  const focus = useMemo(() =>
    resolveNowFocus({
      pinnedMode,
      override,
      rhythmMode: rhythm.mode,
      imminent: imminentEntity,
    }),
    [pinnedMode, override, rhythm.mode, imminentEntity]
  )

  // ─── Now Card data: mode-specific routine steps ───
  const morningRoutineSteps = useMemo(() => routineSteps.filter(s => {
    if (!s.startTime) return false
    const h = s.startTime.getHours()
    return h >= 6 && h < 9
  }), [routineSteps])
  const bedtimeRoutineSteps = useMemo(() => routineSteps.filter(s => {
    if (!s.startTime) return false
    const h = s.startTime.getHours()
    return h >= 19 && h < 22
  }), [routineSteps])
  const activeRoutineSteps = useMemo(() => {
    const m =
      focus.kind === 'pinned-mode' || focus.kind === 'override-mode' || focus.kind === 'mode-default'
        ? focus.mode
        : rhythm.mode
    return m === 'morning' ? morningRoutineSteps : m === 'bedtime' ? bedtimeRoutineSteps : []
  }, [focus, rhythm.mode, morningRoutineSteps, bedtimeRoutineSteps])

  // ─── Now Card data: tomorrow first item ───
  const tomorrowPreview = useMemo(() => {
    const tomorrow = wallData.days.find(d => !d.isToday && d.date > new Date(new Date().setHours(0, 0, 0, 0)))
    if (!tomorrow) return null
    for (const section of ['morning', 'afternoon', 'evening', 'allday'] as const) {
      const first = tomorrow.items[section]?.[0]
      if (first) return { title: first.title, startTime: first.startTime ?? null }
    }
    return null
  }, [wallData.days])

  // Rebuilds each clock tick (currentTime dep) so "Up Next" stays minute-fresh;
  // buildDayGrid is a cheap pure object build — same cadence as imminentEntity.
  const dayGrid = useMemo(() => buildDayGrid({
    days: wallData.days,
    now: currentTime,
    todayItems: todayItemsForList,
    overdueTasks: wallData.overdueTasks,
    inboxCount: wallData.inboxCount,
    emailCount: emailItems.length,
    familyPrompt: promptDismissed ? null : prompt,
  }), [wallData.days, wallData.overdueTasks, wallData.inboxCount, currentTime, todayItemsForList, emailItems.length, promptDismissed, prompt])

  const [expandedQuadrant, setExpandedQuadrant] = useState<QuadrantContent | null>(null)

  const handleQuadrantTap = useCallback((target: DayGridTapTarget) => {
    const map: Record<DayGridTapTarget['quadrant'], QuadrantContent> = {
      upNext: dayGrid.upNext,
      today: dayGrid.today,
      pending: dayGrid.pending,
      familyQuestion: dayGrid.familyQuestion,
    }
    setExpandedQuadrant(map[target.quadrant])
  }, [dayGrid])

  const handleCloseExpanded = useCallback(() => setExpandedQuadrant(null), [])

  // ─── Action handlers ───
  const handleCheckItem = useCallback(async (id: string, completed: boolean) => {
    const item = todayItems.find(i => i.id === id)
    if (!item) return
    if (item.kind === 'routine-step') {
      const routineId = item.sourceId.replace('routine-', '')
      if (completed) await markDone('routine', routineId, currentTime)
      else await undoDone('routine', routineId, currentTime)
    } else {
      const taskId = item.sourceId.replace('task-', '')
      await supabase.from('tasks').update({ completed }).eq('id', taskId)
      wallData.refetch()
    }
  }, [todayItems, markDone, undoDone, currentTime, wallData])

  const handleResolveDiscussion = useCallback(async (taskId: string) => {
    await supabase.from('tasks').update({
      needs_discussion: false,
      discussion_note: null,
    }).eq('id', taskId)
    wallData.refetch()
  }, [wallData])

  const handleTapEvent = useCallback((id: string) => {
    if (!todayDayData) return
    for (const section of ['allday', 'morning', 'afternoon', 'evening'] as const) {
      const found = todayDayData.items[section]?.find(it => it.id === id)
      if (found) { setDetailItem(found); return }
    }
  }, [todayDayData])

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

  // ═══ DISCUSSION ═══
  const handleMarkDiscussed = useCallback(async (item: DiscussionItem) => {
    if (item.kind === 'task') {
      await updateTask(item.id, { needsDiscussion: false, discussionNote: undefined })
    } else {
      await unflagEvent(item.id)
    }
  }, [updateTask, unflagEvent])

  // ═══ ITEMS for context engine ═══
  const { taskItems: taskItemsForContext, dailyChoreItems: dailyChoreItemsForContext } = useMemo(() => {
    const today = wallData.days.find(d => d.isToday)
    if (!today) {
      return {
        taskItems: [] as TimelineItem[],
        dailyChoreItems: [] as TimelineItem[],
      }
    }
    const tasks: TimelineItem[] = []
    const dailyChores: TimelineItem[] = []
    for (const section of ['morning', 'afternoon', 'evening', 'allday'] as const) {
      for (const item of (today.items[section] || [])) {
        if (item.skipped) continue
        if (item.type === 'task') {
          tasks.push(item)
        } else if (item.type === 'routine') {
          const isDaily = item.recurrencePattern?.type === 'daily'
          if (isDaily) dailyChores.push(item)
        }
      }
    }
    return { taskItems: tasks, dailyChoreItems: dailyChores }
  }, [wallData.days])

  // ═══ CONTEXT ENGINE ═══
  const contextEvalData = useMemo((): ContextEvalData | null => {
    if (wallData.loading) return null
    return {
      now: currentTime,
      days: wallData.days,
      calendarEvents: wallData.calendarEvents,
      familyMembers: wallData.familyMembers,
      overdueTasks: wallData.overdueTasks,
      todayChores: dailyChoreItemsForContext,
      todayTasks: taskItemsForContext,
      emailActionItems: emailItems,
    }
  }, [currentTime, wallData, dailyChoreItemsForContext, taskItemsForContext, emailItems])

  const {
    activeContext,
    activateContext: _activateContext,
    dismissActiveContext,
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

  const handleCloseRecipe = useCallback(() => setShowRecipeViewer(false), [])

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

  // Suppress unused-variable warnings for hooks that are kept for side-effects
  void weatherMsg
  void handleClockTap
  void weatherError
  void _activateContext
  void _dismissCard

  return (
    <div
      className="h-screen w-screen flex flex-col bg-neutral-950 text-white p-5 overflow-hidden"
      onPointerDown={rhythm.resetIdleTimer}
    >
      <WallChrome
        now={currentTime}
        weather={weather ? {
          temp: weather.currentTemp,
          description: weather.condition,
          high: weather.highTemp,
          low: weather.lowTemp,
        } : null}
      />

      <div className="grid grid-cols-[1.85fr_1fr] gap-4 flex-1 min-h-0">
        <WallNowCard
          focus={focus}
          pinned={pinnedMode !== null}
          onPinToggle={() => setPinnedMode(p => p ? null : rhythm.mode)}
          familyPrompt={promptDismissed ? null : prompt}
          todayItems={todayItemsForList}
          routineSteps={activeRoutineSteps}
          dinnerPlanTitle={dinnerEvent ? (extractRecipeNameHint(dinnerEvent.title) || dinnerEvent.title) : null}
          tomorrowPreview={tomorrowPreview}
          onCheckItem={handleCheckItem}
          dayGrid={dayGrid}
          onQuadrantTap={handleQuadrantTap}
        />
        <WallRightColumn
          todayItems={todayItemsForList}
          discussItems={discussItems}
          upcomingDays={upcomingDays}
          members={wallData.familyMembers}
          selectedOwnerId={selectedOwnerId}
          onSelectOwner={setSelectedOwnerId}
          onCheckItem={handleCheckItem}
          onTapEvent={handleTapEvent}
          onResolveDiscussion={handleResolveDiscussion}
          onTapUpcoming={(item) => setDetailItem(item)}
        />
      </div>

      {expandedQuadrant && (
        <WallQuadrantExpand
          content={expandedQuadrant}
          onClose={handleCloseExpanded}
        />
      )}

      <WallRhythmBar
        currentMode={rhythm.mode}
        overrideMode={rhythm.overrideMode}
        onSelectMode={rhythm.setOverride}
      />

      {/* Preserved overlays */}
      {detailItem && (
        <WallItemDetail item={detailItem} onClose={() => setDetailItem(null)} />
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
          }}
          onClose={() => setShowDiscussion(false)}
        />
      )}

      {/* Camera — inline live thumbnail */}
      {cameraEnabled && (
        <div className="fixed bottom-16 right-4 w-[150px] overflow-hidden rounded-xl border border-white/10">
          <WallCameraView />
        </div>
      )}

      <WallMicButton />

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

      {wallData.error && (
        <div className="fixed top-6 right-6 bg-red-900/80 text-red-200 px-5 py-3 rounded-xl text-[1rem] shadow-lg border border-red-500/30 backdrop-blur z-50">
          {wallData.error}
        </div>
      )}

      {activeContext && contextEvalData && (
        <ContextOverlay
          activeContext={activeContext}
          data={contextEvalData}
          onDismiss={dismissActiveContext}
        />
      )}

      {/* Camera toggle */}
      <button
        onClick={() => toggleCamera()}
        className="fixed bottom-2 right-24 flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                   bg-white/5 hover:bg-white/10 border border-white/10
                   text-white/20 hover:text-white/50 transition-all z-10 text-[0.7rem]"
      >
        <span>📷</span>
        <span className="font-bold uppercase tracking-wider">
          {cameraEnabled ? 'Cam On' : 'Cam Off'}
        </span>
      </button>

      {/* Reload button */}
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
    </div>
  )
}
