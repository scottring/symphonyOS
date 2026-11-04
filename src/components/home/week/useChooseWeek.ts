// Planning the week, as the Week page plans it (spec 2026-10-19): the week's
// own items, then Give them a day. This binds the views to the existing
// writers — the deck's (placeOnDay, keepThisWeek, later, done, let go) and
// updateTask — each run through the canvas activity, so it saves, shows a
// receipt and offers Undo.
//
// Paper-style horizons (2026-11-04): October's lines are for reading. Nothing
// here commits a month line to the week, sends a week item back up to the
// month, or ties a new week task to a line: the week is written in its own
// words. Last week's leftover is Done, Next week, Someday (last week's
// commitment only) or Let go (not ever, letGo.ts).

import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { DeckCard, DeckSource } from '@/lib/planning/deck'
import { buildDeck, carriedWeeks } from '@/lib/planning/deck'
import type { DeckActions, LaterWhen } from './useDeckActions'
import { buildChooseTree, type ChooseNode, type ChooseLine, type LooseItem } from '@/lib/planning/chooseFromAbove'
import type { ChooseItemView, ChooseLineView, ChooseVerb } from '@/components/plan/choose/ChoosePlan'
import type { PlaceItem } from '@/components/plan/choose/GiveThemADay'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import type { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { letGoUpdates, unletGoUpdates } from '@/lib/planning/letGo'
import type { LooseEnd } from '@/components/plan/guided/week/WeekLookBack'

/** What the week's choosing needs: October's lines, the loose items, and the
 *  days to place on. Bound by useChooseWeek; drawn by the guided session. */
export interface WeekChoose {
  monthWord: string
  lines: ChooseLineView[]
  doneLines: ChooseLineView[]
  loose: ChooseItemView[]
  onAddLoose: (title: string) => Promise<boolean>
  placeItems: PlaceItem[]
  placedCount: number
  /** Last week's still open (Looking back's count). */
  notDoneLastWeek: number
  /** The same, each with its calls (the guided session's Look back). */
  looseEnds?: LooseEnd[]
}

type AddTaskOptions = NonNullable<Parameters<ReturnType<typeof useSupabaseTasks>['addTask']>[4]>

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
  keepForward: (id: string, period: { weekStart?: Date; monthStart?: Date }, from?: Date) => Promise<string | undefined>
  dropCommitment: (id: string, level: 'week' | 'month' | 'season', periodStart: Date) => Promise<boolean>
  updateTask: (id: string, updates: Partial<Task>) => Promise<unknown>
  addTask: (title: string, contactId?: string, projectId?: string, scheduledFor?: Date, options?: AddTaskOptions) => Promise<string | undefined>
  deleteTask: (id: string) => Promise<unknown>
}

// Later on the week: the next week or Someday. Never up to a month.
const LATER: { label: string; when: LaterWhen }[] = [
  { label: 'Next week', when: 'next-week' },
  { label: 'Someday', when: 'someday' },
]

