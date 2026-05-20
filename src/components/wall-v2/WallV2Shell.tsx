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
import { Sun } from 'lucide-react';
import { TINTS } from './tints';
import { WallV2DateColumn } from './WallV2DateColumn';
import { WallV2AtAGlance } from './WallV2AtAGlance';
import { WallV2Timeline } from './WallV2Timeline';
import { WallV2RightColumn } from './WallV2RightColumn';
import { WallV2ActionDock } from './WallV2ActionDock';
import { MOCK_ACTIONS, MOCK_TAGLINE } from './wallV2Mock';
import {
  adaptGlanceForMember,
  adaptTimelineSections,
  adaptUpcoming,
  adaptWeather,
} from './wallV2Adapter';
import { useWallData } from '@/hooks/useWallData';
import { useWeather } from '@/hooks/useWeather';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';
import { findDinnerEvent, getMealIcon } from '@/components/wall/WallDinnerWidget';
import { extractRecipeNameHint, detectRecipeUrl } from '@/lib/recipeDetection';
import { WallMicButton } from '@/components/wall/WallMicButton';
import { WallRecipeViewer } from '@/components/wall/WallRecipeViewer';
import { WallDiscussionOverlay } from '@/components/wall/WallDiscussionOverlay';
import { useFamilyDiscussionItems, type DiscussionItem } from '@/hooks/useFamilyDiscussionItems';
import { QuickCapture } from '@/components/layout/QuickCapture';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type {
  WallV2GlanceCard,
  WallV2GroceryData,
  WallV2InsightData,
} from './types';

function formatDate(d: Date): { weekday: string; fullDate: string } {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return { weekday, fullDate };
}

// Right-column slots without a live source yet. They render as muted
// placeholders rather than fake data, and are clearly aspirational.
const PLACEHOLDER_GROCERY: WallV2GroceryData = {
  count: 0,
  items: ['Connect a list to see what is missing'],
};
const PLACEHOLDER_INSIGHT: WallV2InsightData = {
  body: 'Insights will appear as Symphony learns your week.',
};

export function WallV2Shell() {
  const { user } = useAuth();

  // Re-rendering each minute keeps the date, timeline filter, and time-aware
  // copy minute-fresh without thrashing the hooks below.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { weekday, fullDate } = useMemo(() => formatDate(now), [now]);

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
    () => adaptTimelineSections(todayData, wallData.familyMembers, now, dinnerEvent),
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

  const dinnerMealName = useMemo(
    () => dinnerEvent ? (extractRecipeNameHint(dinnerEvent.title) || dinnerEvent.title) : 'Dinner',
    [dinnerEvent],
  );
  const recipeUrl = useMemo(
    () => dinnerEvent ? detectRecipeUrl(dinnerEvent.description) : null,
    [dinnerEvent],
  );

  const handleMarkDiscussed = useCallback(async (item: DiscussionItem) => {
    if (item.kind === 'task') {
      await updateTask(item.id, { needsDiscussion: false, discussionNote: undefined });
    } else {
      await unflagEvent(item.id);
    }
  }, [updateTask, unflagEvent]);

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
    // Dinner card → recipe viewer when the event has a recipe URL attached.
    if (id.startsWith('dinner-') && recipeUrl) {
      setShowRecipeViewer(true);
      return;
    }
    // Other tap-throughs land in a follow-up (event detail panel).
    // eslint-disable-next-line no-console
    console.log('[wall-v2] event tap:', id);
  }, [recipeUrl]);

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

  return (
    <div className="h-screen w-screen bg-[var(--color-bg-base)] text-stone-800 overflow-hidden">
      <div className="h-full w-full p-6 grid grid-cols-[280px_1fr_360px] grid-rows-[1fr_auto] gap-4">
        {/* Row 1 — Left rail */}
        <div className="row-span-1 col-start-1">
          <WallV2DateColumn
            weekday={weekday}
            fullDate={fullDate}
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
          <WallV2AtAGlance tagline={MOCK_TAGLINE} cards={glance} />
          <div className="min-h-0 flex-1">
            <WallV2Timeline
              sections={timeline}
              onTapEvent={handleTapEvent}
              onTapFullDay={handleTapFullDay}
            />
          </div>
        </div>

        {/* Row 1 — Right column (4 widgets) */}
        <div className="row-span-1 col-start-3">
          <WallV2RightColumn
            weather={weatherData}
            grocery={PLACEHOLDER_GROCERY}
            upcoming={upcoming}
            insight={PLACEHOLDER_INSIGHT}
          />
        </div>

        {/* Row 2 — Full-width action dock */}
        <div className="row-start-2 col-span-3 relative">
          {flashMessage && (
            <div
              role="status"
              className="absolute -top-9 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-stone-800/90 text-white text-[0.85rem] font-bold shadow-lg backdrop-blur-md whitespace-nowrap"
            >
              {flashMessage}
            </div>
          )}
          <WallV2ActionDock actions={MOCK_ACTIONS} onTap={handleAction} />
        </div>
      </div>

      {/* ─── Overlays ─── */}
      {showRecipeViewer && recipeUrl && (
        <WallRecipeViewer
          url={recipeUrl}
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

      <WallMicButton />
    </div>
  );
}
