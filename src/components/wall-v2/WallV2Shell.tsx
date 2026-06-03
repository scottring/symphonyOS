// src/components/wall-v2/WallV2Shell.tsx
//
// Orchestrates the WallV2 kiosk surface — three-column grid (date / center /
// right widgets) with a six-button action dock at the bottom.
//
// The shell pulls live data via the existing wall hooks (useWallData,
// useWeather, useMealEventsForDate, useShoppingList) and converts it to the
// WallV2 view shape via the pure adapters in `wallV2Adapter.ts`. Each surface
// renders an empty state when its live source has no data — production never
// shows the design-payload mock. The design payload now lives only in the
// dev-only `/wall-design` preview (see `wallV2Mock.ts`).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Moon, Sun, RefreshCw, ImageOff } from 'lucide-react';
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
import { WallV2AtAGlance } from './WallV2AtAGlance';
import { WallV2Timeline } from './WallV2Timeline';
import { WallV2RightColumn } from './WallV2RightColumn';
import { WallV2ActionDock } from './WallV2ActionDock';
import { MOCK_ACTIONS } from './wallV2Mock';
import {
  adaptGlanceForMember,
  adaptScheduleBand,
  adaptTimelineSections,
  adaptUpcoming,
  adaptWeather,
} from './wallV2Adapter';
import { useWallData } from '@/hooks/useWallData';
import { useWeather } from '@/hooks/useWeather';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';
import { findDinnerEvent, getMealIcon } from '@/components/wall/WallDinnerWidget';
import { extractRecipeNameHint, resolveRecipeUrl } from '@/lib/recipeDetection';
import { WallRecipeViewer } from '@/components/wall/WallRecipeViewer';
import { useRecipe } from '@/hooks/useRecipe';
import { WallDiscussionOverlay } from '@/components/wall/WallDiscussionOverlay';
import { useFamilyDiscussionItems, type DiscussionItem } from '@/hooks/useFamilyDiscussionItems';
import { QuickCapture } from '@/components/layout/QuickCapture';
import { useAuth } from '@/hooks/useAuth';
import { AuthForm } from '@/components/AuthForm';
import { useDailyDiscussionPrompt } from '@/hooks/useDailyDiscussionPrompt';
import { supabase } from '@/lib/supabase';
import type {
  WallV2GlanceCard,
  WallV2GroceryData,
  WallV2TimelineEvent,
} from './types';
import type { Task } from '@/types/task';

/**
 * Map one of the wall's four push presets to the exact Partial<Task>
 * mutation the existing updateTask hook expects. Exported so it can be
 * unit-tested without spinning up the Shell.
 *
 * - this-week  → drop into the "week" bucket
 * - next-week  → drop into "week" + set weekDeferredAt=now (existing
 *                convention: "sink to the bottom of This Week so it
 *                surfaces during next week's planning")
 * - next-month → drop into "month"
 * - someday    → drop into "quarter" (longest review horizon; the
 *                family-readable "Someday" label is UI-only)
 *
 * scheduledFor and isSomeday are always cleared: a bucket push means
 * "do this in that bucket, no specific date," matching how triage
 * already mutates tasks elsewhere in the app.
 */