export function useChooseWeek(d: ChooseWeekDeps) {
  const activity = useCanvasActivity()
  const monthWord = d.monthStart.toLocaleDateString('en-US', { month: 'long' })

  return useMemo(() => {
    const tree = buildChooseTree({
      lines: d.lines, pool: d.pool, level: 'week', periodStart: d.weekAnchor, prevStart: d.lastWeekStart,
      isCurrent: d.isCurrent, hereWord: 'this week', lastWord: 'last week', aboveWord: monthWord, includeInbox: true, aboveStart: d.monthStart,
    })
    const card = (t: Task, source: DeckSource): DeckCard => ({ key: t.id, task: t, source, facts: '' })
    const ok = (r: unknown) => r !== false

    const thisWeek = (t: Task, fromLast: boolean): ChooseVerb => ({
      label: 'This week', role: 'here',
      run: () => fromLast ? d.actions.keepThisWeek(card(t, 'last-week')) : d.actions.keepThisWeek(card(t, 'inbox')),
    })
    // Done toggles: on a finished row the same write reopens it (the card's Undo).
    const done = (t: Task): ChooseVerb => ({ label: 'Done', quiet: true, role: 'done', run: () => d.actions.done(card(t, 'this-week')) })
    const reopen = (t: Task): ChooseVerb => ({ label: 'Reopen', quiet: true, role: 'reopen', run: () => d.actions.done(card(t, 'this-week')) })
    const keepWeek = (t: Task): ChooseVerb => ({ label: 'This week', role: 'here', run: () => d.actions.keepThisWeek(card(t, 'this-week')) })
    const later = (t: Task, source: DeckSource): ChooseVerb => ({
      label: 'Later', quiet: true, run: async () => true,
      menu: LATER.map((l) => ({ label: l.label, run: () => d.actions.later(card(t, source), l.when) })),
    })
    const letGo = (t: Task, source: DeckSource): ChooseVerb => ({ label: 'Let go', quiet: true, run: () => d.actions.letGo(card(t, source)) })

    // A new task for this week, in its own words: tied to nothing.
    const addToWeek = async (title: string) => {
      const id = crypto.randomUUID()
      const opts: AddTaskOptions = { id, bucket: 'week', weekStart: d.weekAnchor }
      return activity.run('Add to this week', async () => !!(await d.addTask(title, undefined, undefined, undefined, opts)),
        { ids: [id], undo: async () => { await d.deleteTask(id) } })
    }

    // A week item under a month line (from before ties were dropped) is
    // still a week item: it keeps its own verbs, listed with the rest.
    const node = (n: ChooseNode): ChooseItemView => ({
      key: n.task.id, title: n.task.title, planned: n.planned,
      note: n.fromLast ? 'From last week, not done' : undefined,
      verbs: n.planned.kind === 'done' ? [reopen(n.task)] : n.planned.kind === 'last' ? [thisWeek(n.task, true), done(n.task), reopen(n.task)]
        : n.planned.kind === 'missed' ? [keepWeek(n.task), done(n.task), reopen(n.task)] : n.planned.kind === 'above' ? [] : [done(n.task), reopen(n.task)],
      children: n.children.map(node),
    })
    // October's lines are for reading: no verbs, no steps, nothing added under them.
    const lineView = (l: ChooseLine): ChooseLineView => ({
      key: l.task.id, title: l.task.title, planned: l.planned, counts: '', verbs: [], steps: [],
    })
    const looseView = (it: LooseItem): ChooseItemView => {
      const t = it.task
      const verbs: ChooseVerb[] = it.source === 'last'
        ? [thisWeek(t, true), done(t), reopen(t), later(t, 'last-week'), letGo(t, 'last-week')]
        : it.source === 'inbox'
          ? [thisWeek(t, false), later(t, 'inbox'), letGo(t, 'inbox')]
          : it.planned.kind === 'missed'
            ? [keepWeek(t), done(t), reopen(t), later(t, 'this-week')]
            : [done(t), reopen(t), later(t, 'this-week')]
      return { key: t.id, title: t.title, planned: it.planned, note: it.source === 'last' ? 'From last week, not done' : it.source === 'inbox' ? 'In your Inbox' : it.planned.kind === 'missed' ? it.planned.label : undefined, verbs, children: [] }
    }
    // The week's items under a month line, listed with the rest (no line shown).
    const underLines: ChooseItemView[] = tree.lines.flatMap((l) => l.steps.filter((n) => n.planned.kind !== 'above').map(node))

    const placeCards = buildDeck({ tasks: d.pool, weekStart: d.weekAnchor, lastWeekStart: d.lastWeekStart, isCurrent: d.isCurrent, only: 'this-week' })
    const placeItems: PlaceItem[] = placeCards.map((c) => ({
      key: c.key, title: c.task.title, from: 'This week',
      onPlace: (day: Date) => d.actions.placeOnDay(c, day),
    }))
    const end = new Date(d.weekAnchor.getFullYear(), d.weekAnchor.getMonth(), d.weekAnchor.getDate() + 7)
    const placedCount = d.pool.filter((t) => !t.completed && t.scheduledFor && t.scheduledFor >= d.weekAnchor && t.scheduledFor < end).length

    const unanswered = tree.lines.flatMap(function all(l: ChooseLine | ChooseNode): Task[] {
      const kids = 'steps' in l ? l.steps : l.children
      return [...(l.planned.kind === 'last' ? [l.task] : []), ...kids.flatMap(all)]
    }).concat(tree.loose.filter((x) => x.source === 'last').map((x) => x.task))

    // Looking back (the guided session's step 1): each of last week's not
    // done, with its four calls. Next week is the week being planned (the
    // look back's next week); Someday ends last week's commitment only, a
    // month or season still holding it keeps it there (the deck's let go of
    // a week); Let go is not ever, every list, with Undo.
    const looseEnds: LooseEnd[] = unanswered.map((t) => {
      const n = carriedWeeks(t)
      return {
        key: t.id, title: t.title, note: n >= 1 ? `Carried ${n} ${n === 1 ? 'week' : 'weeks'}` : undefined,
        nextWeek: () => d.actions.keepThisWeek(card(t, 'last-week')),
        someday: () => d.actions.letGo(card(t, 'last-week')),
        letGo: () => activity.run(`Let go: “${t.title}”`, async () => ok(await d.updateTask(t.id, letGoUpdates())),
          { ids: [t.id], undo: async () => ok(await d.updateTask(t.id, unletGoUpdates(t))) }),
        done: () => d.actions.done(card(t, 'last-week')),
      }
    })

    return {
      tree,
      monthWord,
      lines: tree.lines.map(lineView),
      doneLines: tree.doneLines.map(lineView),
      loose: [...underLines, ...tree.loose.map(looseView)],
      onAddLoose: addToWeek,
      placeItems,
      placedCount,
      /** Last week's leftovers nobody answered (the drain at the end). */
      unanswered,
      /** How many of last week's are still open (Looking back's count). */
      notDoneLastWeek: unanswered.length,
      looseEnds,
    }
  }, [d, activity, monthWord])
}
