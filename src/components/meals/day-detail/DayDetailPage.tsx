import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { GramRing } from '../today/GramRing'
import { sumActualGrams, gramsTargetFor } from '../today/grams'
import { MealsTabs } from '../MealsTabs'
import { MealEditRow, type PersonAssignment } from './MealEditRow'
import { SnackEditRow } from './SnackEditRow'
import { NotesField } from './NotesField'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'

type Person = 'iris' | 'scott' | 'kids'

/** Surface 4 expanded — the per-day editable detail view at /meals/day/:date.
 *  Same data as the compact day card but with full edit affordances and an
 *  Iris / Scott / Kids column per meal row. */
export function DayDetailPage() {
  const { date: dateParam } = useParams<{ date?: string }>()
  const navigate = useNavigate()

  // Resolve target date and the Monday of its week. Date param is YYYY-MM-DD.
  const { date, dayOfWeek, weekStart, isValid } = useMemo(
    () => resolveDate(dateParam),
    [dateParam],
  )

  const { plan, loading, error, refresh } = useMealPlan(weekStart)
  const { recipes } = useRecipes()

  const recipesById = useMemo(() => {
    const m = new Map<string, Recipe>()
    recipes.forEach(r => m.set(r.id, r))
    return m
  }, [recipes])

  // All entries for this day, keyed by canonical day-meal slot. We keep the
  // raw entries (not just the first per slot) so we can derive Iris/Scott/Kids
  // assignments below.
  const entriesForDay = useMemo<MealPlanEntry[]>(() => {
    if (!plan) return []
    return plan.entries.filter(e => e.dayOfWeek === dayOfWeek)
  }, [plan, dayOfWeek])

  // Local notes state (derived from the first entry that carries notes; saved
  // back to that entry on blur). If no entry has notes yet we attach to the
  // first non-snack entry of the day.
  const notesEntry = entriesForDay.find(e => e.notes && e.notes.trim().length > 0)
                  ?? entriesForDay[0]
  const [notesValue, setNotesValue] = useState<string>(notesEntry?.notes ?? '')
  useEffect(() => {
    setNotesValue(notesEntry?.notes ?? '')
  }, [notesEntry?.id, notesEntry?.notes])

  /** Persist a free-text edit on a meal entry. We store kid + scott variants
   *  in the entry's `notes` field for now, falling back to `ad_hoc_title`
   *  when the entry isn't recipe-backed. This is the editorial cut documented
   *  in the spec — full per-person entries can come later. */
  const commitText = useCallback(
    async (entryId: string | undefined, _person: Person, next: string) => {
      if (!entryId) return
      const entry = entriesForDay.find(e => e.id === entryId)
      if (!entry) return
      const patch: Record<string, string | null> = entry.recipeId
        ? { notes: next.length === 0 ? null : next }
        : { ad_hoc_title: next.length === 0 ? null : next }
      const { error: updErr } = await supabase
        .from('meal_plan_entries')
        .update(patch)
        .eq('id', entryId)
      if (updErr) {
        // Surface but don't crash — user can retry on next blur.

        console.error('[DayDetail] save failed', updErr)
        return
      }
      await refresh()
    },
    [entriesForDay, refresh],
  )

  const commitNotes = useCallback(async (next: string) => {
    if (!notesEntry) return
    setNotesValue(next)
    const { error: updErr } = await supabase
      .from('meal_plan_entries')
      .update({ notes: next.length === 0 ? null : next })
      .eq('id', notesEntry.id)
    if (updErr) {

      console.error('[DayDetail] notes save failed', updErr)
      return
    }
    await refresh()
  }, [notesEntry, refresh])

  if (!isValid) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-accent-500 italic font-display">
          Invalid date in URL. Expected YYYY-MM-DD.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-accent-500">{error}</div>
      </div>
    )
  }

  // Group entries by canonical slot. For Iris/Scott/Kids we use the legacy
  // slot variants when present (lunch_iris, lunch_scott, kid_alternate),
  // otherwise we put the single entry in the IRIS column and leave the others
  // empty so the placeholder renders.
  const assignments = buildAssignments(entriesForDay, recipesById)

  // Day total grams (planned tracking). "was 840g" baseline is read off the
  // notes payload if present (`baseline_grams: <n>`); otherwise hidden.
  const dayTarget = gramsTargetFor(plan?.parameter)
  const dayActual = sumActualGrams(entriesForDay, recipesById)
  const baseline = readBaselineGrams(notesValue)

  const _longLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  const challengeLabel = plan?.parameter ? `${plan.parameter} challenge` : 'meal plan'

  return (
    <div className="px-12 py-12 max-w-3xl mx-auto">
      <MealsTabs />

      {/* Header: day label + ring */}
      <div className="grid grid-cols-[1fr_auto] items-end gap-6 pb-5 border-b border-neutral-200">
        <div>
          <button
            onClick={() => navigate('/meals/plan')}
            className="text-[11px] uppercase tracking-[0.18em] text-neutral-400
                       hover:text-primary-500 italic transition-colors mb-2"
          >
            ← back to plan
          </button>
          <h1 className="font-display text-[2.75rem] leading-[1.05] text-neutral-800">
            {formatHeaderDate(date)}
          </h1>
          <p className="font-display italic text-[1.05rem] text-neutral-500 mt-1.5">
            {challengeLabel}
          </p>
        </div>
        {dayTarget !== null && (
          <div className="flex items-center gap-3">
            <GramRing actual={dayActual} target={dayTarget} size={68} stroke={6} showValue={false} />
            <div className="text-right">
              <div className="font-display italic text-[1.15rem] text-primary-700 leading-tight">
                ~{dayActual}g / {dayTarget}g
              </div>
              {baseline !== null && (
                <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-400 italic">
                  · was {baseline}g
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Meal rows */}
      <div className="mt-2">
        <MealEditRow
          slot="breakfast"
          iris={assignments.breakfast.iris}
          scott={assignments.breakfast.scott}
          kids={assignments.breakfast.kids}
          onCommitText={commitText}
        />
        <MealEditRow
          slot="lunch"
          iris={assignments.lunch.iris}
          scott={assignments.lunch.scott}
          kids={assignments.lunch.kids}
          onCommitText={commitText}
        />
        <SnackEditRow
          entries={assignments.snackEntries}
          recipesById={recipesById}
          onAddItem={() => navigate('/meals/plan')}
        />
        <MealEditRow
          slot="dinner"
          iris={assignments.dinner.iris}
          scott={assignments.dinner.scott}
          kids={assignments.dinner.kids}
          kidsSubTag={assignments.dinner.kidsSubTag}
          onCommitText={commitText}
        />
      </div>

      <NotesField
        value={notesValue}
        placeholder="Easy win. Minimal clean-up."
        onCommit={commitNotes}
      />

      {/* Footer: step-by-step pill (left) + edit-day link (right) */}
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => { /* hook for kitchen-mode (surface 6) */ }}
          className="px-4 py-2 rounded-full bg-primary-500 text-white text-[13px]
                     font-medium hover:bg-primary-600 transition-colors
                     shadow-card"
        >
          Step by step ↗
        </button>
        <button
          type="button"
          onClick={() => navigate('/meals/plan')}
          className="text-[13px] text-primary-500 italic hover:text-primary-600 transition-colors"
        >
          Edit day →
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RowAssignments {
  iris: PersonAssignment
  scott: PersonAssignment
  kids: PersonAssignment
  /** Optional kid sub-tag rendered as a sage box (dinner only). */
  kidsSubTag?: string
}

interface DayAssignments {
  breakfast: RowAssignments
  lunch: RowAssignments
  dinner: RowAssignments
  snackEntries: MealPlanEntry[]
}

/** Group day entries into per-slot Iris/Scott/Kids assignments.
 *
 *  Convention (initial cut, per spec):
 *  - Legacy slot `lunch_iris` → IRIS lunch column.
 *  - Legacy slot `lunch_scott` → SCOTT lunch column.
 *  - Legacy slot `kid_alternate` → KIDS dinner column (also feeds the
 *    sage sub-tag if its `notes` field is present).
 *  - A single canonical-slot entry shows in IRIS; SCOTT/KIDS render placeholders.
 *  - If multiple canonical-slot entries exist, the first lands in IRIS, the
 *    second in SCOTT, the third in KIDS (stable by created_at ordering from
 *    the hook).
 */
function buildAssignments(
  entries: MealPlanEntry[],
  recipesById: Map<string, Recipe>,
): DayAssignments {
  const empty: PersonAssignment = {}

  function resolve(entry: MealPlanEntry | undefined): PersonAssignment {
    if (!entry) return empty
    return {
      entry,
      recipe: entry.recipeId ? recipesById.get(entry.recipeId) : undefined,
    }
  }

  function rowFor(slot: MealSlot, irisLegacy?: MealSlot, scottLegacy?: MealSlot, kidsLegacy?: MealSlot): RowAssignments {
    const canonical = entries.filter(e => e.slot === slot)
    const irisLegacyEntries = irisLegacy ? entries.filter(e => e.slot === irisLegacy) : []
    const scottLegacyEntries = scottLegacy ? entries.filter(e => e.slot === scottLegacy) : []
    const kidsLegacyEntries = kidsLegacy ? entries.filter(e => e.slot === kidsLegacy) : []

    // Iris: prefer explicit legacy variant, else first canonical entry.
    const iris = irisLegacyEntries[0] ?? canonical[0]
    // Scott: prefer explicit legacy, else second canonical entry.
    const scott = scottLegacyEntries[0] ?? canonical[1]
    // Kids: prefer explicit legacy, else third canonical entry.
    const kids = kidsLegacyEntries[0] ?? canonical[2]

    const kidsSubTag = slot === 'dinner'
      ? (kidsLegacyEntries[0]?.notes
         ?? (kids?.notes ? kids.notes : undefined))
      : undefined

    return {
      iris: resolve(iris),
      scott: resolve(scott),
      kids: resolve(kids),
      kidsSubTag,
    }
  }

  const snackEntries = entries.filter(e => e.slot === 'snack')

  return {
    breakfast: rowFor('breakfast'),
    lunch:     rowFor('lunch', 'lunch_iris', 'lunch_scott'),
    dinner:    rowFor('dinner', undefined, undefined, 'kid_alternate'),
    snackEntries,
  }
}

interface DateResolution {
  date: Date
  dayOfWeek: number  // 0=Sun … 6=Sat (matches Date.getDay() and DbMealPlanEntry.day_of_week)
  weekStart: Date
  isValid: boolean
}

function resolveDate(dateParam: string | undefined): DateResolution {
  const today = new Date()
  if (!dateParam) {
    const d = today
    const ws = sundayOfWeek(d)
    return { date: d, dayOfWeek: d.getDay(), weekStart: ws, isValid: true }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam)
  if (!m) {
    const ws = sundayOfWeek(today)
    return { date: today, dayOfWeek: today.getDay(), weekStart: ws, isValid: false }
  }
  const y = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10) - 1
  const dd = parseInt(m[3], 10)
  const d = new Date(y, mm, dd)
  d.setHours(0, 0, 0, 0)
  return {
    date: d,
    dayOfWeek: d.getDay(),
    weekStart: sundayOfWeek(d),
    isValid: !Number.isNaN(d.getTime()),
  }
}

function formatHeaderDate(d: Date): string {
  // "Monday · May 11" with the weekday in regular weight and month/day
  // following an editorial mid-dot.
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const monthDay = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  return `${weekday} · ${monthDay}`
}

/** Allow the notes payload to declare a baseline like "baseline_grams: 840".
 *  Returns null if absent. */
function readBaselineGrams(notes: string): number | null {
  const m = notes.match(/baseline[_\s-]grams\s*[:=]\s*(\d{2,4})/i)
  return m ? parseInt(m[1], 10) : null
}
