// src/components/wall-v2/WallV2Shell.tsx
//
// Orchestrates the WallV2 kiosk surface — three-column grid (rail / center
// timeline+Keep Moving / right column) with a family-strip + 2x2 dock cluster
// spanning the bottom row.
//
// The shell pulls live data via the existing wall hooks (useWallData,
// useWeather, useMealEventsForDate, useShoppingList) and converts it to the
// WallV2 view shape via the pure adapters in `wallV2Adapter.ts` and the
// right-column rollups in `wallV2Rollups.ts`. Each surface renders an empty
// state when its live source has no data — production never shows the
// design-payload mock. The design payload now lives only in the dev-only
// `/wall-design` preview (see `wallV2Mock.ts`).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sun } from 'lucide-react';
import { useActionableInstances } from '@/hooks/useActionableInstances';
import { useBuildAutoReload } from '@/hooks/useBuildAutoReload';
import { WallV2GuestScreen } from './WallV2GuestScreen';
import { WallV2ItemActionSheet, type PushPreset } from './WallV2ItemActionSheet';
import {
  readHideRoutines,
  writeHideRoutines,
  onHideRoutinesChange,
} from '@/lib/hideRoutinesSignal';
import { TINTS } from './tints';
import { WallV2DateColumn } from './WallV2DateColumn';
import { WallV2StaleBanner } from './WallV2StaleBanner';
import { computeFreshness } from './wallFreshness';
import { WallV2NowNext } from './WallV2NowNext';
import { WallV2Timeline } from './WallV2Timeline';
import { WallV2RightColumn } from './WallV2RightColumn';
import { WallV2PinnedList } from './WallV2PinnedList';
import { WallV2ListSheetContainer } from './WallV2ListSheetContainer';
import { useLists } from '@/hooks/useLists';
import {
  readPinnedLists,
  togglePinnedList,
  onPinnedListsChange,
} from '@/lib/wallPinnedLists';
import { WallV2KeepMoving } from './WallV2KeepMoving';
import { WallV2FamilyStrip, type WallDockActionId } from './WallV2FamilyStrip';
import { WallV2UtilitySheet } from './WallV2UtilitySheet';
import { CallerIdTakeover } from './CallerIdTakeover';
import { WallV2PhoneScreen } from './WallV2PhoneScreen';
import { WallV2AssistantLine } from './WallV2AssistantLine';
import { wallRevealTarget, type WallAction } from './wallAssistantAdapter';
import { useUnpromptedSuggestions, type UnpromptedItem } from '@/hooks/useUnpromptedSuggestions';
import {
  adaptScheduleBand,
  adaptTimelineSections,
  adaptWeather,
} from './wallV2Adapter';
import { adaptTomorrowMorning, adaptAtAGlanceRollup } from './wallV2Rollups';
import { WALL } from './wallTheme';
import { useWallData } from '@/hooks/useWallData';
import { useWeather } from '@/hooks/useWeather';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';
import { findDinnerEvent, findBreakfastEvent, getMealIcon } from '@/components/wall/WallDinnerWidget';
import type { CalendarEvent } from '@/hooks/useGoogleCalendar';
import { extractRecipeNameHint, resolveRecipeUrl } from '@/lib/recipeDetection';
import { getNextWeekend, getWeekendAfterNext, formatShortDate } from '@/lib/dateHelpers';
import { WallRecipeViewer } from '@/components/wall/WallRecipeViewer';
import { useRecipe } from '@/hooks/useRecipe';
import { WallDiscussionOverlay } from '@/components/wall/WallDiscussionOverlay';
import { useFamilyDiscussionItems, type DiscussionItem } from '@/hooks/useFamilyDiscussionItems';
import { QuickCapture } from '@/components/layout/QuickCapture';
import { useAuth } from '@/hooks/useAuth';
import { AuthForm } from '@/components/AuthForm';
import { useDailyDiscussionPrompt } from '@/hooks/useDailyDiscussionPrompt';
import { supabase } from '@/lib/supabase';
import type { WallV2TimelineEvent } from './types';
import type { Task } from '@/types/task';

