// What the Week's planning needs from the page's own lists (paper-style
// horizons, 2026-11-04): October's lines for the guide to read, last week's
// leftovers with their four calls for the look back, and this week's tasks
// with no day for "Place them" (Give them a day). Each call is the deck's
// writer (useDeckActions), run through the canvas activity, so it saves,
// shows a receipt and offers Undo.
//
// Nothing here commits a month line to the week or sends a week item up to
// the month: the week is written in its own words, on the week itself.
// Last week's leftover is Done, Next week, Someday (last week's commitment
// only) or Let go (not ever, letGo.ts).

import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { DeckCard, DeckSource } from '@/lib/planning/deck'
import { buildDeck, carriedWeeks } from '@/lib/planning/deck'
import type { DeckActions } from './useDeckActions'
import { buildChooseTree, type ChooseNode, type ChooseLine } from '@/lib/planning/chooseFromAbove'
import type { PlaceItem } from '@/components/plan/choose/GiveThemADay'
import type { LooseEnd } from '@/components/plan/guided/week/WeekLookBack'

/** What the week's planning needs. Bound by useChooseWeek; drawn by the
 *  guided session and Place them. */
export interface WeekChoose {
  monthWord: string
  /** October's open lines, for the guide to read (never to pick from). */
  monthLines: readonly { id: string; title: string }[]
  placeItems: PlaceItem[]
  placedCount: number
  /** Last week's still open (Looking back's count). */
  notDoneLastWeek: number
  /** The same, each with its calls (the guided session's Look back). */
  looseEnds?: LooseEnd[]
}

export interface ChooseWeekDeps {
  /** October's lines (already filtered for privacy, area and people). */
  lines: Task[]
  /** Every row the planner may show: the page's scoped tasks. */
  pool: Task[]
  weekAnchor: Date
  lastWeekStart: Date
  monthStart: Date
  isCurrent: boolean
  actions: DeckActions
}

export function useChooseWeek(d: ChooseWeekDeps): WeekChoose {
  const monthWord = d.monthStart.toLocaleDateString('en-US', { month: 'long' })

  return useMemo(() => {
    const tree = buildChooseTree({
      lines: d.lines, pool: d.pool, level: 'week', periodStart: d.weekAnchor, prevStart: d.lastWeekStart,
      isCurrent: d.isCurrent, hereWord: 'this week', lastWord: 'last week', aboveWord: monthWord, includeInbox: true, aboveStart: d.monthStart,
    })
    const card = (t: Task, source: DeckSource): DeckCard => ({ key: t.id, task: t, source, facts: '' })

    const placeCards = buildDeck({ tasks: d.pool, weekStart: d.weekAnchor, lastWeekStart: d.lastWeekStart, isCurrent: d.isCurrent, only: 'this-week' })
    const placeItems: PlaceItem[] = placeCards.map((c) => ({
      key: c.key, title: c.task.title, from: 'This week',
      onPlace: (day: Date) => d.actions.placeOnDay(c, day),
    }))
    const end = new Date(d.weekAnchor.getFullYear(), d.weekAnchor.getMonth(), d.weekAnchor.getDate() + 7)
    const placedCount = d.pool.filter((t) => !t.completed && t.scheduledFor && t.scheduledFor >= d.weekAnchor && t.scheduledFor < end).length

    // Last week's leftovers nobody answered, wherever the tree put them.
    const unanswered = tree.lines.flatMap(function all(l: ChooseLine | ChooseNode): Task[] {
      const kids = 'steps' in l ? l.steps : l.children
      return [...(l.planned.kind === 'last' ? [l.task] : []), ...kids.flatMap(all)]
    }).concat(tree.loose.filter((x) => x.source === 'last').map((x) => x.task))

    // Looking back (the guided session's step 1): each of last week's not
    // done, with its four calls. Next week is the week being planned (the
    // look back's next week); Someday ends last week's commitment only (a
    // month or season still holding it keeps it there) and says which;
    // Let go is not ever, every list, with Undo.
    const looseEnds: LooseEnd[] = unanswered.map((t) => {
      const n = carriedWeeks(t)
      return {
        key: t.id, title: t.title, note: n >= 1 ? `Carried ${n} ${n === 1 ? 'week' : 'weeks'}` : undefined,
        nextWeek: () => d.actions.keepThisWeek(card(t, 'last-week')),
        someday: () => d.actions.someday(card(t, 'last-week')),
        letGo: () => d.actions.letGo(card(t, 'last-week')),
        done: () => d.actions.done(card(t, 'last-week')),
      }
    })

    return {
      monthWord,
      monthLines: tree.lines.map((l) => ({ id: l.task.id, title: l.task.title })),
      placeItems,
      placedCount,
      /** How many of last week's are still open (Looking back's count). */
      notDoneLastWeek: unanswered.length,
      looseEnds,
    }
  }, [d, monthWord])
}
