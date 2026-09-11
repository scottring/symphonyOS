// The one place a note's heading is decided.
//
// A note's body is HTML (Tiptap writes it, the Supernote ingest writes it),
// and most notes have no title of their own. Every surface that showed a note
// used to slice the first line off that raw string, which meant an untitled
// note headed itself "<p><strong>OVERALL PROCESS</strong></p><ul>…" — markup,
// not words. Read the text out of the markup first, then take its first line.

import { htmlToPlainText } from './htmlUtils'

/** The note's own title, else the first legible line of its body. */
export function noteHeading(
  title: string | null | undefined,
  content: string | null | undefined,
  fallback = 'Untitled note',
): string {
  const own = title?.trim()
  if (own) return own

  const text = htmlToPlainText(content ?? '')
  const line = text.split('\n').find((l) => l.trim().length > 0)
  return line?.trim() || fallback
}

/** What's left of the note once its heading has been used.
 *
 *  A note whose heading came from its own title (or from the task it hangs
 *  off) still has its whole body to show; one that borrowed its first line
 *  shows the lines after it. Jotted lines are joined with a separator so the
 *  preview never runs two of them together — "OVERALL PROCESSIn NFC app" is
 *  what happens when block markup is stripped without one. */
export function noteExcerpt(
  title: string | null | undefined,
  content: string | null | undefined,
  headingIsOwn = false,
): string {
  const lines = htmlToPlainText(content ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const rest = headingIsOwn || title?.trim() ? lines : lines.slice(1)
  return rest.join(' · ')
}
