export function relativeStart(start: Date, now: Date): string {
  const diffMin = Math.round((start.getTime() - now.getTime()) / 60000)
  if (Math.abs(diffMin) <= 5) return 'Now'
  if (diffMin < 0) return ''
  if (diffMin <= 90) return `Starts in ${diffMin} min`
  if (start.toDateString() === now.toDateString()) return `Starts in ${Math.round(diffMin / 60)} hr`
  return ''
}