/**
 * Map one of the wall's four push presets to the exact Partial<Task>
 * mutation the existing updateTask hook expects. Exported so it can be
 * unit-tested without spinning up the Shell.
 *
 * - this-week    → drop into the "week" bucket
 * - next-week    → drop into "week" + set weekDeferredAt=now (existing
 *                  convention: "sink to the bottom of This Week so it
 *                  surfaces during next week's planning")
 * - this-weekend → schedule all-day on the upcoming Saturday (getNextWeekend)
 * - next-weekend → schedule all-day on the Saturday after next
 *                  (getWeekendAfterNext) — mirrors the main page picker
 * - next-month   → drop into "month"
 * - someday      → drop into "quarter" (longest review horizon; the
 *                  family-readable "Someday" label is UI-only)
 *
 * Bucket presets clear scheduledFor (no specific date). The weekend presets
 * are the exception: they set a real all-day date (bucket "timed"), matching
 * how SchedulePopover's "This/Next Weekend → All day" path schedules a task.
 */
export function pushPresetToUpdates(preset: PushPreset): Partial<Task> {
  const common = { scheduledFor: undefined, isSomeday: false } as const
  const weekend = (date: Date): Partial<Task> => ({
    scheduledFor: date,
    isAllDay: true,
    bucket: 'timed',
    isSomeday: false,
    weekDeferredAt: undefined,
  })
  switch (preset) {
    case 'this-week':
      return { ...common, bucket: 'week', weekDeferredAt: undefined }
    case 'next-week':
      return { ...common, bucket: 'week', weekDeferredAt: new Date() }
    case 'this-weekend':
      return weekend(getNextWeekend())
    case 'next-weekend':
      return weekend(getWeekendAfterNext())
    case 'next-month':
      return { ...common, bucket: 'month', weekDeferredAt: undefined }
    case 'someday':
      return { ...common, bucket: 'quarter', weekDeferredAt: undefined }
  }
}

function formatDate(d: Date): { weekday: string; fullDate: string } {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return { weekday, fullDate };
}

const THEME_KEY = 'symphony-wall-theme';

// Everything the wall needs to present one meal card's recipe: display name,
// detected source URL, and (for recipe-backed meals with no URL) the recipe's
// stored ingredients/instructions so the tap still opens a usable recipe.
function useMealCardData(event: CalendarEvent | null, fallbackName: string) {
  const mealName = useMemo(
    () => event ? (extractRecipeNameHint(event.title) || event.title) : fallbackName,
    [event, fallbackName],
  );
  const recipeUrl = useMemo(
    () => event ? resolveRecipeUrl(event.description) : null,
    [event],
  );
  const { recipe } = useRecipe(event?.recipeId ?? null);
  const recipeContent = useMemo(() => {
    if (!recipe) return null;
    if (recipe.ingredients.length === 0 && recipe.instructions.length === 0) return null;
    return {
      title: recipe.title,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
    };
  }, [recipe]);
  return useMemo(
    () => ({ mealName, recipeUrl, recipeContent }),
    [mealName, recipeUrl, recipeContent],
  );
}

