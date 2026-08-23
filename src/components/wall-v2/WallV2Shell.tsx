// src/components/wall-v2/WallV2Shell.tsx
//
// Orchestrates the WallV2 kiosk surface — three-column grid (rail / center
// timeline+Keep Moving / right column) with a family-strip + 3x2 dock cluster
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
import { Sun, Plus, MessagesSquare, ClipboardList, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { WallV2StaleBanner } from './WallV2StaleBanner';
import { computeFreshness } from './wallFreshness';
import { WallV2Lanes } from './WallV2Lanes';
import { WallV2Header } from './WallV2Header';
import { WallV2Strip } from './WallV2Strip';
import { adaptMealRows, adaptDueRows, adaptComingUpRows } from './wallStrip';
import { adaptLanes } from './wallLanes';
import { WallV2RightColumn } from './WallV2RightColumn';
import { WallV2PinnedList } from './WallV2PinnedList';
import { WallV2ListSheetContainer } from './WallV2ListSheetContainer';
import { useLists } from '@/hooks/useLists';
import { defaultScopeForArea } from '@/lib/scope';
import {
  readPinnedLists,
  togglePinnedList,
  onPinnedListsChange,
} from '@/lib/wallPinnedLists';
import type { WallDockActionId } from './WallV2FamilyStrip';
import { WallV2UtilitySheet } from './WallV2UtilitySheet';
import { CallerIdTakeover } from './CallerIdTakeover';
import { WallV2PhoneScreen } from './WallV2PhoneScreen';
import { adaptTimelineSections, adaptWeather } from './wallV2Adapter';
import { adaptAtAGlanceRollup } from './wallV2Rollups';
import { WALL } from './wallTheme';
import { useWallData } from '@/hooks/useWallData';
import { useWeather } from '@/hooks/useWeather';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';
import { useMealDayRecipes } from '@/hooks/useMealDayRecipes';
import { localDateKey, mealDayLabel, neighborDays, type MealDayRecipe } from '@/lib/mealDayRecipes';
import type { MealSlot } from '@/types/meal-planner';
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

// The dock, relocated to the rail and demoted. 'phone' is deliberately NOT in
// here — it gets its own full-width button above, because burying a kid's call
// to Grandma one tap deeper is the one regression this redesign must not make.
const RAIL_ACTIONS: { id: WallDockActionId; label: string; icon: LucideIcon }[] = [
  { id: 'task', label: 'Add a task', icon: Plus },
  { id: 'discuss', label: 'Discuss', icon: MessagesSquare },
  { id: 'list', label: 'Lists', icon: ClipboardList },
  { id: 'utilities', label: 'Utilities', icon: Settings },
];

const THEME_KEY = 'symphony-wall-theme';

/** How long the dinner card stays on a paged day before returning to today.
 *  Long enough to read a plan, short enough that the next person through the
 *  kitchen sees tonight. */
const MEAL_DAY_RESET_MS = 90_000;

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
  // Which dinner day the wall is looking at — shared by the face's dinner card
  // and the recipe viewer, so tapping a paged card opens that same day.
  // null = today.
  const [mealDayKey, setMealDayKey] = useState<string | null>(null);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [showListSheet, setShowListSheet] = useState(false);
  const [sheetListId, setSheetListId] = useState<string | null>(null);
  const [pinnedListIds, setPinnedListIds] = useState<string[]>(() => readPinnedLists());
  // Bumped whenever the list sheet closes, so pinned cards refetch and pick
  // up edits made in the sheet — the sheet and each card own separate
  // useListItems instances with no realtime channel or write bus between
  // them.
  const [listRefreshKey, setListRefreshKey] = useState(0);

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

  const dinner = useMealCardData(dinnerEvent, 'Dinner');
  const breakfast = useMealCardData(breakfastEvent, 'Breakfast');
  const viewerMeal = recipeViewerMeal === 'breakfast' ? breakfast : dinner;
  const viewerEvent = recipeViewerMeal === 'breakfast' ? breakfastEvent : dinnerEvent;

  // ─── Recipe viewer: paging to the previous / next planned day ───
  // `now` ticks every minute; the day list must not, so everything below keys
  // off the date only.
  const todayKey = useMemo(() => localDateKey(now), [now]);
  const anchorDate = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);
  // Dinner days load unconditionally: the wall-face card pages days too, not
  // just the viewer. The fetch keys off the three-week window, so this is one
  // load per session, not a poll. Breakfast stays gated — a breakfast recipe on
  // the wall is rare, and there's no breakfast card to page.
  const { days: dinnerDays } = useMealDayRecipes(anchorDate, 'dinner', true);
  const { days: breakfastDays } = useMealDayRecipes(
    anchorDate, 'breakfast', recipeViewerMeal === 'breakfast',
  );
  const viewerSlot: MealSlot = recipeViewerMeal === 'breakfast' ? 'breakfast' : 'dinner';
  const plannedDays = viewerSlot === 'breakfast' ? breakfastDays : dinnerDays;

  // Today's entry comes from the live wall data, not the plan — tonight's
  // dinner can be a calendar event rather than a meal-plan row, and the viewer
  // must open on exactly what the dinner card said.
  const liveTodayName = viewerMeal.recipeUrl || viewerMeal.recipeContent ? viewerMeal.mealName : null;
  const withLiveToday = useCallback((days: MealDayRecipe[]) => {
    const others = days.filter((d) => d.dateKey !== todayKey);
    const todayEntry: MealDayRecipe | null = liveTodayName
      ? { dateKey: todayKey, date: anchorDate, title: liveTodayName, ingredients: [], instructions: [] }
      : days.find((d) => d.dateKey === todayKey) ?? null;
    return [...others, ...(todayEntry ? [todayEntry] : [])]
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [todayKey, anchorDate, liveTodayName]);

  const navDays = useMemo(() => withLiveToday(plannedDays), [withLiveToday, plannedDays]);
  const dinnerNavDays = useMemo(() => withLiveToday(dinnerDays), [withLiveToday, dinnerDays]);

  const selectedDayKey = mealDayKey ?? todayKey;
  const selectedPlannedDay = useMemo(
    () => (selectedDayKey === todayKey ? null : plannedDays.find((d) => d.dateKey === selectedDayKey) ?? null),
    [selectedDayKey, todayKey, plannedDays],
  );
  // What the wall FACE shows — always the dinner list, whatever the viewer is on.
  const selectedDinnerDay = useMemo(
    () => (selectedDayKey === todayKey ? null : dinnerDays.find((d) => d.dateKey === selectedDayKey) ?? null),
    [selectedDayKey, todayKey, dinnerDays],
  );
  // A paged-to day that disappears (plan edited from the phone mid-view) drops
  // back to today rather than showing a blank card or recipe.
  useEffect(() => {
    if (mealDayKey && mealDayKey !== todayKey && !selectedPlannedDay && !selectedDinnerDay) {
      setMealDayKey(null);
    }
  }, [mealDayKey, todayKey, selectedPlannedDay, selectedDinnerDay]);

  // The wall is a shared ambient display. Someone glancing at Friday's dinner
  // must not leave the kitchen believing that's tonight, so the face returns to
  // today on its own once nobody's driving it. Held while the viewer is open —
  // the cook is reading that on purpose.
  useEffect(() => {
    if (!mealDayKey || recipeViewerMeal) return;
    const timer = setTimeout(() => setMealDayKey(null), MEAL_DAY_RESET_MS);
    return () => clearTimeout(timer);
  }, [mealDayKey, recipeViewerMeal]);

  const { prev: prevNavDay, next: nextNavDay } = useMemo(
    () => neighborDays(navDays, selectedDayKey),
    [navDays, selectedDayKey],
  );
  const { prev: prevDinnerDay, next: nextDinnerDay } = useMemo(
    () => neighborDays(dinnerNavDays, selectedDayKey),
    [dinnerNavDays, selectedDayKey],
  );
  const goToDay = useCallback(
    (day: MealDayRecipe | null) => () => {
      if (day) setMealDayKey(day.dateKey === todayKey ? null : day.dateKey);
    },
    [todayKey],
  );
  const toNeighbor = useCallback(
    (day: MealDayRecipe | null) =>
      day ? { label: mealDayLabel(day.date, viewerSlot, todayKey), title: day.title } : null,
    [viewerSlot, todayKey],
  );

  // What the viewer actually renders: the live meal on today, the stored recipe
  // on any other day. Memoized so the `content` object keeps a stable identity —
  // the viewer reloads whenever it changes.
  const viewerPayload = useMemo(() => {
    if (!recipeViewerMeal) return null;
    if (selectedPlannedDay) {
      const hasBody =
        selectedPlannedDay.ingredients.length > 0 || selectedPlannedDay.instructions.length > 0;
      return {
        url: hasBody ? undefined : selectedPlannedDay.sourceUrl,
        content: hasBody
          ? {
              title: selectedPlannedDay.title,
              ingredients: selectedPlannedDay.ingredients,
              instructions: selectedPlannedDay.instructions,
            }
          : undefined,
        mealName: selectedPlannedDay.title,
        mealIcon: getMealIcon(selectedPlannedDay.title),
      };
    }
    if (!viewerMeal.recipeUrl && !viewerMeal.recipeContent) return null;
    return {
      url: viewerMeal.recipeUrl ?? undefined,
      content: !viewerMeal.recipeUrl ? (viewerMeal.recipeContent ?? undefined) : undefined,
      mealName: viewerMeal.mealName,
      mealIcon: viewerEvent ? getMealIcon(viewerEvent.title) : '🍽️',
    };
  }, [recipeViewerMeal, selectedPlannedDay, viewerMeal, viewerEvent]);

  // ─── Bottom strip ───
  // Three cheap projections over data the wall already holds: no new queries,
  // which matters on a display that polls all day (see the egress incident).
  const mealRows = useMemo(
    () => adaptMealRows(dinnerDays, todayKey),
    [dinnerDays, todayKey],
  );
  const dueRows = useMemo(
    () => adaptDueRows(todayData, wallData.familyMembers),
    [todayData, wallData.familyMembers],
  );
  const comingUpRows = useMemo(
    () => adaptComingUpRows(wallData.days),
    [wallData.days],
  );

  const glanceRows = useMemo(
    () => adaptAtAGlanceRollup(todayData, dinnerStartDate, dinnerEvent ? dinner.mealName : null, now),
    [todayData, dinnerStartDate, dinnerEvent, dinner.mealName, now],
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
      // This insert bypasses addTask, so it must apply the same context→scope
      // default addTask gets for free. RLS shares on scope, not context: without
      // this the capture shows on the wall (which filters on context) but stays
      // invisible to everyone else in the household.
      scope: defaultScopeForArea('family'),
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

  // One lane per household member, resolved from the 7 days useWallData already
  // holds. Members drive the order, so the lanes stay in a stable position on
  // the wall rather than reshuffling as the day's items change.
  const lanes = useMemo(
    () => adaptLanes(wallData.familyMembers, wallData.days, now),
    [wallData.familyMembers, wallData.days, now],
  );

  // Tapping a lane opens the same action sheet the timeline used, so marking a
  // thing done didn't leave the wall with the timeline. Timeline events carry
  // the raw TimelineItem id, so the lane's itemId matches directly.
  //
  // A lane that has fallen forward to a later day has no match here — today's
  // timeline doesn't contain it — so it flashes instead of dead-tapping. That's
  // correct: you can't tick off Friday's dentist on Wednesday.
  const handleTapLane = useCallback((itemId: string | null, label: string | null) => {
    if (!itemId) return;
    const tapped = timeline.flatMap((s) => s.events).find((e) => e.id === itemId);
    if (tapped && (tapped.kind === 'routine' || tapped.kind === 'event' || tapped.kind === 'task')) {
      setActionSheetItem(tapped);
      return;
    }
    if (label) showFlash(label);
  }, [timeline, showFlash]);

  // The face's dinner card opens whatever day it's currently showing. A paged
  // day always has a body or a source URL (buildMealDayRecipes drops the ones
  // that don't), so it can open without the tonight-only recipe check.
  const handleTapDinnerCard = useCallback(() => {
    if (selectedDinnerDay) { setRecipeViewerMeal('dinner'); return; }
    if (dinner.recipeUrl || dinner.recipeContent) setRecipeViewerMeal('dinner');
    else showFlash(`Tonight: ${dinner.mealName}`);
  }, [selectedDinnerDay, dinner, showFlash]);

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
      {/* Three rows, not three columns.
          The 220px rail + 264px right column consumed 47% of a 1024px screen,
          leaving the lanes — the wall's primary structure, and horizontal by
          nature — barely half the width. A header costs ~92px of height and
          gives the lanes the full 1024. The strip below is a fixed 204px so
          the lanes absorb whatever is left rather than the other way round.
          Nothing scrolls: this display has no wheel and no scrollbar, so
          anything past the fold is unreachable, not merely awkward. */}
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <WallV2Header
          weekday={weekday}
          fullDate={fullDate}
          time={clock}
          weatherIcon={weatherData.icon ?? Sun}
          weatherTint={{ bg: TINTS.honey.bg, fg: TINTS.honey.fg }}
          temp={weatherData.temp}
          condition={weatherData.condition}
          high={weatherData.high}
          low={weatherData.low}
          freshness={freshness}
          actions={
            <div className="flex gap-2">
              {RAIL_ACTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  aria-label={label}
                  onClick={() => handleDockAction(id)}
                  className={`${WALL.cardInset} w-14 h-14 grid place-items-center active:scale-95 transition-transform`}
                >
                  <Icon className={`w-6 h-6 ${WALL.muted}`} />
                </button>
              ))}
            </div>
          }
        />

        {/* Lanes take the width the rail gave up; the right column stays — the
            dinner hero, its recipe viewer and the pinned lists are shipped,
            interactive surfaces, and the mockup's omission of them is the
            mockup being a sketch, not a decision. */}
        <div className="flex-1 min-h-0 flex gap-3">
          <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-3">
            <WallV2Lanes lanes={lanes} onTapLane={handleTapLane} />
          </div>

          <div className="w-[248px] shrink-0 min-h-0">
            <WallV2RightColumn
              dinner={{
                mealName: selectedDinnerDay ? selectedDinnerDay.title : (dinnerEvent ? dinner.mealName : null),
                dinnerStart: selectedDinnerDay ? null : dinnerStartDate,
                photoUrl: null,
                onTap: handleTapDinnerCard,
                dayLabel: selectedDinnerDay ? mealDayLabel(selectedDinnerDay.date, 'dinner', todayKey) : null,
                onPrevDay: prevDinnerDay ? goToDay(prevDinnerDay) : null,
                onNextDay: nextDinnerDay ? goToDay(nextDinnerDay) : null,
              }}
              /* The week of dinners, replacing a Tomorrow card that has been
                 fed a hardcoded [] since it was written. Tonight is the hero
                 above; this answers "and what about the rest of the week", and
                 calls out the unplanned days, which is the one thing neither
                 the hero nor the lanes can say. */
              mealRows={mealRows}
              glanceRows={glanceRows}
              question={null}
              pinnedLists={pinnedListIds.map((id) => {
                const list = familyLists.find((l) => l.id === id);
                if (!list) return null;
                return (
                  <WallV2PinnedList
                    key={id}
                    listId={id}
                    title={list.title}
                    refreshKey={listRefreshKey}
                    onOpen={() => { setSheetListId(id); setShowListSheet(true); }}
                  />
                );
              })}
            />
          </div>
        </div>

        <WallV2Strip
          due={dueRows}
          comingUp={comingUpRows}
          onCall={() => setShowPhone(true)}
        />
      </div>

      {/* The flash lost its home when the family-strip band went. It stays the
          wall's only confirmation that a tap did anything, so it now floats
          above the whole surface rather than riding a row that may not exist.
          z-[60] still clears the sheets (all `z-50`). */}
      {flashMessage && (
        <div
          role="status"
          className="animate-fade-in-up fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 px-4 py-2 rounded-full bg-stone-800/90 dark:bg-stone-200/90 text-white dark:text-stone-900 text-[0.85rem] font-bold shadow-lg backdrop-blur-md whitespace-nowrap"
        >
          {flashMessage}
        </div>
      )}
      </div>

      {showUtilities && (
        <WallV2UtilitySheet
          hideRoutines={hideRoutines}
          isDark={isDark}
          refreshing={wallData.loading}
          onGuestMode={() => { setShowUtilities(false); setGuestMode(true); }}
          // Close the sheet, like Guest mode does. Every scrap of evidence that
          // a refresh happened — the "Refreshing…" flash and the rail's
          // "Updated HH:MM" — sits UNDER this sheet's `fixed inset-0 z-50`, so
          // leaving it open meant tapping Refresh produced no visible change
          // whatsoever. It ran; you just couldn't tell. Theme and hide-routines
          // get away with staying open because they repaint the wall behind it.
          onRefresh={() => {
            setShowUtilities(false);
            void wallData.refetch();
            showFlash('Refreshing…');
          }}
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

      {viewerPayload && (
        <WallRecipeViewer
          url={viewerPayload.url}
          content={viewerPayload.content}
          mealName={viewerPayload.mealName}
          mealIcon={viewerPayload.mealIcon}
          dayLabel={
            navDays.length > 1
              ? mealDayLabel(selectedPlannedDay?.date ?? anchorDate, viewerSlot, todayKey)
              : undefined
          }
          prevDay={toNeighbor(prevNavDay)}
          nextDay={toNeighbor(nextNavDay)}
          onPrevDay={goToDay(prevNavDay)}
          onNextDay={goToDay(nextNavDay)}
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
          onClose={() => { setShowListSheet(false); setListRefreshKey((k) => k + 1); }}
        />
      )}

      {/* Caller-ID takeover — full-screen when the kid phone has a live call. */}
      <CallerIdTakeover />
    </div>
  );
}
