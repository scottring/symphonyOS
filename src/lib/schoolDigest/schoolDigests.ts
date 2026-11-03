// The kept school digests (migration 20261103120000_school_digests): each
// 5pm digest school-digest emailed, as the sections it rendered. More →
// School digest reads them on the web, the phone and the kitchen wall, so the
// day's school news can be found again after the email is buried.
//
// Pure: the row → digest mapping and the labels. The read is useSchoolDigests.

import { parseDigestResponse, type DigestSection } from '../../../supabase/functions/school-digest/lib/digest.ts'

export type { DigestItem, DigestSection } from '../../../supabase/functions/school-digest/lib/digest.ts'

export interface SchoolDigest {
  id: string
  /** YYYY-MM-DD, the household's day it was written for. */
  date: string
  /** "Tue, Nov 3", as the email's subject had it. */
  label: string
  sections: DigestSection[]
  toDoCount: number
  createdAt: Date
}

export interface SchoolDigestRow {
  id: string
  digest_date: string
  date_label: string
  sections: unknown
  to_do_count: number | null
  created_at: string
}

/** A stored row, through the same validation the email's model reply goes
 *  through — a malformed section is dropped, never rendered half-way. */
export function digestFromRow(row: SchoolDigestRow): SchoolDigest {
  const { sections } = parseDigestResponse(JSON.stringify({ sections: row.sections }))
  return {
    id: row.id,
    date: row.digest_date,
    label: row.date_label,
    sections,
    toDoCount: row.to_do_count ?? sections.reduce((n, s) => n + s.toDo.length, 0),
    createdAt: new Date(row.created_at),
  }
}

/** One digest a day: the newest that day's runs wrote (a retry or a re-run
 *  sends a second email; the later one is the one to keep reading). Rows
 *  arrive newest first. */
export function onePerDay(digests: SchoolDigest[]): SchoolDigest[] {
  const seen = new Set<string>()
  return digests.filter((d) => (seen.has(d.date) ? false : (seen.add(d.date), true)))
}

/** "4 to do" / "Nothing to do". */
export function toDoLabel(n: number): string {
  return n ? `${n} to do` : 'Nothing to do'
}

/** The label a digest goes by beside today: "Today", "Yesterday", or its own. */
export function dayLabel(d: Pick<SchoolDigest, 'date' | 'label'>, todayYmd: string): string {
  if (d.date === todayYmd) return 'Today'
  const t = new Date(`${todayYmd}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() - 1)
  return d.date === t.toISOString().slice(0, 10) ? 'Yesterday' : d.label
}