export function WallV2Shell() {
  const { user, loading: authLoading } = useAuth();

  // The chromeless Pi kiosk can't reload itself to pick up a new deploy, so a
  // shipped fix can stay invisible on the wall until a power-cycle. Poll for a
  // newer build and reload automatically. See useBuildAutoReload.
  useBuildAutoReload();

  // Re-rendering each minute keeps the date, timeline filter, and time-aware
  // copy minute-fresh without thrashing the hooks below.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(THEME_KEY) === 'dark';
  });
  const toggleTheme = useCallback(() => {
    setIsDark((d) => {
      const next = !d;
      try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light'); } catch { /* noop */ }
      return next;
    });
  }, []);

  // Share the same hide-daily preference Today + Week views use, so the
  // toggle stays consistent across surfaces.
  const [hideRoutines, setHideRoutines] = useState<boolean>(() => readHideRoutines());
  useEffect(() => onHideRoutinesChange(setHideRoutines), []);
  const toggleHideRoutines = useCallback(() => {
    writeHideRoutines(!hideRoutines);
  }, [hideRoutines]);

  const { weekday, fullDate } = useMemo(() => formatDate(now), [now]);
  const clock = useMemo(
    () => now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    [now],
  );

  const wallData = useWallData();
  const { weather } = useWeather();
  // force:true — surface tonight's planned dinner + its stored recipe on the
  // kiosk even while planned meals stay off the Today/Week/Month timelines.
  const mealEvents = useMealEventsForDate(now, { force: true });

  // ─── Adapted live data ───
  const liveWeather = useMemo(() => adaptWeather(weather), [weather]);

  // The kiosk's worst failure is looking authoritative while hours out of date
  // (Pi lost WiFi on 2026-07-21 and 2026-07-29). useWallData already tracked the
  // error and the last good refresh; nothing rendered them until now.
  const freshness = useMemo(
    () =>
      computeFreshness({
        lastRefresh: wallData.lastRefresh,
        error: wallData.error,
        now,
      }),
    [wallData.lastRefresh, wallData.error, now],
  );

  const todayData = useMemo(
    () => wallData.days.find((d) => d.isToday),
    [wallData.days],
  );

  const dinnerEvent = useMemo(
    () => findDinnerEvent([...wallData.calendarEvents, ...mealEvents], now),
    [wallData.calendarEvents, mealEvents, now],
  );

  // CalendarEvent's start time is a string on either the snake_case
  // (edge-function) or camelCase (cached) field — never a Date — so it needs
  // parsing before it can feed the right column / rollups, which want Date.
  const dinnerStartDate = useMemo(() => {
    if (!dinnerEvent) return null;
    const startStr = dinnerEvent.start_time || dinnerEvent.startTime;
    return startStr ? new Date(startStr) : null;
  }, [dinnerEvent]);

  const breakfastEvent = useMemo(
    () => findBreakfastEvent([...wallData.calendarEvents, ...mealEvents], now),
    [wallData.calendarEvents, mealEvents, now],
  );

  const timeline = useMemo(
    () => adaptTimelineSections(
      todayData,
      wallData.familyMembers,
      now,
      dinnerEvent,
      hideRoutines,
      wallData.overdueTasks,
    ),
    [todayData, wallData.familyMembers, now, dinnerEvent, hideRoutines, wallData.overdueTasks],
  );

  // Prioritized timed agenda (events + timed tasks) shown in its own band above
  // the rhythm sections. Dinner is promoted here, so adaptTimelineSections no
  // longer handles it.
  const scheduleBand = useMemo(
    () => adaptScheduleBand(todayData, wallData.familyMembers, now, dinnerEvent, breakfastEvent),
    [todayData, wallData.familyMembers, now, dinnerEvent, breakfastEvent],
  );

  // Weather has a sensible static fallback when the geolocation/API path
  // hasn't resolved yet — it would otherwise leave the entire hero blank.
  const weatherData = liveWeather ?? {
    temp: 0, high: 0, low: 0, condition: 'Loading', rainChance: 0, icon: Sun,
  };

  // ─── Overlay state ───
  // Guest mode: a privacy cover for when company's over — hides all content
  // behind a full-screen ambient clock/weather screen.
  const [guestMode, setGuestMode] = useState(false);
  const [recipeViewerMeal, setRecipeViewerMeal] = useState<'dinner' | 'breakfast' | null>(null);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [showListSheet, setShowListSheet] = useState(false);
  const [sheetListId, setSheetListId] = useState<string | null>(null);
  const [pinnedListIds, setPinnedListIds] = useState<string[]>(() => readPinnedLists());

  // Pins are wall-local; subscribe so a pin made in the sheet updates the face.
  useEffect(() => onPinnedListsChange(setPinnedListIds), []);

  const { lists } = useLists();
  // The wall is a shared kitchen display — personal lists never appear on it.
  const familyLists = useMemo(
    () => lists.filter((l) => l.visibility === 'family'),
    [lists],
  );

  const [showPhone, setShowPhone] = useState(false);
  const [showUtilities, setShowUtilities] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showFlash = useCallback((msg: string) => {
    setFlashMessage(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashMessage(null), 2400);
  }, []);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const { items: discussionItems, unflagEvent, updateTask } = useFamilyDiscussionItems();
  const { prompt: tonightPrompt, dismissed: tonightPromptDismissed } = useDailyDiscussionPrompt();
  const tonightQuestion = tonightPromptDismissed ? null : tonightPrompt;

  const dinner = useMealCardData(dinnerEvent, 'Dinner');
  const breakfast = useMealCardData(breakfastEvent, 'Breakfast');
  const viewerMeal = recipeViewerMeal === 'breakfast' ? breakfast : dinner;
  const viewerEvent = recipeViewerMeal === 'breakfast' ? breakfastEvent : dinnerEvent;

  const tomorrowRows = useMemo(
    () => adaptTomorrowMorning(wallData.days, now),
    [wallData.days, now],
  );
  const glanceRows = useMemo(
    () => adaptAtAGlanceRollup(todayData, dinnerStartDate, dinnerEvent ? dinner.mealName : null, now),
    [todayData, dinnerStartDate, dinnerEvent, dinner.mealName, now],
  );
  // Keep Moving = incomplete task-kind items from the timeline sections.
  const keepMovingTasks = useMemo(
    () => timeline.flatMap((s) => s.events).filter((e) => e.kind === 'task' && !e.completed),
    [timeline],
  );

  const handleMarkDiscussed = useCallback(async (item: DiscussionItem) => {
    if (item.kind === 'task') {
      await updateTask(item.id, { needsDiscussion: false, discussionNote: undefined });
    } else {
      await unflagEvent(item.id);
    }
  }, [updateTask, unflagEvent]);

  // Tap-to-complete from the wall. Timeline ids are prefixed (task-/routine-/
  // event-); tasks toggle their completed flag, routines/events write a
  // completed (or undone) actionable_instance for today. Refetch to refresh.
  const { skip, markDone, undoDone } = useActionableInstances();
  const [actionSheetItem, setActionSheetItem] = useState<WallV2TimelineEvent | null>(null);
  const handleToggleComplete = useCallback((id: string, completed: boolean) => {
    void (async () => {
      if (id.startsWith('task-')) {
        await updateTask(id.slice('task-'.length), { completed });
      } else if (id.startsWith('routine-')) {
        const rid = id.slice('routine-'.length);
        await (completed ? markDone('routine', rid, now) : undoDone('routine', rid, now));
      } else if (id.startsWith('event-')) {
        const eid = id.slice('event-'.length);
        await (completed ? markDone('calendar_event', eid, now) : undoDone('calendar_event', eid, now));
      }
      await wallData.refetch();
    })();
  }, [updateTask, markDone, undoDone, now, wallData]);

  // Insert an unscheduled family task — same shape WallMicButton uses, so the
  // wall capture surface stays consistent regardless of input method.
  const handleQuickCaptureAdd = useCallback(async (title: string) => {
    if (!user) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    const { error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title: trimmed,
      context: 'family',
      scheduled_for: null,
      completed: false,
    });
    if (error) {
      console.error('[wall-v2] add task failed:', error);
      showFlash('Save failed — try again');
    } else {
      showFlash(`Added: ${trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed}`);
      wallData.refetch();
    }
  }, [user, showFlash, wallData]);

  const handleDockAction = useCallback((id: WallDockActionId) => {
    switch (id) {
      case 'task': setShowQuickCapture(true); break;
      case 'discuss':
        if (discussionItems.length > 0) setShowDiscussion(true);
        else showFlash('Nothing flagged for discussion right now');
        break;
      case 'list': setSheetListId(null); setShowListSheet(true); break;
      case 'phone': setShowPhone(true); break;
      case 'utilities': setShowUtilities(true); break;
    }
  }, [discussionItems.length, showFlash]);

  // ── Unprompted tier ────────────────────────────────────────────────────────
  // The wall does NOT pass a facts resolver: useWallData narrows its task columns
  // and doesn't carry defer_count/waiting_since, so the engine's stored urgency
  // hint is the honest input here. It fails closed — a null hint reads as 0 and
  // never interrupts.
  // includeCadence:false — "Plan the season" is not a kitchen-wall action. It has
  // no timeline event to reveal, so "Show me" would be a dead tap, and nobody
  // plans a season standing at a touchscreen from eight feet away. Cadence
  // belongs to Today, where the guided session actually opens.
  const wallUnprompted = useUnpromptedSuggestions('wall', { includeCadence: false });

  const showWhyDebug = useMemo(
    () => new URLSearchParams(window.location.search).get('why') === '1',
    [],
  );

  const handleTapEvent = useCallback((id: string) => {
    // Meal cards: open recipe viewer if a URL/stored recipe was detected,
    // otherwise flash the meal name so the tap registers visibly.
    if (id.startsWith('dinner-')) {
      if (dinner.recipeUrl || dinner.recipeContent) setRecipeViewerMeal('dinner');
      else showFlash(`Tonight: ${dinner.mealName}`);
      return;
    }
    if (id.startsWith('breakfast-')) {
      if (breakfast.recipeUrl || breakfast.recipeContent) setRecipeViewerMeal('breakfast');
      else showFlash(`Breakfast: ${breakfast.mealName}`);
      return;
    }
    // Routine/event cards open the touch action sheet (Skip today / Mark done).
    // Tasks (and anything else) just flash their title for now.
    const tapped = timeline.flatMap((s) => s.events).find((e) => e.id === id);
    if (!tapped) return;
    // Tasks now open the action sheet too (task variant) — completion
    // plus four push presets. Routines and events keep their existing
    // routine / event branches inside the sheet.
    if (tapped.kind === 'routine' || tapped.kind === 'event' || tapped.kind === 'task') {
      setActionSheetItem(tapped);
    } else {
      showFlash(tapped.title);
    }
  }, [dinner, breakfast, timeline, showFlash]);

  const handleAssistantAct = useCallback((action: WallAction, item: UnpromptedItem) => {
    if (action.kind === 'wall_call') {
      // The wall's own phone flow — never tel:, which is inert on the Pi.
      setShowPhone(true);
    } else {
      // "Show me" — reveal the entity using the sheet the wall already has.
      // handleTapEvent silently no-ops on an id it can't find, which on a
      // wall-mounted screen reads as a broken button, so confirm the tap landed.
      // Match on the prefixed timeline id, not the bare entity id — see
      // wallRevealTarget.
      const target = wallRevealTarget(
        item.suggestion,
        timeline.flatMap((s) => s.events).map((e) => e.id),
      );
      if (target) handleTapEvent(target);
      else showFlash(item.suggestion.title);
    }
    void wallUnprompted.act(item.suggestion.id);
  }, [handleTapEvent, wallUnprompted, timeline, showFlash]);

  const handleWallSkip = useCallback(async (id: string, kind: 'event' | 'routine') => {
    const entityType = kind === 'routine' ? 'routine' : 'calendar_event';
    const entityId = id.replace(/^(routine-|event-)/, '');
    await skip(entityType, entityId, now);
    wallData.refetch();
    showFlash('Skipped for today');
  }, [skip, now, wallData, showFlash]);

  const handleWallMarkDone = useCallback(async (id: string, kind: 'event' | 'routine' | 'task') => {
    if (kind === 'task') {
      // Reuse the same path the row's checkbox uses — single source of
      // truth for "complete this task" mutations from the wall.
      handleToggleComplete(id, true);
      showFlash('Marked complete');
      return;
    }
    const entityType = kind === 'routine' ? 'routine' : 'calendar_event';
    const entityId = id.replace(/^(routine-|event-)/, '');
    await markDone(entityType, entityId, now);
    wallData.refetch();
    showFlash('Marked done');
  }, [handleToggleComplete, markDone, now, wallData, showFlash]);

  const handleWallPushTask = useCallback(async (id: string, preset: PushPreset) => {
    const taskId = id.replace(/^task-/, '');
    await updateTask(taskId, pushPresetToUpdates(preset));
    wallData.refetch();
    // Weekend presets resolve to a concrete Saturday — show it so "next
    // weekend" is never ambiguous (which Saturday did it land on?). The fuzzy
    // bucket presets have no specific date, so they stay label-only.
    const flash: Record<PushPreset, string> = {
      'this-week':    'Moved to this week',
      'this-weekend': `Moved to this weekend · ${formatShortDate(getNextWeekend())}`,
      'next-week':    'Moved to next week',
      'next-weekend': `Moved to next weekend · ${formatShortDate(getWeekendAfterNext())}`,
      'next-month':   'Moved to next month',
      'someday':      'Moved to Someday',
    };
    showFlash(flash[preset]);
  }, [updateTask, wallData, showFlash]);

  const handleTapFullDay = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log('[wall-v2] view full day');
  }, []);

  // Derive the discussion-overlay visibility so it auto-hides when the queue
  // drains (without an effect that lint flags for cascading renders).
  const discussionVisible = showDiscussion && discussionItems.length > 0;

  // Lightweight {id,name} projections so the QuickCapture parser keeps working
  // when launched from the wall. Slim shapes avoid pulling the full contact
  // model into the wall bundle.
  const captureProjects = useMemo(() => [], []);
  const captureContacts = useMemo(() => [], []);
  const captureFamilyMembers = useMemo(
    () => wallData.familyMembers.map((m) => ({ id: m.id, name: m.name })),
    [wallData.familyMembers],
  );

  // Chromeless kiosk recovery: the wall has no nav, so a lost session (e.g. it
  // sat through a Supabase outage and its token couldn't refresh) leaves every
  // data fetch no-op'ing on `!user` and the refresh spinner stuck forever, with
  // no way to log back in. Render the sign-in form instead of a dead spinner so
  // the wall can recover itself. Wait out the initial auth check to avoid a
  // login flash; AuthForm flips `user` on success and we re-render into the wall.
  if (!authLoading && !user) {
    return <AuthForm />;
  }

  return (
    <div className={`${isDark ? 'dark ' : ''}wall-touch-root relative h-screen w-screen overflow-hidden transition-colors ${WALL.root}`}>
      <img
        src="/wall/treeline.svg"
        alt=""
        aria-hidden
        className="absolute top-0 right-0 w-[340px] h-[110px] opacity-30 dark:opacity-15 pointer-events-none"
      />
      {/* flex column so the stale banner can claim height without the fixed grid
          clipping — the grid below simply shrinks when the banner appears. */}
      <div className="h-full w-full p-4 flex flex-col">
      <WallV2StaleBanner freshness={freshness} />
      <div className="flex-1 min-h-0 grid grid-cols-[220px_minmax(0,1fr)_264px] grid-rows-[minmax(0,1fr)_116px] gap-3">
        {/* Row 1 — rail */}
        <div className="row-span-1 col-start-1 min-h-0">
          <WallV2DateColumn
            weekday={weekday}
            fullDate={fullDate}
            time={clock}
            date={now}
            weatherIcon={weatherData.icon ?? Sun}
            weatherTint={{ bg: TINTS.honey.bg, fg: TINTS.honey.fg }}
            temp={weatherData.temp}
            condition={weatherData.condition}
            high={weatherData.high}
            low={weatherData.low}
            freshness={freshness}
          />
        </div>

        {/* Row 1 — center: NOW + timeline + Keep Moving */}
        <div className="row-span-1 col-start-2 flex flex-col gap-3 min-h-0 min-w-0">
          <WallV2NowNext today={todayData} familyMembers={wallData.familyMembers} now={now} />
          <WallV2AssistantLine
            item={wallUnprompted.items[0] ?? null}
            onAct={handleAssistantAct}
            onSnooze={(id) => void wallUnprompted.snooze(id, 'now')}
            decisions={wallUnprompted.decisions}
            showWhy={showWhyDebug}
          />
          <div className="min-h-0 flex-1">
            <WallV2Timeline
              band={scheduleBand}
              calendarUnavailable={wallData.calendarUnavailable}
              sections={timeline}
              onTapEvent={handleTapEvent}
              onToggleComplete={handleToggleComplete}
              onTapFullDay={handleTapFullDay}
            />
          </div>
          <div className="h-[104px] shrink-0">
            <WallV2KeepMoving tasks={keepMovingTasks} onToggleComplete={handleToggleComplete} onTapTask={handleTapEvent} />
          </div>
        </div>

        {/* Row 1 — right column */}
        <div className="row-span-1 col-start-3 min-h-0">
          <WallV2RightColumn
            dinner={{
              mealName: dinnerEvent ? dinner.mealName : null,
              dinnerStart: dinnerStartDate,
              photoUrl: null,
              onTap: () => handleTapEvent(`dinner-${dinnerEvent?.id ?? 'none'}`),
            }}
            tomorrowRows={tomorrowRows}
            glanceRows={glanceRows}
            question={tonightQuestion}
            pinnedLists={pinnedListIds.map((id) => {
              const list = familyLists.find((l) => l.id === id);
              if (!list) return null;
              return (
                <WallV2PinnedList
                  key={id}
                  listId={id}
                  title={list.title}
                  onOpen={() => { setSheetListId(id); setShowListSheet(true); }}
                />
              );
            })}
          />
        </div>

        {/* Row 2 — family strip + dock cluster */}
        <div className="row-start-2 col-span-3 relative min-h-0">
          {flashMessage && (
            <div
              role="status"
              className="animate-fade-in-up absolute -top-9 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-stone-800/90 dark:bg-stone-200/90 text-white dark:text-stone-900 text-[0.85rem] font-bold shadow-lg backdrop-blur-md whitespace-nowrap"
            >
              {flashMessage}
            </div>
          )}
          <WallV2FamilyStrip familyMembers={wallData.familyMembers} today={todayData} now={now} onDockAction={handleDockAction} />
        </div>
      </div>
      </div>

      {showUtilities && (
        <WallV2UtilitySheet
          hideRoutines={hideRoutines}
          isDark={isDark}
          refreshing={wallData.loading}
          onGuestMode={() => { setShowUtilities(false); setGuestMode(true); }}
          onRefresh={() => { void wallData.refetch(); showFlash('Refreshing…'); }}
          onToggleHideRoutines={toggleHideRoutines}
          onToggleTheme={toggleTheme}
          onClose={() => setShowUtilities(false)}
        />
      )}

      {/* ─── Overlays ─── */}
      {actionSheetItem && (
        <WallV2ItemActionSheet
          event={actionSheetItem}
          onSkip={handleWallSkip}
          onMarkDone={handleWallMarkDone}
          onPushTask={handleWallPushTask}
          onClose={() => setActionSheetItem(null)}
        />
      )}

      {recipeViewerMeal && (viewerMeal.recipeUrl || viewerMeal.recipeContent) && (
        <WallRecipeViewer
          url={viewerMeal.recipeUrl ?? undefined}
          content={!viewerMeal.recipeUrl ? (viewerMeal.recipeContent ?? undefined) : undefined}
          mealName={viewerMeal.mealName}
          mealIcon={viewerEvent ? getMealIcon(viewerEvent.title) : '🍽️'}
          onClose={() => setRecipeViewerMeal(null)}
        />
      )}

      {discussionVisible && (
        <WallDiscussionOverlay
          items={discussionItems}
          onMarkDiscussed={handleMarkDiscussed}
          onClose={() => setShowDiscussion(false)}
        />
      )}

      {/* QuickCapture overlay — controlled, no FAB; the wall dock owns the
         entry point. Parser is given a slim family list for @mentions. */}
      <QuickCapture
        onAdd={handleQuickCaptureAdd}
        projects={captureProjects}
        contacts={captureContacts}
        familyMembers={captureFamilyMembers}
        isOpen={showQuickCapture}
        onOpen={() => setShowQuickCapture(true)}
        onClose={() => setShowQuickCapture(false)}
        showFab={false}
      />

      {/* Wall mic disabled 2026-05-25 (kids playing with it). Restore by
          re-adding <WallMicButton /> here + its import. */}

      {guestMode && (
        <WallV2GuestScreen
          time={clock}
          weekday={weekday}
          fullDate={fullDate}
          temp={weatherData.temp}
          condition={weatherData.condition}
          weatherIcon={weatherData.icon ?? Sun}
          onExit={() => setGuestMode(false)}
        />
      )}

      {showPhone && <WallV2PhoneScreen onClose={() => setShowPhone(false)} />}

      {showListSheet && (
        <WallV2ListSheetContainer
          lists={familyLists}
          initialListId={sheetListId}
          pinnedIds={pinnedListIds}
          onTogglePin={(id) => setPinnedListIds(togglePinnedList(id))}
          onError={showFlash}
          onClose={() => setShowListSheet(false)}
        />
      )}

      {/* Caller-ID takeover — full-screen when the kid phone has a live call. */}
      <CallerIdTakeover />
    </div>
  );
}
