// src/shell/providers/MealEventsProvider.tsx
//
// Hosts the meal-plan-to-CalendarEvent synthesis that previously lived in
// App.tsx and was duplicated in HomeViewContainer. Both the legacy `/today`
// path (App.tsx) and the new `/tasks-new/today` path (HomeViewContainer) need
// the same synthesis: meal-plan entries surface on the timeline as synthetic
// CalendarEvent objects with id `meal:<entry-id>`.
//
// The provider itself is currently a stateless marker — the actual work is
// done by the `useMealEventsForDate(viewedDate)` hook, which fetches the
// meal plan for the consumer's week via useMealPlan. We still mount the
// provider so future state (e.g., shared cache across consumers, or a global
// `viewedDate`) has a home; consumers should always wrap in <MealEventsProvider>
// before calling useMealEventsForDate so the indirection is preserved.
//
// TODO(autonomous-symphony-refactor): once the legacy /today path is fully
// retired (post-cutover, P5 cleanup), delete the App.tsx copy of this
// synthesis. Also: if multiple consumers end up needing the same week, lift
// the useMealPlan call into the provider and key by week-start.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useMealPlan } from '@/hooks/useMealPlan';
import { useRecipes } from '@/hooks/useRecipes';
import { sundayOfWeek } from '@/lib/weekHelpers';
import { SHOW_PLANNED_MEALS_ON_TIMELINE } from '@/lib/mealsVisibility';
import type { CalendarEvent } from '@/hooks/useGoogleCalendar';
import type { MealPlan, Recipe } from '@/types/meal-planner';
import type { FamilyMember } from '@/types/family';

const MealEventsContext = createContext<true | null>(null);

/**
 * Build meal CalendarEvents for a given date from a (week-keyed) meal plan
 * and recipe map. Pure function — exported for tests and for the legacy
 * App.tsx code path to share until cutover removes that path.
 */
export function synthesizeMealEvents(params: {
  viewedDate: Date;
  mealPlan: MealPlan | null | undefined;
  recipes: Recipe[];
  familyMembers: FamilyMember[];
  currentMemberId: string | null;
}): CalendarEvent[] {
  const { viewedDate, mealPlan, recipes, familyMembers, currentMemberId } = params;
  if (!mealPlan) return [];
  const SLOT_TIMES: Record<string, [number, number]> = {
    breakfast: [7, 30], lunch: [12, 30], snack: [15, 30], dinner: [18, 30], prep: [16, 0],
    lunch_iris: [12, 30], lunch_scott: [12, 30], kid_alternate: [18, 30],
  };
  const dow = viewedDate.getDay();
  const memberById = new Map(familyMembers.map(m => [m.id, m]));
  const recipeTitleById = new Map(recipes.map(r => [r.id, r.title]));
  const recipeUrlById = new Map(recipes.map(r => [r.id, r.sourceUrl]));
  const groups = new Map<string, { slot: string; title: string; entryIds: string[]; recipeUrl?: string; recipeId?: string }>();
  for (const e of mealPlan.entries) {
    if (e.dayOfWeek !== dow) continue;
    if (!SLOT_TIMES[e.slot]) continue;
    // Per-user filter: show family-shared (null), self, or kids (members without auth_user_id).
    if (e.familyMemberId != null) {
      const isCurrent = e.familyMemberId === currentMemberId;
      const target = memberById.get(e.familyMemberId);
      const isKid = target ? !target.auth_user_id : false;
      if (!isCurrent && !isKid) continue;
    }
    const title = e.recipeId ? (recipeTitleById.get(e.recipeId) ?? '(unnamed)') : (e.adHocTitle ?? '(unnamed)');
    const recipeUrl = e.recipeId ? (recipeUrlById.get(e.recipeId) ?? undefined) : undefined;
    const key = `${e.slot}|${title}`;
    const existing = groups.get(key);
    if (existing) existing.entryIds.push(e.id);
    else groups.set(key, { slot: e.slot, title, entryIds: [e.id], recipeUrl, recipeId: e.recipeId ?? undefined });
  }
  const out: CalendarEvent[] = [];
  for (const [, { slot, title, entryIds, recipeUrl, recipeId }] of groups) {
    const [hh, mm] = SLOT_TIMES[slot]!;
    const start = new Date(viewedDate); start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
    out.push({
      id: `meal:${entryIds[0]}`,
      title: `${slotLabel} · ${title}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      all_day: false,
      calendar_name: 'Meals',
      calendar_color: '#0F8A4A',
      description: recipeUrl ?? null,
      recipeId: recipeId ?? null,
    });
  }
  return out;
}

interface MealEventsProviderProps {
  children: ReactNode;
}

export function MealEventsProvider({ children }: MealEventsProviderProps) {
  return (
    <MealEventsContext.Provider value={true}>
      {children}
    </MealEventsContext.Provider>
  );
}

/**
 * Synthesize meal CalendarEvents for the given date. Internally fetches the
 * meal plan for the date's week via useMealPlan + useRecipes + useFamilyMembers.
 *
 * Must be called inside a <MealEventsProvider>. The provider is a marker
 * today (no real state) but consumers should still wrap so future caching
 * lives behind a stable seam.
 */
export function useMealEventsForDate(
  viewedDate: Date,
  opts?: { force?: boolean },
): CalendarEvent[] {
  const ctx = useContext(MealEventsContext);
  if (!ctx) {
    throw new Error('useMealEventsForDate must be used inside <MealEventsProvider>');
  }
  const weekStart = useMemo(() => sundayOfWeek(viewedDate), [viewedDate]);
  const { plan } = useMealPlan(weekStart);
  const { recipes } = useRecipes();
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers();
  // The wall passes force:true so tonight's planned dinner (and its stored
  // recipe) surface on the kiosk even while the global flag keeps meals off the
  // Today / Week / Month timelines. Kiosk-scoped — no effect on those surfaces.
  const show = SHOW_PLANNED_MEALS_ON_TIMELINE || opts?.force === true;

  return useMemo(
    () =>
      // Planned meals are paused from the timeline until the planner is set up
      // properly (see mealsVisibility.ts). synthesizeMealEvents stays pure.
      show
        ? synthesizeMealEvents({
            viewedDate,
            mealPlan: plan,
            recipes,
            familyMembers,
            currentMemberId: getCurrentUserMember()?.id ?? null,
          })
        : [],
    [show, viewedDate, plan, recipes, familyMembers, getCurrentUserMember],
  );
}
