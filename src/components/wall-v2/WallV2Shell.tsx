import { createReviewedWriter, applyReviewedChange } from '@/lib/canvas/reviewedChange'
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
import { Sun, Moon, Plus, ClipboardList, Settings, StickyNote, Users } from 'lucide-react';
import { useActionableInstances } from '@/hooks/useActionableInstances';
import { useBuildAutoReload } from '@/hooks/useBuildAutoReload';
import { WallV2GuestScreen } from './WallV2GuestScreen';
import { WallV2ItemActionSheet, type PushPreset } from './WallV2ItemActionSheet';
import {
  readHideRoutines,
  writeHideRoutines,
  onHideRoutinesChange,
} from '@/lib/hideRoutinesSignal';
import { WallV2StaleBanner } from './WallV2StaleBanner';
import { computeFreshness } from './wallFreshness';
import { useDailyDiscussionPrompt } from '@/hooks/useDailyDiscussionPrompt';
import { KidDayView } from './KidDayView';
import { WallV2WhoSheet } from './WallV2WhoSheet';
import { WallV2QuestionSheet } from './WallV2QuestionSheet';
import { openHandoffQuestions, type HandoffQuestion } from './wallQuestions';
import { assignWallEvent } from '@/lib/wall/eventAssign';
import { readReadingTimer, readingTimerKey, elapsedMinutes, isTimerRunning } from '@/lib/wall/readingScreenTime';
import { localYmd, useCadenceConfig } from '@/lib/cadence/config';
import { useHouseholdWeekStart } from '@/hooks/useHouseholdWeekStart';
import { pushTargets } from '@/lib/wall/wallDates';
import { wallQuickAdd, type WallQuickAddData } from '@/lib/wall/wallQuickAdd';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { plannedWeekStart } from '@/lib/canvas/applyChangeSet';
import { useDisplayHeartbeat } from '@/lib/display/useDisplayHeartbeat';
import { myDisplay } from '@/lib/display/pairing';
import { withSteps, type ChangeSet } from '@/lib/canvas/changeCard';
import type { WallTalkDeps, WallApplyResult } from './activity/useWallTalk';
import type { WallTalkWeek } from './activity/WallTalk';

const safeStorage = (): Storage | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};
import { emptySections } from '@/lib/today/types';
import type { TimelineItem } from '@/types/timeline';
import type { FamilyMember } from '@/types/family';
import { adaptComingUpRows } from './wallStrip';
import { WallV2ListSheetContainer } from './WallV2ListSheetContainer';
import { useLists } from '@/hooks/useLists';
import { useListItems } from '@/hooks/useListItems';
import { scopeForDomain } from '@/lib/scope';
import {
  readPinnedLists,
  togglePinnedList,
  onPinnedListsChange,
} from '@/lib/wallPinnedLists';
import type { WallDockActionId } from './WallV2FamilyStrip';
import { WallV2UtilitySheet } from './WallV2UtilitySheet';
import { CallerIdTakeover } from './CallerIdTakeover';
import { adaptTimelineSections, adaptWeather } from './wallV2Adapter';
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
import { WallRecipeViewer } from '@/components/wall/WallRecipeViewer';
import { WallV2RecipeSheet } from './WallV2RecipeSheet';
import { useWallRecipeIndex } from '@/hooks/useWallRecipeIndex';
import { useRecipe } from '@/hooks/useRecipe';
import { WallV2ScratchpadSheet } from './WallV2ScratchpadSheet';
import { useScratchpad } from '@/hooks/useScratchpad';
import { useDiscussionInbox } from '@/hooks/useDiscussionInbox';
import { useKidMath } from '@/hooks/useKidMath';
import { fetchEnergyPeriod, useHomeEnergy } from '@/hooks/useHomeEnergy';
import { openScratchpadRows, recentlySorted, type ScratchpadRow } from '@/lib/wall/scratchpad';
import { useFamilyDiscussionItems, type DiscussionItem } from '@/hooks/useFamilyDiscussionItems';
import { QuickCapture } from '@/components/layout/QuickCapture';
import { type MomentKid } from './moments/WallMoments';
import { KioskCanvas } from './activity/KioskCanvas';
import { useKioskActivity } from './activity/useKioskActivity';
import { supabaseGroceryIO } from './activity/groceryIO';
import type { WallVoice } from './activity/KioskTellSymphony';
import type { KioskV1Data } from './activity/KioskCanvas';
import { dayAnchors, heldScreen, kioskScreen, minutesOf, sceneChoices, type SceneHold } from '@/lib/wall/activity/kioskScreen';
import { nextCommitment } from '@/lib/wall/activity/kioskCompose';
import { addGroceries, addInboxTask, addScratch } from '@/lib/wall/voice/wallVoiceActions';
import { wallSnapshot } from '@/lib/wall/voice/wallSnapshot';
import type { KioskDinner } from './activity/KioskStages';
import { currentStage, servesFactor, DEFAULT_BASE_SERVES } from '@/lib/wall/activity/kioskActivity';
import { saveGroceryLines, type GroceryLine } from '@/lib/wall/activity/groceryProposal';
import { buildBedtimeGrid } from '@/lib/wall/activity/kioskRoutines';
import { isIngredientLine } from '@/lib/wall/activity/cookingModel';
import { wallMoment } from '@/lib/wall/wallMoment';
import { wallTodayRows, wallAnytimeRows, specialsWeek, checklistFor, afterSchoolRows, afterSchoolCollection, kidSchoolWork, type WallTodayRow, bagWithPapers } from '@/lib/wall/wallMomentsModel';
import { agendaDays, agendaDay, agendaWeekend, type AgendaRow } from '@/lib/wall/wallAgenda';
import { buildMemberDayModel, type KidRow } from '@/lib/wall/kidDayModel';
import { memberShape } from '@/lib/wall/memberPageModel';
import { useMemberInstanceHistory } from './useMemberInstanceHistory';
import { scaleIngredient } from '@/lib/wall/scaleIngredient';
import { findToBuyList } from '@/lib/lists/toBuy';
import { useAuth } from '@/hooks/useAuth';
import { AuthForm } from '@/components/AuthForm';
import { PairDisplayScreen } from '@/components/auth/PairDisplayScreen';
import { isDisplayUser, displaySetTaskDone } from '@/lib/display/displayWrites';
import { supabase } from '@/lib/supabase';
import { claimPaper, paperInBackpack, paperNotOurs } from '@/lib/wall/paperActions';
import type { WallV2TimelineEvent } from './types';
import { useWallTheme } from './wallThemeOverride';

function formatDate(d: Date): { weekday: string; fullDate: string } {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return { weekday, fullDate };
}


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
    () => ({ mealName, recipeUrl, recipeContent, recipe }),
    [mealName, recipeUrl, recipeContent, recipe],
  );
}

