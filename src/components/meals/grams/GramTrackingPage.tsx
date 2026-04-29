import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { mondayOfWeek, dateForDayOfWeek, dayLabelFor, formatDateMonthDay } from '@/lib/weekHelpers'
import { gramsTargetFor, sumActualGrams } from '@/components/meals/today/grams'
import { MealsTabs } from '../MealsTabs'
import { DayGramRow } from './DayGramRow'
import type { MealPlanEntry, Recipe } from '@/types/meal-planner'

const NOTE_PHRASES: { match: RegExp; label: string }[] = [
  { match: /going\s*out/i,    label: 'Going out'    },
  { match: /morning\s*only/i, label: 'Morning only' },
  { match: /^out\b/i,         label: 'Out'          },
]

/** Map a free-text day-log note to a friendly label, or undefined if the note
 *  doesn't match any of our known phrases (in which case we still draw bars). */
function noteLabelFor(notes: string | null | undefined): string | undefined {
  if (!notes) return undefined
  const trimmed = notes.trim()
  if (!trimmed) return undefined
  for (const { match, label } of NOTE_PHRASES) {
    if (match.test(trimmed)) return label
  }
  return undefined
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface DayLogNoteRow { log_date: string; notes: string | null }

/** Surface 7 — Vegetable-gram tracking. Week table, one row per day,
 *  showing 200g-increment circles against the configured daily target. */
export function GramTrackingPage() {
  const navigate = useNavigate()
  const weekStart = useMemo(() => mondayOfWeek(new Date()), [])
  const { plan, loading: planLoading, error: planError } = useMealPlan(weekStart)
  const { recipes } = useRecipes()
  const [notesByDate, setNotesByDate] = useState<Map<string, string | null>>(new Map())

  // Fetch all 7 day-log notes in one round trip — we only need notes here,
  // and useMealDayLog is single-day. Pull straight from the table.
  const weekStartIso = toIsoDate(weekStart)
  const weekEndIso = toIsoDate(dateForDayOfWeek(weekStart, 6))
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: userResult } = await supabase.auth.getUser()
      const userId = userResult?.user?.id
      if (!userId) return
      const { data } = await supabase
        .from('meal_day_logs')
        .select('log_date,notes')
        .eq('user_id', userId)
        .gte('log_date', weekStartIso)
        .lte('log_date', weekEndIso)
      if (cancelled) return
      const m = new Map<string, string | null>()
      ;(data ?? []).forEach((r: DayLogNoteRow) => m.set(r.log_date, r.notes))
      setNotesByDate(m)
    })()
    return () => { cancelled = true }
  }, [weekStartIso, weekEndIso])

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>()
    recipes.forEach(r => map.set(r.id, r))
    return map
  }, [recipes])

  const entriesByDay = useMemo(() => {
    const m = new Map<number, MealPlanEntry[]>()
    plan?.entries.forEach(e => {
      const list = m.get(e.dayOfWeek) ?? []
      list.push(e)
      m.set(e.dayOfWeek, list)
    })
    return m
  }, [plan])

  const target = gramsTargetFor(plan?.parameter)
  // Daily target shown in the header. The reference design says 800g; the
  // helper currently returns 1000 for the '800g' parameter (per-day cap).
  // We display the parameter's name when present, else fall back to 800g.
  const dailyTargetLabel = plan?.parameter === '800g'
    ? '800g'
    : (target != null ? `${target}g` : '800g')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (planLoading) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }

  if (planError) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-accent-500">{planError}</div>
      </div>
    )
  }

  return (
    <div className="px-12 py-12 max-w-3xl mx-auto">
      <MealsTabs />

      {/* Header row: title left, target read-out right */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500 mb-2">
            WEEK OF {formatDateMonthDay(weekStart).toUpperCase()}
          </div>
          <h1 className="font-display text-[3rem] leading-[1.05] text-neutral-800">
            Vegetable-gram tracking<span className="italic text-primary-500">.</span>
          </h1>
        </div>
        <div className="text-right pt-1">
          <div className="text-[12px] text-neutral-500">
            Daily target: <span className="font-medium text-neutral-800">{dailyTargetLabel}</span> vegetables
          </div>
          <button
            onClick={() => navigate('/meals/plan')}
            className="text-[12px] italic text-primary-500 hover:text-primary-600 mt-1"
          >
            Edit target →
          </button>
        </div>
      </div>

      {/* Week table */}
      <div className="card p-6">
        {[0, 1, 2, 3, 4, 5, 6].map(d => {
          const date = dateForDayOfWeek(weekStart, d)
          const iso = toIsoDate(date)
          const dayMidnight = new Date(date)
          dayMidnight.setHours(0, 0, 0, 0)
          const isFuture = dayMidnight.getTime() > today.getTime()

          const noteLabel = noteLabelFor(notesByDate.get(iso))
          const dayEntries = entriesByDay.get(d) ?? []
          const grams = sumActualGrams(dayEntries, recipesById)

          return (
            <DayGramRow
              key={d}
              dayLabel={dayLabelFor(d)}
              dateLabel={formatDateMonthDay(date)}
              isFuture={isFuture}
              noteLabel={noteLabel}
              grams={grams}
              target={plan?.parameter === '800g' ? 800 : target}
            />
          )
        })}
      </div>

      <p className="font-display italic text-[13px] text-neutral-400 mt-6 text-center">
        Grams are estimates based on recipes &amp; your habits.
      </p>
    </div>
  )
}
