// src/lib/choices/edits.ts
//
// One person's single change, applied onto a fresh read of a choice's JSON
// lists (columns, work, selected work) or an option's values. The page writes
// these lists whole, so each write re-reads the row first and changes only
// what this edit touched: a partner's edit made since the page loaded stays.
// Undo is the same kind of single change, the other way.

import type { CellValue, ChoiceColumn, WorkPiece } from '@/types/choice'

/** One value set (null or undefined removes it). */
export function withValue(values: Readonly<Record<string, CellValue>>, key: string, value: CellValue | undefined): Record<string, CellValue> {
  const next = { ...values }
  if (value === null || value === undefined) delete next[key]
  else next[key] = value
  return next
}

/** A column added (once; already there is left as it is). */
export const withColumn = (cols: readonly ChoiceColumn[], col: ChoiceColumn): ChoiceColumn[] =>
  cols.some((c) => c.id === col.id) ? [...cols] : [...cols, col]

/** A column renamed; null when it is no longer there. */
export const renamedColumn = (cols: readonly ChoiceColumn[], id: string, label: string): ChoiceColumn[] | null =>
  cols.some((c) => c.id === id) ? cols.map((c) => (c.id === id ? { ...c, label } : c)) : null

export const withoutColumn = (cols: readonly ChoiceColumn[], id: string): ChoiceColumn[] => cols.filter((c) => c.id !== id)

/** A removed column put back where it was (Undo of a remove). */
export function restoredColumn(cols: readonly ChoiceColumn[], col: ChoiceColumn, index: number): ChoiceColumn[] {
  if (cols.some((c) => c.id === col.id)) return [...cols]
  const next = [...cols]
  next.splice(Math.min(Math.max(index, 0), next.length), 0, col)
  return next
}

/** One piece selected or not, in the work's order. */
export const withSelected = (work: readonly WorkPiece[], selected: readonly string[], id: string, on: boolean): string[] =>
  work.filter((p) => (p.id === id ? on : selected.includes(p.id))).map((p) => p.id)

/** What an Edit-the-work save changed, against the list it started from. */
export interface WorkDiff {
  added: WorkPiece[]
  removed: { piece: WorkPiece; index: number; selected: boolean }[]
  changed: { before: WorkPiece; after: WorkPiece }[]
}

const samePiece = (a: WorkPiece, b: WorkPiece) => a.label === b.label && (a.description ?? '') === (b.description ?? '')

export function workDiff(before: readonly WorkPiece[], selected: readonly string[], next: readonly WorkPiece[]): WorkDiff {
  const nextById = new Map(next.map((p) => [p.id, p]))
  const beforeIds = new Set(before.map((p) => p.id))
  return {
    added: next.filter((p) => !beforeIds.has(p.id)),
    removed: before.flatMap((piece, index) => (nextById.has(piece.id) ? [] : [{ piece, index, selected: selected.includes(piece.id) }])),
    changed: before.flatMap((b) => {
      const a = nextById.get(b.id)
      return a && !samePiece(a, b) ? [{ before: b, after: a }] : []
    }),
  }
}

export interface WorkLists { work: WorkPiece[]; selectedWork: string[] }

/** The save, onto the work as it is now. A first list of pieces starts all
 *  selected, so prices show at once; a piece added to existing work does not. */
export function applyWorkDiff(fresh: WorkLists, d: WorkDiff): WorkLists {
  const gone = new Set(d.removed.map((r) => r.piece.id))
  const changed = new Map(d.changed.map((c) => [c.after.id, c.after]))
  const kept = fresh.work.filter((p) => !gone.has(p.id)).map((p) => changed.get(p.id) ?? p)
  const ids = new Set(kept.map((p) => p.id))
  const work = [...kept, ...d.added.filter((p) => !ids.has(p.id))]
  const selectedWork = fresh.work.length === 0
    ? work.map((p) => p.id)
    : fresh.selectedWork.filter((id) => work.some((p) => p.id === id))
  return { work, selectedWork }
}

/** Undo of the save, onto the work as it is now: added pieces out, changed
 *  ones back as they were, removed ones back where they were (selected again
 *  if they were). */
export function revertWorkDiff(fresh: WorkLists, d: WorkDiff): WorkLists {
  const added = new Set(d.added.map((p) => p.id))
  const before = new Map(d.changed.map((c) => [c.before.id, c.before]))
  const work = fresh.work.filter((p) => !added.has(p.id)).map((p) => before.get(p.id) ?? p)
  for (const r of [...d.removed].sort((a, b) => a.index - b.index)) {
    if (!work.some((p) => p.id === r.piece.id)) work.splice(Math.min(r.index, work.length), 0, r.piece)
  }
  const back = new Set(d.removed.filter((r) => r.selected).map((r) => r.piece.id))
  const selectedWork = work.filter((p) => !added.has(p.id) && (fresh.selectedWork.includes(p.id) || back.has(p.id))).map((p) => p.id)
  return { work, selectedWork }
}
