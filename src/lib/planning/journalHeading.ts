// src/lib/planning/journalHeading.ts
//
// The week's words for the one-line heading (JournalHeading, 2026-11-11):
// its days big ("7–13"), then the month and year it sits in: "November
// 2026", "Nov – Dec 2026", "Dec 2026 – Jan 2027".

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
const long = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' })

export function monthsTitle(start: Date, last: Date): string {
  if (start.getFullYear() !== last.getFullYear()) return `${short(start)} ${start.getFullYear()} – ${short(last)} ${last.getFullYear()}`
  if (start.getMonth() !== last.getMonth()) return `${short(start)} – ${short(last)} ${start.getFullYear()}`
  return `${long(start)} ${start.getFullYear()}`
}
