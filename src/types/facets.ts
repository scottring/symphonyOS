/** Closed vocabulary of typed facts extracted from an attachment
 *  (docs/superpowers/specs/2026-07-14-attachment-facets-design.md).
 *  The model proposes; this parser disposes — nothing renders unvalidated.
 *  A twin validator lives in supabase/functions/analyze-attachment (edge
 *  functions can't import from src/) — keep the two in sync. */
export type Facet =
  | { type: 'summary'; text: string }
  | { type: 'location'; label?: string; address: string }
  | { type: 'access_code'; label: string; code: string }
  | { type: 'phone'; label?: string; number: string }
  | { type: 'datetime'; label: string; iso: string }
  | { type: 'link'; label?: string; url: string }
  | { type: 'checklist'; label?: string; items: string[] }
  | { type: 'purchase_item'; name: string; specs: string }

const MAX_FACETS = 12
const MAX_ITEMS = 20

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function parseOne(raw: unknown): Facet | null {
  if (typeof raw !== 'object' || raw === null) return null
  const f = raw as Record<string, unknown>
  const label = str(f.label) ?? undefined
  switch (f.type) {
    case 'summary': {
      const text = str(f.text)
      return text ? { type: 'summary', text } : null
    }
    case 'location': {
      const address = str(f.address)
      return address ? { type: 'location', label, address } : null
    }
    case 'access_code': {
      const code = str(f.code)
      return code ? { type: 'access_code', label: label ?? 'Code', code } : null
    }
    case 'phone': {
      const number = str(f.number)
      return number ? { type: 'phone', label, number } : null
    }
    case 'datetime': {
      const iso = str(f.iso)
      return iso && label ? { type: 'datetime', label, iso } : null
    }
    case 'link': {
      const url = str(f.url)
      return url && /^https?:\/\//.test(url) ? { type: 'link', label, url } : null
    }
    case 'checklist': {
      const items = Array.isArray(f.items)
        ? f.items.map(str).filter((s): s is string => !!s).slice(0, MAX_ITEMS)
        : []
      return items.length ? { type: 'checklist', label, items } : null
    }
    case 'purchase_item': {
      const name = str(f.name)
      const specs = str(f.specs)
      return name && specs ? { type: 'purchase_item', name, specs } : null
    }
    default:
      return null
  }
}

export function parseFacets(raw: unknown): Facet[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseOne).filter((f): f is Facet => f !== null).slice(0, MAX_FACETS)
}