export function WallV2Shell() {
  const { user, loading: authLoading } = useAuth();
  // The household's week start (Saturday for us). The kiosk opens only the
  // wall, never the app shell that copies it into this browser, so the wall
  // reads it itself; without this every week here counted from Sunday.
  useHouseholdWeekStart();
  const { config: { weekStartsOn } } = useCadenceConfig();

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
  // A paired display says it is alive; a person's session sends nothing.
  useDisplayHeartbeat();
  // A kid's tablet opened on the wall's address goes to its kid's screen.
  useEffect(() => {
    if (!isDisplayUser(user)) return;
    let live = true;
    void myDisplay().then((d) => { if (live && d?.familyMemberId) window.location.replace('/kid'); });
    return () => { live = false; };
  }, [user]);
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

  // ─── The kiosk's activity (conversational canvas, 2026-10-10) ───
  // One stage at a time inside a stable frame: home, dinner, groceries,
  // cooking, leaving, bedtime, calling, a person's page, a recipe. Cooking
  // and timers are held across stage changes and persisted for the day.
  const todayKey = useMemo(() => localDateKey(now), [now]);
  const kiosk = useKioskActivity(todayKey);
  const { dispatch: kioskDispatch } = kiosk;
  const stage = currentStage(kiosk.state);

  // ─── Overlay state ───
  // Guest mode: a privacy cover for when company's over — hides all content
  // behind a full-screen ambient clock/weather screen.
  const [guestMode, setGuestMode] = useState(false);
  const [wantsPersonSignIn, setWantsPersonSignIn] = useState(false);
  // The recipe viewer is the kiosk's 'recipe' stage now.
  const recipeViewerMeal = (stage.kind === 'recipe' && stage.source === 'dinner' ? 'dinner' : null) as 'dinner' | 'breakfast' | null;
  const setRecipeViewerMeal = useCallback((meal: 'dinner' | null) => {
    kioskDispatch(meal ? { type: 'OPEN', stage: { kind: 'recipe', source: 'dinner' } } : { type: 'BACK' });
  }, [kioskDispatch]);
  // Cooking something that was never on the plan: the picker, and the one
  // recipe it hands over (Scott, 2026-09-07). The index stays loaded while the
  // viewer is open so Back lands on the shelf instantly instead of re-querying.
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [recipeQuery, setRecipeQuery] = useState('');
  const [pickedRecipeId, setPickedRecipeId] = useState<string | null>(null);
  const pickedOpen = stage.kind === 'recipe' && stage.source === 'picked';
  const recipeIndex = useWallRecipeIndex(showRecipePicker || pickedOpen);
  const { recipe: pickedRecipe } = useRecipe(pickedOpen ? pickedRecipeId : null);
  // A member's full-screen day page is the kiosk's 'person' stage. Wrapped
  // handlers below (useCallback) so a parent re-render doesn't recreate
  // onClose/onTapMember and restart KidDayView's idle-close timer.
  const kidViewMember: FamilyMember | null = stage.kind === 'person'
    ? wallData.familyMembers.find((m) => m.id === stage.memberId) ?? null
    : null;
  // "Who's on?" — the sheet that answers an unclaimed handoff with a face.
  const [showWhoSheet, setShowWhoSheet] = useState(false);
  // Which dinner day the wall is looking at — shared by the face's dinner card
  // and the recipe viewer, so tapping a paged card opens that same day.
  // null = today.
  const [mealDayKey, setMealDayKey] = useState<string | null>(null);
  // Tonight's servings live in the kiosk state (reset with the day). Recipes
  // don't store a yield, so the base is DEFAULT_BASE_SERVES and the wall
  // says so beside the stepper.
  const dinnerServes = kiosk.state.serves ?? DEFAULT_BASE_SERVES;
  const dinnerFactor = servesFactor(dinnerServes, DEFAULT_BASE_SERVES);
  // The scratchpad sheet, opened at the input or (from the face) at one note.
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [scratchpadFocus, setScratchpadFocus] = useState<string | null>(null);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [showListSheet, setShowListSheet] = useState(false);
  const [sheetListId, setSheetListId] = useState<string | null>(null);
  const [pinnedListIds, setPinnedListIds] = useState<string[]>(() => readPinnedLists());
  // Bumped whenever the list sheet closes, so pinned cards refetch and pick
  // up edits made in the sheet — the sheet and each card own separate
  // useListItems instances with no realtime channel or write bus between
  // them.

  // Pins are wall-local; subscribe so a pin made in the sheet updates the face.
  useEffect(() => onPinnedListsChange(setPinnedListIds), []);

  const { lists } = useLists();
  // The wall is a shared kitchen display — personal lists never appear on it.
  const familyLists = useMemo(
    () => lists.filter((l) => l.visibility === 'family'),
    [lists],
  );

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
    // Tonight's dinner, at the wall's ×2 / ×3 (Scott, 2026-10-04: the wall
    // showed the base recipe while the plan called for it tripled). A stored
    // recipe opens in place of its link so the scaled amounts are what shows.
    const scaled = recipeViewerMeal === 'dinner' && dinnerFactor !== 1 && viewerMeal.recipeContent
      ? { ...viewerMeal.recipeContent, title: `${viewerMeal.recipeContent.title} · for ${dinnerServes}`, ingredients: viewerMeal.recipeContent.ingredients.map((l) => scaleIngredient(l, dinnerFactor)) }
      : null;
    if (scaled) return { url: undefined, content: scaled, mealName: viewerMeal.mealName, mealIcon: viewerEvent ? getMealIcon(viewerEvent.title) : '🍽️' };
    return {
      url: viewerMeal.recipeUrl ?? undefined,
      content: !viewerMeal.recipeUrl ? (viewerMeal.recipeContent ?? undefined) : undefined,
      mealName: viewerMeal.mealName,
      mealIcon: viewerEvent ? getMealIcon(viewerEvent.title) : '🍽️',
    };
  }, [recipeViewerMeal, selectedPlannedDay, viewerMeal, viewerEvent, dinnerFactor, dinnerServes]);

  // The recipe stage: tonight's (or a paged day's) recipe, or one picked from
  // the shelf. Rendered inside the kiosk stage so the frame stays put.
  const recipePage = useMemo(() => {
    if (stage.kind !== 'recipe') return null;
    if (stage.source === 'picked') {
      if (!pickedRecipe) return <div className="kc-empty"><p>Loading the recipe…</p></div>;
      return (
        <WallRecipeViewer
          content={{ title: pickedRecipe.title, ingredients: pickedRecipe.ingredients, instructions: pickedRecipe.instructions }}
          url={pickedRecipe.ingredients.length === 0 && pickedRecipe.instructions.length === 0 ? pickedRecipe.sourceUrl : undefined}
          mealName={pickedRecipe.title}
          mealIcon={getMealIcon(pickedRecipe.title)}
          onClose={() => { kioskDispatch({ type: 'BACK' }); setPickedRecipeId(null); setShowRecipePicker(true); }}
        />
      );
    }
    if (!viewerPayload) return <div className="kc-empty"><p>No recipe saved for this meal.</p></div>;
    return (
      <WallRecipeViewer
        url={viewerPayload.url}
        content={viewerPayload.content}
        mealName={viewerPayload.mealName}
        mealIcon={viewerPayload.mealIcon}
        dayLabel={navDays.length > 1 ? mealDayLabel(selectedPlannedDay?.date ?? anchorDate, viewerSlot, todayKey) : undefined}
        prevDay={toNeighbor(prevNavDay)}
        nextDay={toNeighbor(nextNavDay)}
        onPrevDay={goToDay(prevNavDay)}
        onNextDay={goToDay(nextNavDay)}
        onClose={() => setRecipeViewerMeal(null)}
      />
    );
  }, [stage, pickedRecipe, viewerPayload, navDays.length, selectedPlannedDay, anchorDate, viewerSlot, todayKey, toNeighbor, prevNavDay, nextNavDay, goToDay, kioskDispatch, setRecipeViewerMeal]);
  const recipeTitle = stage.kind === 'recipe'
    ? (stage.source === 'picked' ? pickedRecipe?.title ?? null : viewerPayload?.mealName ?? null)
    : null;

  // Tonight's question — a deterministic daily rotation, dismissable, and the
  // one thing on this wall that is not a schedule.
  const {
    prompt: discussionPrompt,
    dismissed: discussionDismissed,
    dismiss: dismissDiscussion,
    undismiss: undismissDiscussion,
    next: nextDiscussion,
  } = useDailyDiscussionPrompt();
  // A tap on the strip's question OPENS it. It used to dismiss it — one
  // touch and tonight's question was gone for the day (Scott, 2026-09-03).
  const [showQuestionSheet, setShowQuestionSheet] = useState(false);

  // ─── Bottom strip ───
  // Three cheap projections over data the wall already holds: no new queries,
  // which matters on a display that polls all day (see the egress incident).
  const comingUpRows = useMemo(
    // The specials are the Specials card's; Coming up is everything else.
    () => adaptComingUpRows(wallData.days, wallData.familyMembers, undefined, undefined, true),
    [wallData.days, wallData.familyMembers],
  );

  const handleMarkDiscussed = useCallback(async (item: DiscussionItem) => {
    if (item.kind === 'task') {
      await updateTask(item.id, { needsDiscussion: false, discussionNote: undefined });
    } else {
      await unflagEvent(item.id);
    }
  }, [updateTask, unflagEvent]);

  // The scratchpad (Scott, 2026-10-07): notes jotted here or posted from the
  // app, plus what was flagged "Bring up" — it replaced the For Discussion
  // overlay and took the Specials box's place on the face.
  const scratchpad = useScratchpad(user?.id ?? null);
  const scratchRows = useMemo(() => openScratchpadRows(
    scratchpad.notes,
    discussionItems.map((d) => ({ kind: d.kind, id: d.id, title: d.title, note: d.note ?? null })),
  ), [scratchpad.notes, discussionItems]);
  const scratchSorted = useMemo(() => recentlySorted(scratchpad.notes, now), [scratchpad.notes, now]);
  // A flagged task being talked over in the app says whose turn it is
  // (discussions v2, 2026-10-14). Only rows already on the wall are marked.
  const { rows: discussionRows } = useDiscussionInbox();
  const turnOf = useMemo(() => new Map(discussionRows
    .filter((r) => r.entityType === 'task' && r.waitingOn.length > 0 && r.state.kind !== 'settled')
    .map((r) => [r.entityId, `waiting on ${r.waitingOn.join(' and ')}`])), [discussionRows]);
  const memberName = useCallback(
    (id: string) => wallData.familyMembers.find((m) => m.id === id)?.name,
    [wallData.familyMembers],
  );
  const handleScratchDone = useCallback(async (row: ScratchpadRow, resolution: string) => {
    if (row.source === 'note') {
      if (!(await scratchpad.markDone(row.id, resolution))) showFlash('Could not save — try again');
      return;
    }
    const item = discussionItems.find((d) => d.kind === row.source && d.id === row.id);
    if (item) await handleMarkDiscussed(item);
  }, [scratchpad, discussionItems, handleMarkDiscussed, showFlash]);
  const handleScratchSend = useCallback(async (row: ScratchpadRow, memberId: string) => {
    const ok = await scratchpad.sendToInbox({ id: row.id, body: row.text }, memberId);
    const name = memberName(memberId);
    showFlash(!ok ? 'Could not send — try again' : name ? `Sent to ${name}’s Inbox` : 'Sent to the Inbox');
  }, [scratchpad, memberName, showFlash]);

  // Tap-to-complete from the wall. Timeline ids are prefixed (task-/routine-/
  // event-); tasks toggle their completed flag, routines/events write a
  // completed (or undone) actionable_instance for today. Refetch to refresh.
  const { skip, markDone, undoDone } = useActionableInstances();
  const [actionSheetItem, setActionSheetItem] = useState<WallV2TimelineEvent | null>(null);
  const handleToggleComplete = useCallback((id: string, completed: boolean, on: Date = now) => {
    void (async () => {
      if (id.startsWith('task-')) {
        // A paired display ticks a task through the server (displayWrites.ts).
        if (isDisplayUser(user)) {
          if (!(await displaySetTaskDone(id.slice('task-'.length), completed))) showFlash('Could not save — try again');
        } else {
          await updateTask(id.slice('task-'.length), { completed });
        }
      } else if (id.startsWith('routine-')) {
        const rid = id.slice('routine-'.length);
        await (completed ? markDone('routine', rid, on) : undoDone('routine', rid, on));
      } else if (id.startsWith('event-')) {
        const eid = id.slice('event-'.length);
        await (completed ? markDone('calendar_event', eid, on) : undoDone('calendar_event', eid, on));
      }
      await wallData.refetch();
    })();
  }, [updateTask, markDone, undoDone, now, wallData, user, showFlash]);

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
      scope: scopeForDomain('family', [], null),
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
      case 'discuss': setScratchpadFocus(null); setShowScratchpad(true); break;
      case 'list': setSheetListId(null); setShowListSheet(true); break;
      case 'phone': kioskDispatch({ type: 'OPEN', stage: { kind: 'calling' } }); break;
      case 'utilities': setShowUtilities(true); break;
    }
  }, [kioskDispatch]);

  // ── Unprompted tier ────────────────────────────────────────────────────────
  // The wall does NOT pass a facts resolver: useWallData narrows its task columns
  // and doesn't carry defer_count/waiting_since, so the engine's stored urgency
  // hint is the honest input here. It fails closed — a null hint reads as 0 and
  // never interrupts.

  // A bar on the board opens the same action sheet the lane did — tapping a
  // commitment should do one thing on this wall, whatever is drawing it.
  // The label is belt-and-braces: `timeline`'s ids should always match the
  // board's, but if that drifts again, this recovers the title from the same
  // board data already in scope so the tap flashes something instead of
  // dead-ending silently.
  // The open questions: handoffs nobody has claimed, today (still ahead) and
  // tomorrow (from the evening). Read off the days the wall already holds.
  const handoffQuestions = useMemo(
    () => openHandoffQuestions(wallData.days, wallData.familyMembers, now),
    [wallData.days, wallData.familyMembers, now],
  );
  const adults = useMemo(
    () => wallData.familyMembers.filter((m) => m.role_label === 'parent' || m.is_full_user),
    [wallData.familyMembers],
  );
  const handoffAsk = useMemo(() => {
    const q = handoffQuestions[0];
    if (!q) return null;
    return { lead: `${q.when === 'today' ? 'Today' : 'Tomorrow'} · ${q.time}`, prompt: q.prompt, more: handoffQuestions.length - 1 };
  }, [handoffQuestions]);
  // School papers (spec 2026-10-20): one write, then the wall reloads.
  const handlePaper = useCallback((write: Promise<boolean>) => {
    void (async () => {
      if (!(await write)) showFlash('Couldn’t save — try again');
      await wallData.refetch();
    })();
  }, [showFlash, wallData]);

  const handlePickWho = useCallback((q: HandoffQuestion, member: FamilyMember) => {
    if (!user) return;
    void (async () => {
      const err = await assignWallEvent(user.id, q.eventKey, member.id);
      if (err) { showFlash('Could not save — try again'); return; }
      showFlash(`${member.name} · ${q.title}`);
      await wallData.refetch();
    })();
    // One question answered closes the sheet when it was the last one; the
    // list re-derives from the refetch, so a second question stays up.
    if (handoffQuestions.length <= 1) setShowWhoSheet(false);
  }, [user, showFlash, wallData, handoffQuestions.length]);

  // Portrait tap opens the member's full-screen day page. Both handlers are
  // memoized: KidDayView's idle-close effect depends on `onClose`, and an
  // unstable identity here would restart that timer on every Shell re-render.
  const handleTapGanttMember = useCallback((id: string) => {
    if (wallData.familyMembers.some((fm) => fm.id === id)) kioskDispatch({ type: 'OPEN', stage: { kind: 'person', memberId: id } });
  }, [wallData.familyMembers, kioskDispatch]);

  const handleCloseKidView = useCallback(() => {
    kioskDispatch({ type: 'BACK' });
    void wallData.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallData.refetch, kioskDispatch]);

  // The face's dinner card opens whatever day it's currently showing. A paged
  // day always has a body or a source URL (buildMealDayRecipes drops the ones
  // that don't), so it can open without the tonight-only recipe check.
  // Tonight's dinner opens the kiosk's dinner activity (servings, what's
  // missing, cooking); a paged day opens its recipe.
  const handleTapDinnerCard = useCallback(() => {
    if (selectedDinnerDay) { setRecipeViewerMeal('dinner'); return; }
    if (dinnerEvent) kioskDispatch({ type: 'OPEN', stage: { kind: 'dinner' } });
    else showFlash(`Tonight: ${dinner.mealName}`);
  }, [selectedDinnerDay, dinnerEvent, dinner, showFlash, setRecipeViewerMeal, kioskDispatch]);

  // ─── The wall, by time of day (Scott, 2026-10-04) ───
  // Everything below projects data the wall already holds; no new queries.
  const { history: instanceHistory, refresh: refreshHistory } = useMemberInstanceHistory();
  const kids = useMemo(() => wallData.familyMembers.filter((m) => memberShape(m) === 'kid'), [wallData.familyMembers]);
  // Math of the day: each kid's problem, made the first time the wall loads that day.
  const mathFailed = useCallback(() => showFlash('That answer didn’t save'), [showFlash]);
  const kidMath = useKidMath(user?.id ?? null, kids, localYmd(now), mathFailed);
  // The house's power, from the home-energy bridge on the wall Pi (null elsewhere).
  const homeEnergy = useHomeEnergy();
  const todayItems = useMemo(() => todayData?.items ?? emptySections<TimelineItem>(), [todayData]);
  const tomorrowData = useMemo(() => wallData.days.find((d) => !d.isToday && d.date > now) ?? wallData.days[1], [wallData.days, now]);
  const specials = useMemo(() => specialsWeek(wallData.days, kids, now), [wallData.days, kids, now]);
  const schoolToday = useMemo(
    () => specials.some((s) => s.isToday) || Object.values(todayItems).flat().some((i) => /^school\b/i.test(i.title)),
    [specials, todayItems],
  );
  const moment = useMemo(
    () => wallMoment(now, { schoolDay: schoolToday, dinnerAt: dinnerStartDate ? { h: dinnerStartDate.getHours(), m: dinnerStartDate.getMinutes() } : undefined }),
    [now, schoolToday, dinnerStartDate],
  );
  const todayRows = useMemo(() => wallTodayRows(todayItems, wallData.familyMembers, now), [todayItems, wallData.familyMembers, now]);
  const kidModels = useMemo(() => kids.map((member) => ({
    member,
    model: buildMemberDayModel({
      member, date: now, now, routines: wallData.routines, todayItems, tomorrowItems: tomorrowData?.items,
      members: wallData.familyMembers, neededTasks: wallData.neededTasks, homeworkTasks: wallData.homeworkTasks, paperTasks: wallData.paperTasks,
      notices: wallData.notices, history: instanceHistory,
    }),
  })), [kids, now, wallData.routines, todayItems, tomorrowData, wallData.familyMembers, wallData.neededTasks, wallData.homeworkTasks, wallData.paperTasks, wallData.notices, instanceHistory]);
  const kidsNow: MomentKid[] = useMemo(() => kidModels.map(({ member, model }) => {
    const evening = moment === 'evening';
    return {
      member,
      special: evening ? (model.school?.tomorrowSpecial ?? null) : (model.school?.special ?? null),
      hint: evening ? null : (model.school?.hint ?? null),
      needed: model.needed.filter((n) => n.tomorrow === evening).map((n) => n.title),
      homeworkDue: model.homework.filter((h) => h.due === (evening ? 'Tomorrow' : 'Today') || h.late).map((h) => h.title),
      afterSchool: moment === 'after' ? afterSchoolRows(model) : [],
    };
  }), [kidModels, moment]);
  // In the afternoon, homework and practice are After school's — a timed
  // "math time" leaves Today's list rather than sitting in both.
  const todayForMoment = useMemo(() => {
    if (moment !== 'after') return todayRows
    const taken = new Set(kidsNow.flatMap((k) => k.afterSchool.map((r) => `${r.entityType}-${r.id}`)))
    return todayRows.filter((r) => !taken.has(r.id))
  }, [moment, todayRows, kidsNow]);
  // Only the evening lists rows in the centre (tomorrow's morning): in the
  // morning and afternoon those rows are Today's, and the wall says each
  // thing once (2026-10-07).
  const focusRows = useMemo(() => {
    if (moment === 'evening' && tomorrowData) {
      const tomorrowStart = new Date(tomorrowData.date); tomorrowStart.setHours(0, 0, 0, 0);
      return wallTodayRows(tomorrowData.items, wallData.familyMembers, tomorrowStart).filter((r) => r.time.endsWith('a')).slice(0, 4);
    }
    return [];
  }, [moment, tomorrowData, wallData.familyMembers]);
  const tomorrowKey = useMemo(() => (tomorrowData ? localDateKey(tomorrowData.date) : null), [tomorrowData]);
  const nextMeal = useMemo(() => {
    if (moment === 'evening') {
      const t = dinnerDays.find((d) => d.dateKey === tomorrowKey)
      // Tomorrow's planned dinner always has a body or a source URL
      // (buildMealDayRecipes drops the ones that don't), so it opens.
      return t ? { label: 'Dinner tomorrow', title: t.title, imageUrl: t.imageUrl ?? null, onOpen: () => { setMealDayKey(t.dateKey); setRecipeViewerMeal('dinner'); } } : null
    }
    if (moment === 'dinner' || !dinnerEvent) return null;
    return { label: dinnerStartDate ? `Dinner at ${dinnerStartDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Dinner tonight', title: dinner.mealName, imageUrl: dinner.recipe?.imageUrl ?? null, onOpen: handleTapDinnerCard };
  }, [moment, dinnerDays, tomorrowKey, dinnerEvent, dinnerStartDate, dinner, handleTapDinnerCard, setRecipeViewerMeal]);
  // The family's grocery list: "Groceries" by name, else the To-buy list.
  const groceryList = useMemo(
    () => familyLists.find((l) => l.title.trim().toLowerCase() === 'groceries') ?? findToBuyList(familyLists) ?? null,
    [familyLists],
  );
  // "Add what's missing" is a per-line proposal now (KioskCanvas): each line
  // saves on its own, Retry touches only failures, and lines already open on
  // the list are never inserted twice (saveGroceryLines).
  const saveGroceries = useCallback(async (lines: GroceryLine[]) => {
    if (!user || !groceryList) return lines.map((l) => ({ key: l.key, ok: false }));
    return saveGroceryLines(lines, supabaseGroceryIO(groceryList.id, user.id));
  }, [user, groceryList]);
  const kioskDinner: KioskDinner | null = useMemo(() => {
    if (!dinnerEvent) return null;
    const notes = dinnerEvent.mealNotes?.trim() || null;
    const r = dinner.recipe;
    // Cooking mode reads the same content the recipe viewer shows: the stored
    // recipe when it has steps, else the recipe's page.
    const source = r && r.instructions.length > 0 ? { recipeId: r.id } : dinner.recipeUrl ? { url: dinner.recipeUrl } : null;
    return {
      key: source?.recipeId ?? (source?.url ? `url:${source.url}` : null),
      title: dinner.mealName,
      imageUrl: r?.imageUrl ?? null,
      timeLabel: dinnerStartDate ? `Dinner at ${dinnerStartDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Dinner tonight',
      at: dinnerStartDate ? dinnerStartDate.getTime() : null,
      minutes: r?.prepMinutes ?? null,
      cue: notes ? notes.split(/(?<=[.!])\s/)[0] : null,
      ingredients: (r?.ingredients ?? []).filter(isIngredientLine),
      source,
      hasRecipe: !!(dinner.recipeUrl || dinner.recipeContent),
      baseServes: DEFAULT_BASE_SERVES,
    };
  }, [dinnerEvent, dinner, dinnerStartDate]);
  const checklists = useMemo(() => kidModels.map(({ member, model }) => {
    // A reading timer left running on a kid's page shows on their card, so a
    // parent sees it from the kitchen and the kid can find it again.
    const timer = readReadingTimer(safeStorage(), readingTimerKey(member.id, localYmd(now)));
    const live = timer ? `${isTimerRunning(timer) ? 'Reading' : 'Reading paused'} · ${elapsedMinutes(timer, now)} min` : null;
    // In the afternoon, homework and practice are After school's; the card
    // keeps the rest so nothing is listed twice.
    const list = checklistFor(model, moment)
    const shown = new Set(moment === 'after' ? afterSchoolRows(model).map((r) => `${r.entityType}:${r.id}`) : [])
    const rows = list?.rows.filter((r) => !shown.has(`${r.entityType}:${r.id}`)) ?? []
    return { member, list: list && rows.length ? { ...list, rows } : null, live };
  }), [kidModels, moment, now]);
  // Tonight's bedtime: each kid's evening routine, steps × people.
  const bedtimeGrid = useMemo(
    // Tonight's bedtime is the routine that starts at 7pm or later; the
    // evening band also holds Home from school (5:45), which isn't bedtime.
    () => buildBedtimeGrid(kidModels.map(({ member, model }) => {
      const bed = model.collections.find((c) => (minutesOf(c.timeOfDay) ?? 0) >= 19 * 60 && c.rows.length > 0);
      return { member, list: bed ? { title: bed.title, rows: bed.rows } : checklistFor(model, 'evening') };
    })),
    [kidModels],
  );
  // Wall v1 (2026-10-13): the Home screen that leads, chosen from the
  // household's own routines (each kid's morning, home-from-school and
  // bedtime collections) and tonight's dinner time — no new queries.
  // Local preview only: /wall-v2?at=6:58 shows the screen that leads at that
  // time today, so each one can be checked without waiting for it.
  const previewAt = useMemo(() => {
    if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return null;
    const m = new URLSearchParams(window.location.search).get('at')?.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date(now); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }, [now]);
  // A scene picked by hand at the wall (Scott, 2026-10-20: a late dinner
  // needs the dinner scene back). It leads until the clock's own scene
  // changes or 30 minutes pass; heldScreen decides, this only remembers.
  const [sceneHold, setSceneHold] = useState<SceneHold | null>(null);
  const kioskV1: KioskV1Data = useMemo(() => {
    const found = dayAnchors(kidModels.flatMap(({ model }) => model.collections), dinnerStartDate);
    // Local preview: ?weekend=1 draws today as a day with no school morning.
    const previewWeekend = previewAt != null && new URLSearchParams(window.location.search).get('weekend') === '1';
    const anchors = previewWeekend ? { ...found, morning: null, home: null } : found;
    const clockPick = kioskScreen(previewAt ?? now, anchors);
    const { pick, held } = heldScreen(clockPick, sceneHold, previewAt ?? now);
    const scenes = {
      choices: sceneChoices(anchors), clock: clockPick.screen, held,
      onPick: (screen: typeof clockPick.screen) => setSceneHold(
        screen === clockPick.screen ? null : { screen, at: (previewAt ?? new Date()).getTime(), clockScreen: clockPick.screen },
      ),
    };
    const hhmm = (min: number) => `${Math.floor(min / 60) % 12 || 12}:${String(min % 60).padStart(2, '0')}`;
    const kids = kidModels.map(({ member, model }) => {
      const work = kidSchoolWork(model, previewAt ?? now);
      const homeRows = afterSchoolCollection(model)?.rows ?? [];
      return {
        member,
        special: model.school?.special ?? null,
        tomorrowSpecial: model.school?.tomorrowSpecial ?? null,
        // A paper a parent has, due today, rides in the bag line (spec 2026-10-20).
        bag: bagWithPapers(model.needed.filter((n) => !n.tomorrow).map((n) => n.title), model.papers),
        papers: model.papers.map((pp) => ({ id: pp.id, title: pp.title, due: pp.due, late: pp.late, heldByName: pp.heldBy ? memberName(pp.heldBy) ?? null : null, done: pp.done })),
        morning: model.collections.find((c) => (minutesOf(c.timeOfDay) ?? 24 * 60) < 11 * 60)?.rows ?? [],
        // After school is the home-from-school routine itself (its steps for
        // the day: folder, then math or reading), plus homework due. Not the
        // old name match, which pulled in "Bag packed: homework folder" from
        // the morning and "Own reading" from bedtime. The day's practice that
        // stands on its own (Puzzle Trail at 6:45, Scott 2026-10-29) joins it.
        after: [
          ...afterSchoolRows(model).filter((r) => r.entityType === 'task'),
          ...homeRows,
          ...work.today.map((w) => w.row).filter((r) => r.entityType === 'routine' && !homeRows.some((h) => h.id === r.id)),
        ],
        // School work, today and this week: the rest of the day's screens.
        work,
        };
    });
    // The day's landmarks come from the routines (the wall's day list leaves
    // most-days routines out by design, 2026-09-07), events from the calendar.
    const t = (previewAt ?? now).getHours() * 60 + (previewAt ?? now).getMinutes();
    const dinnerShort = dinnerEvent ? (dinner.mealName.split(/\s+with\s+/i)[0] || dinner.mealName) : null;
    const landmarks: { at: number; title: string }[] = [
      ...(anchors.morning ? [{ at: anchors.morning.end, title: 'Out the door' }] : []),
      ...(anchors.home ? [{ at: anchors.home.start + 30, title: 'Home from school' }] : []),
      ...(dinnerEvent ? [{ at: anchors.dinner, title: dinnerShort ?? 'Dinner' }] : []),
      { at: anchors.bedtime.start, title: 'Bedtime' },
    ];
    const rowNext = nextCommitment(todayRows, previewAt ?? now);
    const rowAt = rowNext ? rowNext.at.getHours() * 60 + rowNext.at.getMinutes() : null;
    const upcoming = [...landmarks, ...(rowNext && rowAt != null ? [{ at: rowAt, title: rowNext.title }] : [])]
      .filter((l) => l.at > t).sort((a, b) => a.at - b.at);
    const restLine = upcoming.slice(0, 2).map((l) => `${l.title} at ${hhmm(l.at)}`).join(' · ') || 'Nothing else on the clock today';
    const next = upcoming[0] ? { time: hhmm(upcoming[0].at), title: upcoming[0].title } : null;
    const restSub = todayRows.filter((r) => !r.past && r.kind === 'event').slice(0, 2).map((r) => `${r.title} at ${r.time}`).join(' · ') || null;
    const tomorrowDay = new Date(now); tomorrowDay.setDate(tomorrowDay.getDate() + 1);
    const tomorrowWeekday = tomorrowDay.getDay() >= 1 && tomorrowDay.getDay() <= 5;
    const tomorrowStart = tomorrowData ? new Date(tomorrowData.date) : null;
    tomorrowStart?.setHours(0, 0, 0, 0);
    const weekdayName = tomorrowDay.toLocaleDateString('en-US', { weekday: 'long' });
    const anytime = wallAnytimeRows(todayItems, wallData.familyMembers).slice(0, 8);
    return {
      pick, scenes, anchors, kids, restLine, restSub, next,
      notes: scratchRows.filter((r) => r.kind === 'note').map((r) => ({ id: r.key, text: r.text, by: r.authorMemberId ? memberName(r.authorMemberId) ?? null : null })),
      talks: scratchRows.filter((r) => r.kind === 'talk').map((r) => {
        const turn = r.source === 'task' ? turnOf.get(r.id) : undefined;
        return { id: r.key, text: turn ? `${r.text} — ${turn}` : r.text, by: null };
      }),
      question: discussionPrompt || null,
      tomorrow: {
        label: weekdayName,
        outTheDoor: tomorrowWeekday && anchors.morning ? hhmm(anchors.morning.end) : null,
        specials: kids.filter((k) => k.tomorrowSpecial).map((k) => ({ member: k.member, text: k.tomorrowSpecial as string })),
      },
      weekend: {
        rows: todayRows,
        anytime,
        tomorrow: tomorrowData && tomorrowStart ? wallTodayRows(tomorrowData.items, wallData.familyMembers, tomorrowStart) : [],
        tomorrowLabel: weekdayName,
      },
      onNotes: () => { setScratchpadFocus(null); setShowScratchpad(true); },
      at: previewAt ?? undefined,
    };
  }, [kidModels, dinnerStartDate, now, previewAt, sceneHold, todayRows, dinnerEvent, dinner, tomorrowData, todayItems, wallData.familyMembers, scratchRows, memberName, discussionPrompt, turnOf]);

  // ─── Talking with Symphony (Kitchen wall v2, stage 3) ───
  // The app's own task store (shared cache; the discussion items already
  // load it) for Approve: every op goes through applyChangeSet, the change
  // card's all-or-nothing apply with one Undo. Only family tasks may change
  // from the wall, and anything it adds is a family task.
  const reviewedWriter = useMemo(() => createReviewedWriter(), []);
  const { tasks: storeTasks, updateTask: storeUpdate, deleteTask: storeDelete, addTask: storeAdd } = useSupabaseTasks(reviewedWriter.client);
  const applyWallChanges = useCallback(async (set: ChangeSet): Promise<WallApplyResult> => {
    const byId = new Map(withSteps(storeTasks).map((t) => [t.id, t]));
    for (const op of set.ops) {
      const t = op.taskId ? byId.get(op.taskId) : undefined;
      if (t && t.context !== 'family') return { ok: false, reason: 'private', title: op.title };
    }
    const r = await applyReviewedChange(set, {
      tasks: storeTasks,
      updateTask: storeUpdate,
      deleteTask: storeDelete,
      addTask: (title, when, options) => storeAdd(title, undefined, undefined, when, { ...options, context: 'family' }),
      weekStart: plannedWeekStart(set, new Date(), weekStartsOn),
    }, reviewedWriter);
    if (!r.ok) return r;
    void wallData.refetch();
    return { ...r, undo: async () => { const ok = await r.undo(); void wallData.refetch(); return ok; } };
  }, [reviewedWriter, storeTasks, storeUpdate, storeDelete, storeAdd, wallData, weekStartsOn]);
  // A capture with a parsed day, time or person keeps them — the sheet showed
  // the day ("→ Sat, Oct 24") before Add, so the task must land there.
  const handleQuickCaptureAddRich = useCallback(async (data: WallQuickAddData) => {
    const add = wallQuickAdd(data, new Date());
    const id = await storeAdd(add.title, undefined, undefined, add.when, add.options);
    if (!id) { showFlash('Save failed — try again'); return; }
    showFlash(add.flash);
    wallData.refetch();
  }, [storeAdd, showFlash, wallData]);

  const wallAgent: WallTalkDeps = useMemo(
    () => ({ applyChanges: applyWallChanges, weekStartsOn }),
    [applyWallChanges, weekStartsOn],
  );
  // The family's next seven days (useWallData's own, family-only) for the
  // conversation's pictures, and what the wall knows of a task a card names.
  const talkWeek: WallTalkWeek = useMemo(() => {
    const byId = new Map(withSteps(storeTasks).filter((t) => t.context === 'family').map((t) => [t.id, t]));
    const nameOf = (id: string) => wallData.familyMembers.find((m) => m.id === id)?.name ?? null;
    return {
      days: wallData.days.map((d) => {
        const start = new Date(d.date);
        start.setHours(0, 0, 0, 0);
        return { date: start, rows: wallTodayRows(d.items, wallData.familyMembers, d.isToday ? now : start) };
      }),
      task: (id) => {
        const t = byId.get(id);
        if (!t) return null;
        const who = (t.assignedToAll?.length ? t.assignedToAll : t.assignedTo ? [t.assignedTo] : []).map(nameOf).filter((n): n is string => !!n);
        return { title: t.title, at: t.scheduledFor ?? null, allDay: !!t.isAllDay, who };
      },
    };
  }, [reviewedWriter, storeTasks, wallData.days, wallData.familyMembers, now]);

  // Sentences said to the wall (the Pi's listener, or typed into Tell
  // Symphony): what it may save, each with Undo, and what it knows — only
  // what this screen already shows (household layer, 2026-10-13).
  const wallVoice: WallVoice | undefined = useMemo(() => {
    if (!user) return undefined;
    const nameOf = (id: string) => wallData.familyMembers.find((m) => m.id === id)?.name ?? null;
    const asRow = (r: WallTodayRow) => ({ time: r.time, end: r.end, title: r.title, who: r.owners.map(nameOf).filter((n): n is string => !!n), past: r.past });
    return {
      save: async (c) => {
        if (c.kind === 'groceries') {
          if (!groceryList) return { said: 'There’s no family grocery list yet.' };
          return addGroceries(groceryList.id, groceryList.title, user.id, c.items);
        }
        if (c.kind === 'inbox') return addInboxTask(user.id, c.text);
        const r = await addScratch(user.id, c.text, c.kind);
        void scratchpad.reload();
        return r.undo ? { ...r, undo: async () => { const ok = await r.undo!(); void scratchpad.reload(); return ok; } } : r;
      },
      snapshot: () => {
        const tomorrowStart = tomorrowData ? new Date(tomorrowData.date) : null;
        tomorrowStart?.setHours(0, 0, 0, 0);
        return wallSnapshot({
          now: new Date(),
          weather: liveWeather ? { temp: weatherData.temp, condition: weatherData.condition } : null,
          today: todayRows.map(asRow),
          tomorrow: tomorrowData && tomorrowStart ? wallTodayRows(tomorrowData.items, wallData.familyMembers, tomorrowStart).map(asRow) : undefined,
          kids: kidModels.map(({ member, model }) => ({
            name: member.name,
            special: model.school?.special ?? null,
            tomorrowSpecial: model.school?.tomorrowSpecial ?? null,
            pickup: model.school?.pickup ?? null,
            needed: model.needed.map((n) => ({ title: n.title, tomorrow: n.tomorrow })),
            homework: model.homework.map((h) => ({ title: h.title, due: h.due, late: h.late })),
            afterSchool: afterSchoolRows(model).map((r) => ({ title: r.title, time: r.timeOfDay, done: r.done })),
          })),
          dinnerTonight: dinnerEvent ? { title: dinner.mealName, at: dinnerStartDate ? dinnerStartDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null } : null,
          dinnerTomorrow: dinnerDays.find((d) => d.dateKey === tomorrowKey)?.title ?? null,
          comingUp: comingUpRows.map((r) => ({ dayLabel: r.dayLabel, summary: r.summary })),
          scratchpad: scratchRows.map((r) => ({ text: r.text, kind: r.kind })),
        });
      },
      agent: wallAgent,
    };
  }, [wallAgent, user, wallData.familyMembers, groceryList, scratchpad, tomorrowData, liveWeather, weatherData, todayRows, kidModels, dinnerEvent, dinner, dinnerStartDate, dinnerDays, tomorrowKey, comingUpRows, scratchRows]);

  const handleTick = useCallback((member: FamilyMember, row: KidRow) => {
    void (async () => {
      if (row.entityType === 'task') await updateTask(row.id, { completed: !row.done });
      else await (row.done ? undoDone('routine', row.id, now) : markDone('routine', row.id, now));
      await Promise.all([refreshHistory(), wallData.refetch()]);
    })();
    if (!row.done) showFlash(`${member.name} · ${row.title}`);
  }, [updateTask, undoDone, markDone, now, refreshHistory, wallData, showFlash]);
  const momentHandoffs = useMemo(
    () => handoffQuestions.filter((q) => q.when === 'today').map((q) => ({ key: q.eventKey, time: q.time, prompt: q.prompt })),
    [handoffQuestions],
  );
  const handleTapRow = useCallback((id: string) => {
    const tapped = timeline.flatMap((s) => s.events).find((e) => e.id === id);
    if (tapped && (tapped.kind === 'routine' || tapped.kind === 'event' || tapped.kind === 'task')) { setActionSheetItem(tapped); return; }
    const row = todayRows.find((r) => r.id === id);
    if (row) showFlash(row.title);
  }, [timeline, todayRows, showFlash]);

  // A check on the day's lists (Scott, 2026-10-17): the same writer the
  // action sheet's Done uses, and the flash says it took.
  const handleCompleteRow = useCallback((id: string) => {
    handleToggleComplete(id, true);
    const row = todayRows.find((r) => r.id === id);
    if (row) showFlash(`Done · ${row.title}`);
  }, [handleToggleComplete, todayRows, showFlash]);

  // All of today · This weekend (Scott, 2026-10-18): every item the wall
  // holds for those days, and a check that goes both ways.
  const agenda = useMemo(() => {
    // The weekend as the Week page draws it (Scott, 2026-10-21: "make it
    // match the main app"): Saturday, Sunday, and Sometime this weekend.
    const planned = (routineId: string, dayKey: string) => wallData.routineInstances.some((i) => i.entity_id === routineId && i.planned_on === dayKey);
    const weekend = agendaWeekend(wallData.days, wallData.familyMembers, now, { tasks: wallData.weekendTasks, planned });
    return {
      today: agendaDays(wallData.days, 'today', now).map((d) => agendaDay(d, wallData.familyMembers, now)),
      weekend: weekend.days,
      sometime: weekend.sometime,
    };
  }, [wallData.days, wallData.familyMembers, wallData.weekendTasks, wallData.routineInstances, now]);
  // A sticky written on the wall (Scott, 2026-10-18): a scratchpad note, so
  // it's on Home, in Notes and in the app's scratchpad alike.
  const handleAddSticky = useCallback(async (text: string, by: string | null) => {
    const ok = await scratchpad.add(text, 'note', by);
    if (ok) showFlash('Sticky added');
    return ok;
  }, [scratchpad, showFlash]);
  const handleSetDone = useCallback((row: AgendaRow, done: boolean) => {
    handleToggleComplete(row.id, done, row.on);
    showFlash(done ? `Done · ${row.title}` : `Not done · ${row.title}`);
  }, [handleToggleComplete, showFlash]);

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
    // Every preset lands on named dates — a week by its two ends, a weekend by
    // its Saturday — and the flash says them, so nobody guesses where it went.
    const target = pushTargets(new Date(), weekStartsOn)[preset];
    await updateTask(taskId, target.updates);
    wallData.refetch();
    showFlash(target.flash);
  }, [updateTask, wallData, showFlash, weekStartsOn]);

  // Derive the discussion-overlay visibility so it auto-hides when the queue
  // drains (without an effect that lint flags for cascading renders).

  // Lightweight {id,name} projections so the QuickCapture parser keeps working
  // when launched from the wall. Slim shapes avoid pulling the full contact
  // model into the wall bundle.
  const captureProjects = useMemo(() => [], []);
  const captureContacts = useMemo(() => [], []);
  const captureFamilyMembers = useMemo(
    () => wallData.familyMembers.map((m) => ({ id: m.id, name: m.name })),
    [wallData.familyMembers],
  );

  // The kiosk's household tools (approved Kiosk-Frame): Call, Groceries and
  // Recipes stay one tap away in the bottom bar; everything secondary —
  // adding a task, lists, notes, the light/dark view, settings — sits in one
  // labelled More sheet. Kitchen wall v2 picks its More tiles from these by
  // id (list, notes, theme, guest, settings) beside its own.
  const { dark: isDark, toggle: toggleTheme } = useWallTheme(kioskV1.pick.dark);
  const kioskTools = useMemo(() => ({
    onGroceries: () => {
      if (!groceryList) { showFlash('No family grocery list yet'); return; }
      setSheetListId(groceryList.id); setShowListSheet(true);
    },
    onRecipes: () => setShowRecipePicker(true),
    more: [
      { id: 'task', label: 'Add', sub: 'A task for the household', icon: Plus, onSelect: () => handleDockAction('task') },
      { id: 'list', label: 'Lists', sub: 'Groceries and family lists', icon: ClipboardList, onSelect: () => handleDockAction('list') },
      { id: 'notes', label: 'Notes', sub: scratchRows.length ? `${scratchRows.length} on the scratchpad` : 'The family scratchpad', icon: StickyNote, onSelect: () => { setScratchpadFocus(null); setShowScratchpad(true); } },
      // The label follows the EFFECTIVE theme (automatic or overridden).
      { id: 'theme', label: isDark ? 'Light view' : 'Dark view', sub: 'Until the wall switches by itself', icon: isDark ? Sun : Moon, onSelect: toggleTheme },
      { id: 'guest', label: 'Guest mode', sub: 'Hides the family’s day', icon: Users, onSelect: () => setGuestMode(true) },
      { id: 'settings', label: 'Settings', sub: 'Refresh and daily routines', icon: Settings, onSelect: () => handleDockAction('utilities') },
    ],
  }), [groceryList, showFlash, handleDockAction, scratchRows.length, isDark, toggleTheme]);
  const kioskV1Shown = useMemo(() => ({ ...kioskV1, pick: { ...kioskV1.pick, dark: isDark } }), [kioskV1, isDark]);
  // What's already on the grocery list, beside a proposal ("where they'll go").
  const { items: groceryItems } = useListItems(stage.kind === 'groceries' ? groceryList?.id ?? null : null);
  const groceryOpenItems = useMemo(
    () => (stage.kind === 'groceries' ? groceryItems.filter((i) => !i.completed).map((i) => i.text) : null),
    [stage.kind, groceryItems],
  );

  // Chromeless kiosk recovery: the wall has no nav, so a lost session (e.g. it
  // sat through a Supabase outage and its token couldn't refresh) leaves every
  // data fetch no-op'ing on `!user` and the refresh spinner stuck forever, with
  // no way to log back in. Render the sign-in form instead of a dead spinner so
  // the wall can recover itself. Wait out the initial auth check to avoid a
  // login flash; AuthForm flips `user` on success and we re-render into the wall.
  // A signed-out wall's front door is pairing (its own restricted sign-in);
  // "Sign in instead" is one tap away for setup or recovery.
  if (!authLoading && !user) {
    return wantsPersonSignIn ? <AuthForm /> : <PairDisplayScreen onSignInInstead={() => setWantsPersonSignIn(true)} />;
  }

  return (
    <div className={`${isDark ? 'dark ' : ''}wall-touch-root relative h-screen w-screen overflow-hidden transition-colors ${WALL.root}`}>
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
      {/* The wall, by time of day (Scott, 2026-10-04): Today · the moment ·
          specials and coming up · the question and the kids' lists. */}
      {/* Edge to edge, the top too unless the stale banner sits above it. */}
      <div className="flex-1 min-h-0 -m-4 mt-0 first:-mt-4">
        <KioskCanvas
          isDark={isDark}
          activity={kiosk}
          now={now}
          moment={moment}
          dateLabel={now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          clock={clock}
          weather={liveWeather ? { icon: weatherData.icon ?? Sun, temp: weatherData.temp, condition: weatherData.condition } : null}
          tools={kioskTools}
          groceryListItems={groceryOpenItems}
          members={wallData.familyMembers}
          rows={todayRows}
          homeRows={todayForMoment}
          kidsNow={kidsNow}
          focusRows={focusRows}
          handoffs={momentHandoffs}
          checklists={checklists}
          bedtime={bedtimeGrid}
          dinner={kioskDinner}
          nextMeal={nextMeal}
          comingUp={comingUpRows}
          question={handoffAsk ? { text: handoffAsk.prompt, isHandoff: true } : (discussionDismissed || !discussionPrompt ? null : { text: discussionPrompt, isHandoff: false })}
          groceryListTitle={groceryList?.title ?? null}
          saveGroceries={saveGroceries}
          personPage={kidViewMember && (
            <KidDayView
              member={kidViewMember}
              routines={wallData.routines}
              todayItems={(wallData.days.find((d) => d.isToday) ?? wallData.days[0])?.items ?? emptySections<TimelineItem>()}
              tomorrowItems={wallData.days[1]?.items}
              members={wallData.familyMembers}
              screenTime={wallData.screenTimeSummaries.find((s) => s.familyMemberId === kidViewMember.id) ?? null}
              weather={weather}
              neededTasks={wallData.neededTasks}
              homeworkTasks={wallData.homeworkTasks}
              notices={wallData.notices}
              paperTasks={wallData.paperTasks}
              adults={adults}
              onClaimPaper={(id, memberId) => handlePaper(claimPaper(supabase, id, memberId))}
              onPaperInBackpack={(id) => handlePaper(paperInBackpack(supabase, id, new Date()))}
              onPaperNotOurs={(id) => handlePaper(paperNotOurs(supabase, id, new Date()))}
              onToggleTask={handleToggleComplete}
              onClose={handleCloseKidView}
              days={wallData.days}
              tonight={selectedDinnerDay ? selectedDinnerDay.title : (dinnerEvent ? dinner.mealName : null)}
              onOpenDinner={handleTapDinnerCard}
              onOpenMember={handleTapGanttMember}
              onOpenApp={(app, routineId) => kioskDispatch({ type: 'OPEN', stage: { kind: 'webapp', url: app.url, title: app.title, origin: app.origin, routineId } })}
            />
          )}
          recipePage={recipePage}
          recipeTitle={recipeTitle}
          onOpenRecipe={() => { setMealDayKey(null); setRecipeViewerMeal('dinner'); }}
          onTapRow={handleTapRow}
          onCompleteRow={handleCompleteRow}
          agenda={agenda}
          onSetDone={handleSetDone}
          onAddSticky={handleAddSticky}
          onTick={handleTick}
          onClaim={() => setShowWhoSheet(true)}
          onTapQuestion={() => (handoffAsk ? setShowWhoSheet(true) : setShowQuestionSheet(true))}
          flash={showFlash}
          voice={wallVoice}
          week={talkWeek}
          v1={kioskV1Shown}
          math={kidMath}
          energy={homeEnergy}
          loadEnergyPeriod={fetchEnergyPeriod}
        />
      </div>

      {/* The flash lost its home when the family-strip band went. It stays the
          wall's only confirmation that a tap did anything, so it now floats
          above the whole surface rather than riding a row that may not exist.
          z-[60] still clears the sheets (all `z-50`). */}
      {flashMessage && (
        <div
          role="status"
          className="animate-fade-in-up fixed bottom-[17vh] left-1/2 z-[60] -translate-x-1/2 px-[1.6vw] py-[0.8vw] rounded-full bg-stone-800/90 dark:bg-stone-200/90 text-white dark:text-stone-900 text-[max(16px,1.25vw)] font-bold shadow-lg backdrop-blur-md whitespace-nowrap"
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
          pushTargets={pushTargets(now, weekStartsOn)}
          onClose={() => setActionSheetItem(null)}
        />
      )}

      {showRecipePicker && (
        <WallV2RecipeSheet
          recipes={recipeIndex.recipes}
          loading={recipeIndex.loading}
          query={recipeQuery}
          onQueryChange={setRecipeQuery}
          onPick={(r) => { setPickedRecipeId(r.id); setShowRecipePicker(false); kioskDispatch({ type: 'OPEN', stage: { kind: 'recipe', source: 'picked' } }); }}
          // Closing the shelf outright is done searching; Back from a recipe
          // (below) is not, and keeps the query.
          onClose={() => { setShowRecipePicker(false); setRecipeQuery(''); }}
        />
      )}

      {showQuestionSheet && (
        <WallV2QuestionSheet
          question={discussionPrompt}
          dismissed={discussionDismissed}
          onNext={nextDiscussion}
          onDone={() => { dismissDiscussion(); setShowQuestionSheet(false); }}
          onBringBack={undismissDiscussion}
          onClose={() => setShowQuestionSheet(false)}
        />
      )}

      {showWhoSheet && (
        <WallV2WhoSheet
          questions={handoffQuestions}
          adults={adults}
          accentIndex={(id) => Math.max(0, wallData.familyMembers.findIndex((m) => m.id === id))}
          onPick={handlePickWho}
          onClose={() => setShowWhoSheet(false)}
        />
      )}

      {showScratchpad && (
        <WallV2ScratchpadSheet
          rows={scratchRows}
          sorted={scratchSorted}
          members={wallData.familyMembers}
          inboxPeople={adults}
          now={now}
          focusKey={scratchpadFocus}
          onAdd={scratchpad.add}
          onDone={(row, res) => { void handleScratchDone(row, res); }}
          onSendToInbox={(row, id) => { void handleScratchSend(row, id); }}
          onEdit={(row, body) => { void scratchpad.edit(row.id, body); }}
          onDelete={(row) => { void scratchpad.remove(row.id); }}
          onReopen={(id) => { void scratchpad.reopen(id); }}
          onClose={() => setShowScratchpad(false)}
        />
      )}

      {/* QuickCapture overlay — controlled, no FAB; the wall dock owns the
         entry point. Parser is given a slim family list for @mentions. */}
      <QuickCapture
        onAdd={handleQuickCaptureAdd}
        onAddRich={(data) => void handleQuickCaptureAddRich(data)}
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

      {/* Caller-ID takeover — full-screen when kidsPhone has a live call. */}
      <CallerIdTakeover />
    </div>
  );
}
