// Planning the week, as the Week page plans it (spec 2026-10-19): Choose from
// October, then Give them a day. This binds the views to the existing writers
// — the deck's (placeOnDay, keepThisWeek, later, done, let go), keepForward
// and dropCommitment — each run through the canvas activity, so it saves,
// shows a receipt and offers Undo. Nothing is copied: "This week" adds the
// week to the same row, which keeps its October; "Back to October" ends the
// week and leaves October as it was.

import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { DeckCard, DeckSource } from '@/lib/planning/deck'
import { buildDeck } from '@/lib/planning/deck'
import type { DeckActions, LaterWhen } from './useDeckActions'
import { buildChooseTree, countsLine, lineFor, type ChooseNode, type ChooseLine, type LooseItem } from '@/lib/planning/chooseFromAbove'
import type { ChooseItemView, ChooseLineView, ChooseVerb } from '@/components/plan/choose/ChoosePlan'
import type { PlaceItem } from '@/components/plan/choose/GiveThemADay'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { openCommitment, liveCommitments } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import { timingRemoval } from '@/lib/planning/planActions'
import type { useSupabaseTasks } from '@/hooks/useSupabaseTasks'

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

const LATER: { label: string; when: LaterWhen }[] = [
  { label: 'Next week', when: 'next-week' },
  { label: 'This month', when: 'this-month' },
  { label: 'Next month', when: 'next-month' },
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

    // The snapshot a placement write is undone back to (the deck's restoreOf).
    const restoreOf = (t: Task) => {
      const before = liveCommitments({ commitments: bootstrapCommitments(t) })
      const offDay = timingRemoval(t, 'day')
      return async () => ok(await d.updateTask(t.id, { ...offDay.previous, commitments: before }))
    }
    const thisWeek = (t: Task, fromLast: boolean): ChooseVerb => ({
      label: 'This week',
      run: () => fromLast ? d.actions.keepThisWeek(card(t, 'last-week')) : d.actions.keepThisWeek(card(t, 'inbox')),
    })
    // Back up to October: the week (this one, or last week's leftover) ends;
    // a row October never held is put on it first, so it lands under its line.
    const backUp = (t: Task, fromLast: boolean): ChooseVerb => ({
      label: `Back to ${monthWord}`, quiet: true,
      run: () => activity.run(`Back to ${monthWord}: “${t.title}”`, async () => {
        if (t.scheduledFor && !ok(await d.updateTask(t.id, timingRemoval(t, 'day').updates))) return false
        if (!openCommitment({ commitments: bootstrapCommitments(t) }, 'month') && !(await d.keepForward(t.id, { monthStart: d.monthStart }))) return false
        return d.dropCommitment(t.id, 'week', fromLast ? d.lastWeekStart : d.weekAnchor)
      }, { ids: [t.id], undo: restoreOf(t) }),
    })
    const done = (t: Task): ChooseVerb => ({ label: 'Done', quiet: true, run: () => d.actions.done(card(t, 'this-week')) })
    const later = (t: Task, source: DeckSource): ChooseVerb => ({
      label: 'Later', quiet: true, run: async () => true,
      menu: LATER.map((l) => ({ label: l.label, run: () => d.actions.later(card(t, source), l.when) })),
    })
    const letGo = (t: Task, source: DeckSource): ChooseVerb => ({ label: 'Let go', quiet: true, run: () => d.actions.letGo(card(t, source)) })

    // A new step: a week row made for its parent (a line, or a step broken
    // down), in the parent's life area and toward its goal.
    const addUnder = (parent: Task | null, label: string) => async (title: string) => {
      const id = crypto.randomUUID()
      const opts: AddTaskOptions = {
        id, bucket: 'week', weekStart: d.weekAnchor,
        ...(parent ? { sourceId: parent.id, goalId: parent.goalId, context: parent.context } : {}),
      }
      return activity.run(label, async () => !!(await d.addTask(title, undefined, undefined, undefined, opts)),
        { ids: [id], undo: async () => { await d.deleteTask(id) } })
    }

    const stepVerbs = (n: { task: Task; planned: ChooseNode['planned'] }): ChooseVerb[] => {
      const t = n.task
      switch (n.planned.kind) {
        case 'done': return []
        case 'above': return [thisWeek(t, false), done(t)]
        case 'last': return [thisWeek(t, true), backUp(t, true), done(t)]
        default: return [backUp(t, false), done(t)]
      }
    }
    const node = (n: ChooseNode): ChooseItemView => ({
      key: n.task.id, title: n.task.title, planned: n.planned,
      note: n.fromLast ? 'from last week' : undefined,
      verbs: stepVerbs(n), children: n.children.map(node),
      onBreakDown: n.planned.kind === 'above' || n.planned.kind === 'last'
        ? addUnder(n.task, `Add a step under “${n.task.title}”`) : undefined,
    })
    const lineView = (l: ChooseLine): ChooseLineView => ({
      key: l.task.id, title: l.task.title, planned: l.planned,
      note: l.fromLast ? 'from last week' : undefined,
      counts: countsLine(l.counts, 'this week', monthWord, 'last week'),
      verbs: stepVerbs(l), steps: l.steps.map(node),
      onAddStep: addUnder(l.task, `Add a step this week under “${l.task.title}”`),
    })
    const looseView = (it: LooseItem): ChooseItemView => {
      const t = it.task
      const verbs: ChooseVerb[] = it.source === 'last'
        ? [thisWeek(t, true), later(t, 'last-week'), done(t), letGo(t, 'last-week')]
        : it.source === 'inbox'
          ? [thisWeek(t, false), later(t, 'inbox'), letGo(t, 'inbox')]
          : [later(t, 'this-week'), done(t)]
      return { key: t.id, title: t.title, planned: it.planned, note: it.source === 'last' ? 'from last week' : it.source === 'inbox' ? 'in your Inbox' : undefined, verbs, children: [] }
    }

    // What each week item serves, for step 2: the line it sits under.
    const lineOf = new Map<string, string>()
    for (const l of tree.lines) {
      lineOf.set(l.task.id, l.task.title)
      const walk = (ns: ChooseNode[]) => { for (const n of ns) { lineOf.set(n.task.id, l.task.title); walk(n.children) } }
      walk(l.steps)
    }
    const placeCards = buildDeck({ tasks: d.pool, weekStart: d.weekAnchor, lastWeekStart: d.lastWeekStart, isCurrent: d.isCurrent, only: 'this-week' })
    const placeItems: PlaceItem[] = placeCards.map((c) => ({
      key: c.key, title: c.task.title,
      from: lineOf.has(c.task.id) ? `${monthWord} · ${lineOf.get(c.task.id)}` : 'Not under a line',
      onPlace: (day: Date) => d.actions.placeOnDay(c, day),
    }))
    const end = new Date(d.weekAnchor.getFullYear(), d.weekAnchor.getMonth(), d.weekAnchor.getDate() + 7)
    const placedCount = d.pool.filter((t) => !t.completed && t.scheduledFor && t.scheduledFor >= d.weekAnchor && t.scheduledFor < end).length

    return {
      tree,
      monthWord,
      lines: tree.lines.map(lineView),
      doneLines: tree.doneLines.map(lineView),
      loose: tree.loose.map(looseView),
      onAddLoose: addUnder(null, 'Add to this week'),
      onDropIn: async (title: string): Promise<string | false> => {
        const line = lineFor(title, tree.lines)
        const saved = await addUnder(line?.task ?? null, line ? `Add “${title}” under “${line.task.title}”` : `Add “${title}” to this week`)(title)
        return saved ? (line ? `under “${line.task.title}”` : 'to Not under a line') : false
      },
      placeItems,
      placedCount,
      /** Last week's leftovers nobody answered (the drain at the end). */
      unanswered: tree.lines.flatMap(function all(l: ChooseLine | ChooseNode): Task[] {
        const kids = 'steps' in l ? l.steps : l.children
        return [...(l.planned.kind === 'last' ? [l.task] : []), ...kids.flatMap(all)]
      }).concat(tree.loose.filter((x) => x.source === 'last').map((x) => x.task)),
    }
  }, [d, activity, monthWord])
}
