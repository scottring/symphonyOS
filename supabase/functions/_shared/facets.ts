/** Edge-side facet validator — twin of src/types/facets.ts.
 *  Accepts either parsed JSON or raw model text (with markdown fences).
 *  Keep the two in sync. */

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

export function tryParseFacets(raw: unknown): Facet[] | null {
  let value = raw
  if (typeof raw === 'string') {
    // Strip markdown fences and trim
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    try {
      value = JSON.parse(jsonStr)
    } catch {
      // JSON parse failure: structural error
      return null
    }
  }

  // If value is wrapped in {facets: [...]}, extract the array
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const wrapped = value as Record<string, unknown>
    if (Array.isArray(wrapped.facets)) {
      value = wrapped.facets
    } else {
      // Object exists but no facets array: structural error
      return null
    }
  }

  // Now validate the array
  if (!Array.isArray(value)) return null
  return value.map(parseOne).filter((f): f is Facet => f !== null).slice(0, MAX_FACETS)
}

export function parseFacets(raw: unknown): Facet[] {
  return tryParseFacets(raw) ?? []
}
