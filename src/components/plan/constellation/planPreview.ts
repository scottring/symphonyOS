// src/components/plan/constellation/planPreview.ts
//
// A pending change card, previewed on a Month, Season or Year page (mockup
// frames "After 3–5"), in Week's dashed look: teal for what would arrive or
// change here, grey for what would leave. Nothing here writes.
//
//   plan_add    → a dashed teal row on its list
//   plan_carry  → the item struck, dashed grey, "→ November"; and a dashed
//                 teal row on the list it goes to, when that list is shown
//   plan_let_go → struck, "Let go"
//   plan_done   → struck, "Done" ("Met" for a year goal)
//   done / someday / merge on a month or season goal (the task ops) likewise.
//
// "Shown" is the list on screen; "next" is the following period's list,
// which the page opens beside it while a card adds to or carries into it.

import type { ChangeSet, PlanLevel } from '@/lib/canvas/changeCard'

export interface PeriodSpan {
  /** YYYY-MM-DD, inclusive. */
  start: string
  /** YYYY-MM-DD, exclusive. */
  end: string
  /** "October", "Fall", "2026". */
  label: string
}

export interface PlanPreviewInput {
  set: ChangeSet | null
  level: PlanLevel
  shown: PeriodSpan
  next: PeriodSpan
  /** The items on the shown list (task ids, or goal ids on Year). */
  ids: ReadonlySet<string>
}

export interface PlanMark {
  /** teal: changes here; grey: leaves this list. */
  tone: 'proposed' | 'leaving'
  struck: boolean
  note: string
}

export interface PlanPreviewRow {
  key: string
  title: string
  note: string
  parentTitle?: string
}

export interface PlanPreview {
  /** Existing rows on the shown list, by item id. */
  marks: Map<string, PlanMark>
  /** New dashed rows on the shown list. */
  here: PlanPreviewRow[]
  /** New dashed rows on the next period's list (shown beside while any). */
  next: PlanPreviewRow[]
}

const within = (ymd: string | undefined, span: PeriodSpan) => !!ymd && ymd >= span.start && ymd < span.end

export function planPreview({ set, level, shown, next, ids }: PlanPreviewInput): PlanPreview {
  const marks = new Map<string, PlanMark>()
  const here: PlanPreviewRow[] = []
  const nextRows: PlanPreviewRow[] = []
  if (!set) return { marks, here, next: nextRows }
  const onShown = (itemId?: string, periodStart?: string) =>
    !!itemId && ids.has(itemId) && (!periodStart || within(periodStart, shown))
  const mark = (id: string, m: PlanMark) => { if (!marks.has(id)) marks.set(id, m) }

  for (const op of set.ops) {
    if (op.op.startsWith('plan_')) {
      if (op.level !== level) continue
      if (op.op === 'plan_add') {
        const row = { key: op.key, title: op.title, note: 'New', ...(op.parentTitle ? { parentTitle: op.parentTitle } : {}) }
        if (within(op.periodStart, shown)) here.push(row)
        else if (within(op.periodStart, next)) nextRows.push(row)
        continue
      }
      if (!op.itemId) continue
      if (op.op === 'plan_carry') {
        const to = op.toPeriodLabel ?? 'next'
        if (onShown(op.itemId, op.periodStart)) mark(op.itemId, { tone: 'leaving', struck: true, note: `→ ${to}` })
        const row = { key: op.key, title: op.newTitle ?? op.title, note: op.periodLabel ? `From ${op.periodLabel}` : 'Carried' }
        if (within(op.toPeriodStart, shown) && !ids.has(op.itemId)) here.push(row)
        else if (within(op.toPeriodStart, next)) nextRows.push(row)
        continue
      }
      if (!onShown(op.itemId, op.periodStart)) continue
      if (op.op === 'plan_let_go') mark(op.itemId, { tone: 'leaving', struck: true, note: 'Let go' })
      else if (op.op === 'plan_done') mark(op.itemId, { tone: 'proposed', struck: true, note: level === 'year' ? 'Met' : 'Done' })
      continue
    }
    // Month and season goals are tasks: the card's task ops reach them too.
    if (level === 'year' || !op.taskId) continue
    if (op.op === 'done' && ids.has(op.taskId)) mark(op.taskId, { tone: 'proposed', struck: true, note: 'Done' })
    else if (op.op === 'someday' && ids.has(op.taskId)) mark(op.taskId, { tone: 'leaving', struck: true, note: '→ Someday' })
    else if (op.op === 'merge') {
      if (ids.has(op.taskId)) mark(op.taskId, { tone: 'proposed', struck: false, note: op.fromTitle ? `Merged with “${op.fromTitle}”` : 'Merged' })
      if (op.fromTaskId && ids.has(op.fromTaskId)) mark(op.fromTaskId, { tone: 'leaving', struck: true, note: `Merged into “${op.title}”` })
    }
  }
  return { marks, here, next: nextRows }
}
