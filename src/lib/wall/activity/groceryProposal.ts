// "Add what's missing" as a proposal the cook confirms, item by item
// (conversational canvas, slice 7).
//
// Each line carries its own save state — will add / saving / added /
// didn't save — so a partial failure is visible and Retry touches ONLY the
// lines that failed. Saving is idempotent: before inserting, the list's open
// items are read and any line whose normalized text is already there is
// marked added without a second insert. A retry after an ambiguous failure
// (the insert committed but the response was lost) therefore never creates a
// duplicate.
//
// PURE except `saveGroceryLines`, whose I/O is injected so it tests without a
// network.

export type GroceryLineState = 'will-add' | 'skip' | 'saving' | 'added' | 'failed'

export interface GroceryLine {
  key: string
  text: string
  state: GroceryLineState
  /** True when the line was already on the list (no insert made). */
  alreadyListed?: boolean
}

export interface GroceryProposal {
  /** Where the proposal came from: the dinner card or mid-cooking. */
  origin: 'dinner' | 'cooking'
  lines: GroceryLine[]
}

/** Lower-case, strip punctuation, collapse spaces: "2 Lb  ground turkey." and
 *  "2 lb ground turkey" are the same grocery line. */
export function normalizeGroceryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/½¼¾⅓⅔⅛.\s-]/gu, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A proposal over `texts`; `preselected` decides each line's starting state.
 *  Duplicate lines (same normalized text) collapse to one. */
export function proposeGroceries(
  texts: string[],
  origin: GroceryProposal['origin'],
  preselected = true,
): GroceryProposal {
  const seen = new Set<string>()
  const lines: GroceryLine[] = []
  texts.forEach((raw) => {
    const text = raw.trim()
    const norm = normalizeGroceryText(text)
    if (!norm || seen.has(norm)) return
    seen.add(norm)
    lines.push({ key: `g${lines.length}:${norm}`, text, state: preselected ? 'will-add' : 'skip' })
  })
  return { origin, lines }
}

/** Tap a line: will-add ⇄ skip. Lines that are saving or added don't move. */
export function toggleGroceryLine(p: GroceryProposal, key: string): GroceryProposal {
  return {
    ...p,
    lines: p.lines.map((l) => {
      if (l.key !== key) return l
      if (l.state === 'will-add') return { ...l, state: 'skip' }
      if (l.state === 'skip') return { ...l, state: 'will-add' }
      return l
    }),
  }
}

/** The lines the main button would save now (never a failed one — those wait
 *  for Retry, which is its own explicit command). */
export function linesToAdd(p: GroceryProposal): GroceryLine[] {
  return p.lines.filter((l) => l.state === 'will-add')
}

/** The lines Retry would save: the failed ones, and only those. */
export function linesToRetry(p: GroceryProposal): GroceryLine[] {
  return p.lines.filter((l) => l.state === 'failed')
}

export function markSaving(p: GroceryProposal, keys: string[]): GroceryProposal {
  const set = new Set(keys)
  return { ...p, lines: p.lines.map((l) => (set.has(l.key) ? { ...l, state: 'saving' } : l)) }
}

export interface GroceryLineResult { key: string; ok: boolean; alreadyListed?: boolean }

export function applyGroceryResults(p: GroceryProposal, results: GroceryLineResult[]): GroceryProposal {
  const byKey = new Map(results.map((r) => [r.key, r]))
  return {
    ...p,
    lines: p.lines.map((l) => {
      const r = byKey.get(l.key)
      if (!r) return l
      return r.ok
        ? { ...l, state: 'added', alreadyListed: !!r.alreadyListed }
        : { ...l, state: 'failed' }
    }),
  }
}

export function grocerySummary(p: GroceryProposal): { willAdd: number; saving: number; added: number; failed: number } {
  const count = (s: GroceryLineState) => p.lines.filter((l) => l.state === s).length
  return { willAdd: count('will-add'), saving: count('saving'), added: count('added'), failed: count('failed') }
}

export interface GroceryIO {
  /** The texts of the grocery list's OPEN (not completed) items. Throws on failure. */
  fetchOpenTexts: () => Promise<string[]>
  /** Insert one line; resolves true on success. Must not throw for a row error. */
  insertLine: (text: string, index: number) => Promise<boolean>
}

/**
 * Save `lines` idempotently. Reads the list's open items once; a line already
 * there is reported added (alreadyListed) with no insert. Every other line is
 * inserted on its own so one failure can't sink the rest. When the read
 * itself fails nothing is inserted (we can't prove there'd be no duplicate)
 * and every line reports failed, ready for Retry.
 */
export async function saveGroceryLines(lines: GroceryLine[], io: GroceryIO): Promise<GroceryLineResult[]> {
  let existing: Set<string>
  try {
    existing = new Set((await io.fetchOpenTexts()).map(normalizeGroceryText))
  } catch {
    return lines.map((l) => ({ key: l.key, ok: false }))
  }
  return Promise.all(lines.map(async (l, i): Promise<GroceryLineResult> => {
    const norm = normalizeGroceryText(l.text)
    if (existing.has(norm)) return { key: l.key, ok: true, alreadyListed: true }
    try {
      const ok = await io.insertLine(l.text, i)
      return { key: l.key, ok }
    } catch {
      return { key: l.key, ok: false }
    }
  }))
}
