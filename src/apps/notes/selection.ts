// Which notes a click adds to a selection.
//
// Kept out of the component because it is a rule, not markup: a plain click
// toggles one note, a shift-click takes the run from the last one you picked
// to this one. The run is read in the order the stream is READ — flattened
// across the date margins — so "from the potluck note down to the school
// digest" means what it looks like on screen.

/** The selection after clicking `id`, given what was picked last. */
export function pickNotes(
  selected: ReadonlySet<string>,
  order: readonly string[],
  id: string,
  { extend, lastPicked }: { extend: boolean; lastPicked: string | null },
): Set<string> {
  const next = new Set(selected)

  if (extend && lastPicked) {
    const from = order.indexOf(lastPicked)
    const to = order.indexOf(id)
    if (from !== -1 && to !== -1) {
      const [lo, hi] = from < to ? [from, to] : [to, from]
      // A run ADDS; it never clears what you already had, so two runs in
      // different parts of the stream can be deleted in one go.
      for (const runId of order.slice(lo, hi + 1)) next.add(runId)
      return next
    }
  }

  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
