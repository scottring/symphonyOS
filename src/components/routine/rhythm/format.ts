export function formatClock(t: string | null): string | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return null
  const hour12 = h % 12 || 12
  return m ? `${hour12}:${String(m).padStart(2, '0')}` : `${hour12}`
}

export function formatRange(start: string | null, end: string | null): string | null {
  const s = formatClock(start)
  const e = formatClock(end)
  if (!s) return null
  if (!e || e === s) return s
  return `${s} – ${e}`
}
