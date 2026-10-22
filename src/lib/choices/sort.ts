import type { ChoiceOption, CellValue } from '@/types/choice'

export type SortKey = { kind: 'name' } | { kind: 'price' } | { kind: 'column'; columnId: string }

type Sortable = string | number | boolean | null

const blank = (v: Sortable | undefined): v is null | undefined => v == null || v === ''

function compare(a: Sortable, b: Sortable): number {
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? -1 : 1 // true first
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
}

/** Ruled-out options are left out by the caller. Blanks sort last; ties keep sortOrder. */
export function sortOptions(
  options: readonly ChoiceOption[],
  key: SortKey | null,
  priceOf: (o: ChoiceOption) => number | null,
): ChoiceOption[] {
  const bySortOrder = (a: ChoiceOption, b: ChoiceOption) => a.sortOrder - b.sortOrder
  const out = [...options].sort(bySortOrder)
  if (!key) return out
  const valueOf = (o: ChoiceOption): Sortable | undefined =>
    key.kind === 'name' ? o.name : key.kind === 'price' ? priceOf(o) : (o.values[key.columnId] as CellValue | undefined)
  return out.sort((a, b) => {
    const va = valueOf(a), vb = valueOf(b)
    if (blank(va) || blank(vb)) return blank(va) === blank(vb) ? 0 : blank(va) ? 1 : -1
    return compare(va, vb)
  }) // Array.sort is stable, so ties keep the sortOrder from above
}
