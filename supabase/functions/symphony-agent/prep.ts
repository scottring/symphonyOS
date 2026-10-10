// "Prepared to act": helpers for attaching what a task needs.

export interface StoredLink { url: string; title?: string }

/** Append http(s) links to a task's existing links, de-duplicated by URL. */
export function mergeLinks(existing: unknown, add: unknown): StoredLink[] {
  const out: StoredLink[] = []
  const seen = new Set<string>()
  const push = (raw: unknown) => {
    const link = typeof raw === 'string' ? { url: raw } : raw && typeof raw === 'object' ? raw as { url?: unknown; title?: unknown } : null
    if (!link || typeof link.url !== 'string') return
    let url: URL
    try { url = new URL(link.url.trim()) } catch { return }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    const key = url.toString()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ ...(link as object), url: key, ...(typeof link.title === 'string' && link.title.trim() ? { title: link.title.trim().slice(0, 200) } : {}) })
  }
  if (Array.isArray(existing)) existing.forEach(push)
  if (Array.isArray(add)) add.slice(0, 10).forEach(push)
  return out.slice(0, 30)
}

/** Light validation for reach-them fields; returns an error message or null. */
export function contactFieldError(updates: Record<string, unknown>): string | null {
  if (typeof updates.email === 'string' && updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) return 'That email address does not look valid'
  if (typeof updates.phone_number === 'string' && updates.phone_number && !/^[+()\d\s.-]{5,25}$/.test(updates.phone_number)) return 'That phone number does not look valid'
  return null
}
