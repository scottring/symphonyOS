// src/lib/today/displayTitle.ts
//
// How a calendar title reads on Today (Scott, 2026-11-13, from a review he
// pasted): invitations often arrive SHOUTED, with the address run on after an
// ellipsis — "KAUFMAN-LEVINER BATH PROJECT...3806 TUDOR ARMS". Today says
// "Kaufman-Leviner Bath Project"; the address is on the event itself.
// Titles typed in normal case are left exactly as written. Display only:
// nothing is written back.

/** Mostly capitals: four or more letters, over 80% of them upper case. */
export function isShouted(title: string): boolean {
  const letters = title.replace(/[^A-Za-z]/g, '')
  if (letters.length < 4) return false
  return letters.replace(/[^A-Z]/g, '').length / letters.length > 0.8
}

export function displayTitle(raw: string): string {
  const title = raw.trim()
  if (!isShouted(title)) return title
  const cut = title.search(/\.{3}|…/)
  const head = (cut > 3 ? title.slice(0, cut) : title).trim()
  return head.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, before: string, c: string) => before + c.toUpperCase())
}

/** "7 AM", "7:30 PM": the margin's clock, no ":00". */
export function marginClock(d: Date): string {
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes()
  return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}
