import { ChevronRight, Utensils } from 'lucide-react'

/** Tonight's planned dinner, as Today shows it (design B, 2026-10-07). */
export interface TodayDinner {
  /** The meal's selection id (`event-meal:<entry>`) — opens the meal panel. */
  id: string
  title: string
  /** "6:30 PM" */
  time: string | null
  minutes: number | null
  /** The first sentence of the plan's notes ("Roast double sweet potatoes…"). */
  cue: string | null
  imageUrl: string | null
}

/**
 * The dinner card under For today, as the iOS app and the wall have it: the
 * recipe's photo, the dish, when and how long, and the plan's first note.
 * A tap opens the meal (its recipe), the way a meal opens everywhere else.
 */
export function TodayDinnerCard({ dinner, onOpen }: { dinner: TodayDinner; onOpen: (id: string) => void }) {
  const meta = [dinner.time, dinner.minutes ? `${dinner.minutes} min` : null, dinner.cue].filter(Boolean).join(' · ')
  return (
    <section aria-label="Dinner tonight">
      <p className="today-dinner-eyebrow">Dinner tonight</p>
      <button type="button" className="sym-card today-dinner" onClick={() => onOpen(dinner.id)} aria-label={`Dinner tonight: ${dinner.title}. Open the recipe`}>
        {dinner.imageUrl
          ? <img src={dinner.imageUrl} alt="" className="today-dinner-photo" />
          : <span className="today-dinner-photo is-empty" aria-hidden="true"><Utensils size={26} strokeWidth={1.6} /></span>}
        <span className="min-w-0">
          <span className="today-dinner-title block">{dinner.title}</span>
          {meta && <span className="today-dinner-meta block">{meta}</span>}
        </span>
        <ChevronRight className="h-6 w-6 text-neutral-400" aria-hidden="true" />
      </button>
    </section>
  )
}

/** "Roast double sweet potatoes — half for Wednesday." from the plan's notes. */
export function firstSentence(notes: string | null | undefined): string | null {
  const t = notes?.trim()
  if (!t) return null
  const m = /^(.+?[.!?])(\s|$)/.exec(t)
  return (m ? m[1] : t).slice(0, 140)
}
