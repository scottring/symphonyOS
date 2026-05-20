// src/components/wall-v2/WallV2Shell.tsx
//
// Orchestrates the WallV2 kiosk surface — three-column grid (date / center /
// right widgets) with a six-button action dock at the bottom.
//
// The shell pulls live data via the existing wall hooks (useWallData,
// useWeather, useMealEventsForDate) and converts it to the WallV2 view shape
// via the pure adapters in `wallV2Adapter.ts`. Where a live data source
// doesn't exist yet (per-member glance cards, grocery list, AI insight) we
// keep the original mock payload — those slots stay visually identical to the
// design while remaining a single swap away from real data.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sun } from 'lucide-react';
import { TINTS } from './tints';
import { WallV2DateColumn } from './WallV2DateColumn';
import { WallV2AtAGlance } from './WallV2AtAGlance';
import { WallV2Timeline } from './WallV2Timeline';
import { WallV2RightColumn } from './WallV2RightColumn';
import { WallV2ActionDock } from './WallV2ActionDock';
import {
  MOCK_ACTIONS,
  MOCK_GLANCE,
  MOCK_GROCERY,
  MOCK_INSIGHT,
  MOCK_TAGLINE,
  MOCK_TIMELINE,
  MOCK_UPCOMING,
  MOCK_WEATHER,
} from './wallV2Mock';
import {
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
import { supabase } from '@/lib/supabase';

function formatDate(d: Date): { weekday: string; fullDate: string } {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return { weekday, fullDate };
}

export function WallV2Shell() {
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

  const liveTimeline = useMemo(
    () => adaptTimelineSections(todayData, wallData.familyMembers, now, dinnerEvent),
    [todayData, wallData.familyMembers, now, dinnerEvent],
  );

  const liveUpcoming = useMemo(
    () => adaptUpcoming(wallData.days, now, 2),
    [wallData.days, now],
  );

  // ─── Choose live or mock per surface ───
  // Strategy: live data ONLY when the hook returned a non-empty payload.
  // Empty arrays usually mean the user has no scheduled items today or the
  // calendar hasn't loaded — neither is what the kiosk should render, so we
  // fall back to the design-payload mock for visual fidelity in v1.
  const weatherData = liveWeather ?? MOCK_WEATHER;
  const timeline = liveTimeline.length > 0 ? liveTimeline : MOCK_TIMELINE;
  const upcoming = liveUpcoming.length > 0 ? liveUpcoming : MOCK_UPCOMING;

  // Surfaces without a live data source (yet) — keep the mock.
  const glance = MOCK_GLANCE;
  const grocery = MOCK_GROCERY;
  const insight = MOCK_INSIGHT;
  const actions = MOCK_ACTIONS;
  const tagline = MOCK_TAGLINE;

  // ─── Overlays state ───
  const [showRecipeViewer, setShowRecipeViewer] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);

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

  const handleAction = useCallback((id: string) => {
    switch (id) {
      case 'discuss':
        if (discussionItems.length > 0) setShowDiscussion(true);
        break;
      case 'reminder':
      case 'task':
      case 'grocery':
      case 'event':
      case 'photo':
        // Stubs — real handlers ship in a follow-up. The dock still gives the
        // user touch feedback via the button's :hover/:active states.
        // eslint-disable-next-line no-console
        console.log('[wall-v2] action (stub):', id);
        break;
    }
  }, [discussionItems.length]);

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

  // Belt-and-suspenders: keep supabase import alive for the dinner refresh path
  // we'll wire when the "complete dinner" action lands.
  void supabase;

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
          <WallV2AtAGlance tagline={tagline} cards={glance} />
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
            grocery={grocery}
            upcoming={upcoming}
            insight={insight}
          />
        </div>

        {/* Row 2 — Full-width action dock */}
        <div className="row-start-2 col-span-3">
          <WallV2ActionDock actions={actions} onTap={handleAction} />
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

      <WallMicButton />
    </div>
  );
}