export function pushPresetToUpdates(preset: PushPreset): Partial<Task> {
  const common = { scheduledFor: undefined, isSomeday: false } as const
  switch (preset) {
    case 'this-week':
      return { ...common, bucket: 'week', weekDeferredAt: undefined }
    case 'next-week':
      return { ...common, bucket: 'week', weekDeferredAt: new Date() }
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

// Right-column slot without a live source yet. Renders as a muted
// placeholder rather than fake data, and is clearly aspirational.
const PLACEHOLDER_GROCERY: WallV2GroceryData = {
  count: 0,
  items: ['Connect a list to see what is missing'],
};

const THEME_KEY = 'symphony-wall-theme';

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
  const mealEvents = useMealEventsForDate(now);

  // ─── Adapted live data ───
  const liveWeather = useMemo(() => adaptWeather(weather), [weather]);

  const todayData = useMemo(
    () => wallData.days.find((d) => d.isToday),
    [wallData.days],
  );

  const dinnerEvent = useMemo(
    () => findDinnerEvent([...wallData.calendarEvents, ...mealEvents], now),
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
    () => adaptScheduleBand(todayData, wallData.familyMembers, now, dinnerEvent),
    [todayData, wallData.familyMembers, now, dinnerEvent],
  );

  const upcoming = useMemo(
    () => adaptUpcoming(wallData.days, now, 2),
    [wallData.days, now],
  );

  // Per-member "next thing today" glance cards. Members with no upcoming item
  // are skipped so the row collapses gracefully (1-4 cards depending on
  // how many family members have something on their plate).
  const glance: WallV2GlanceCard[] = useMemo(() => {
    if (!todayData) return [];
    const cards: WallV2GlanceCard[] = [];
    for (const member of wallData.familyMembers) {
      const card = adaptGlanceForMember(member, todayData, now);
      if (card) cards.push(card);
      if (cards.length >= 4) break;
    }
    return cards;
  }, [wallData.familyMembers, todayData, now]);

  // Weather has a sensible static fallback when the geolocation/API path
  // hasn't resolved yet — it would otherwise leave the entire hero blank.
  const weatherData = liveWeather ?? {
    temp: 0, high: 0, low: 0, condition: 'Loading', rainChance: 0, icon: Sun,
  };

  // ─── Overlay state ───
  // Guest mode: a privacy cover for when company's over — hides all content
  // behind a full-screen ambient clock/weather screen.
  const [guestMode, setGuestMode] = useState(false);
  const [showRecipeViewer, setShowRecipeViewer] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
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

  const dinnerMealName = useMemo(
    () => dinnerEvent ? (extractRecipeNameHint(dinnerEvent.title) || dinnerEvent.title) : 'Dinner',
    [dinnerEvent],
  );
  const recipeUrl = useMemo(
    () => dinnerEvent ? resolveRecipeUrl(dinnerEvent.description) : null,
    [dinnerEvent],
  );

  // For recipe-backed meals with no source URL, fall back to the recipe's stored
  // ingredients/instructions so tapping the dinner still opens a usable recipe.
  const dinnerRecipeId = dinnerEvent?.recipeId ?? null;
  const { recipe: dinnerRecipe } = useRecipe(dinnerRecipeId);
  const recipeContent = useMemo(() => {
    if (!dinnerRecipe) return null;
    if (dinnerRecipe.ingredients.length === 0 && dinnerRecipe.instructions.length === 0) return null;
    return {
      title: dinnerRecipe.title,
      ingredients: dinnerRecipe.ingredients,
      instructions: dinnerRecipe.instructions,
    };
  }, [dinnerRecipe]);

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

  const handleAction = useCallback((id: string) => {
    switch (id) {
      case 'discuss':
        if (discussionItems.length > 0) setShowDiscussion(true);
        else showFlash('Nothing flagged for discussion right now');
        break;
      case 'task':
        setShowQuickCapture(true);
        break;
      case 'reminder':
        showFlash('Tap the mic to capture a reminder by voice');
        break;
      case 'grocery':
        showFlash('Grocery capture is coming soon');
        break;
      case 'event':
        showFlash('Event capture is coming soon');
        break;
      case 'photo':
        showFlash('Photo capture is coming soon');
        break;
    }
  }, [discussionItems.length, showFlash]);

  const handleTapEvent = useCallback((id: string) => {
    // Dinner card: open recipe viewer if a URL was detected, otherwise flash
    // the meal name so the tap registers visibly even without a recipe.
    if (id.startsWith('dinner-')) {
      if (recipeUrl || recipeContent) setShowRecipeViewer(true);
      else showFlash(`Tonight: ${dinnerMealName}`);
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
  }, [recipeUrl, recipeContent, dinnerMealName, timeline, showFlash]);

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
    const flash: Record<PushPreset, string> = {
      'this-week':  'Pushed to this week',
      'next-week':  'Pushed to next week',
      'next-month': 'Pushed to next month',
      'someday':    'Pushed to Someday',
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
    <div className={`${isDark ? 'dark ' : ''}wall-touch-root relative h-screen w-screen bg-[var(--color-bg-base)] dark:bg-stone-950 text-stone-800 dark:text-stone-100 overflow-hidden transition-colors`}>
      <div className="absolute top-8 right-8 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setGuestMode(true)}
          aria-label="Guest mode"
          title="Guest mode — hide everything"
          className="grid place-items-center w-14 h-14 rounded-full bg-white/80 dark:bg-stone-800/80 border border-stone-300/70 dark:border-stone-700/70 text-stone-700 dark:text-stone-200 backdrop-blur-md hover:bg-white dark:hover:bg-stone-800 transition-colors shadow-md"
        >
          <ImageOff className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => { void wallData.refetch(); showFlash('Refreshing…'); }}
          aria-label="Refresh"
          title="Refresh"
          className="grid place-items-center w-14 h-14 rounded-full bg-white/80 dark:bg-stone-800/80 border border-stone-300/70 dark:border-stone-700/70 text-stone-700 dark:text-stone-200 backdrop-blur-md hover:bg-white dark:hover:bg-stone-800 transition-colors shadow-md"
        >
          <RefreshCw className={`w-6 h-6 ${wallData.loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={toggleHideRoutines}
          aria-label={hideRoutines ? 'Show daily routines' : 'Hide daily routines'}
          title={hideRoutines ? 'Show daily routines' : 'Hide daily routines'}
          className="grid place-items-center w-14 h-14 rounded-full bg-white/80 dark:bg-stone-800/80 border border-stone-300/70 dark:border-stone-700/70 text-stone-700 dark:text-stone-200 backdrop-blur-md hover:bg-white dark:hover:bg-stone-800 transition-colors shadow-md"
        >
          {hideRoutines ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="grid place-items-center w-14 h-14 rounded-full bg-white/80 dark:bg-stone-800/80 border border-stone-300/70 dark:border-stone-700/70 text-stone-700 dark:text-stone-200 backdrop-blur-md hover:bg-white dark:hover:bg-stone-800 transition-colors shadow-md"
        >
          {isDark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
        </button>
      </div>
      <div className="h-full w-full p-6 grid grid-cols-[280px_1fr_360px] grid-rows-[minmax(0,1fr)_auto] gap-4">
        {/* Row 1 — Left rail */}
        <div className="row-span-1 col-start-1">
          <WallV2DateColumn
            weekday={weekday}
            fullDate={fullDate}
            time={clock}
            weatherIcon={weatherData.icon ?? Sun}
            weatherTint={{ bg: TINTS.honey.bg, fg: TINTS.honey.fg }}
            temp={weatherData.temp}
            condition={weatherData.condition}
            high={weatherData.high}
            low={weatherData.low}
          />
        </div>

        {/* Row 1 — Center column (glance strip + timeline) */}
        <div className="row-span-1 col-start-2 flex flex-col gap-4 min-h-0">
          <WallV2AtAGlance cards={glance} />
          <div className="min-h-0 flex-1">
            <WallV2Timeline
              band={scheduleBand}
              sections={timeline}
              onTapEvent={handleTapEvent}
              onToggleComplete={handleToggleComplete}
              onTapFullDay={handleTapFullDay}
            />
          </div>
        </div>

        {/* Row 1 — Right column (4 widgets) */}
        <div className="row-span-1 col-start-3 min-h-0">
          <WallV2RightColumn
            grocery={PLACEHOLDER_GROCERY}
            upcoming={upcoming}
            question={tonightQuestion}
          />
        </div>

        {/* Row 2 — Full-width action dock */}
        <div className="row-start-2 col-span-3 relative">
          {flashMessage && (
            <div
              role="status"
              className="absolute -top-9 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-stone-800/90 dark:bg-stone-200/90 text-white dark:text-stone-900 text-[0.85rem] font-bold shadow-lg backdrop-blur-md whitespace-nowrap"
            >
              {flashMessage}
            </div>
          )}
          <WallV2ActionDock actions={MOCK_ACTIONS} onTap={handleAction} />
        </div>
      </div>

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

      {showRecipeViewer && (recipeUrl || recipeContent) && (
        <WallRecipeViewer
          url={recipeUrl ?? undefined}
          content={!recipeUrl ? (recipeContent ?? undefined) : undefined}
          mealName={dinnerMealName}
          mealIcon={dinnerEvent ? getMealIcon(dinnerEvent.title) : '🍽️'}
          onClose={() => setShowRecipeViewer(false)}
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
    </div>
  );
}
