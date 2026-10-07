// The line a card shows from a task's notes (design B, 2026-10-07): the first
// words of what was written, as plain text — or nothing, when there is
// nothing worth reading at a glance. Notes arrive as HTML from the editor,
// markdown from captures, or a pasted link; none of that markup belongs on a
// card.

/** Below this many characters a note says nothing a title doesn't. */
const MIN_PREVIEW = 12

export function cardNotePreview(notes: string | null | undefined): string | null {
  if (!notes) return null
  const text = notes
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')                // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')              // links → their words
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')    // headings, quotes, list marks
    .replace(/[*_`~]+/g, '')                              // emphasis, code
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length < MIN_PREVIEW) return null
  // A bare link (or a few) is not a sentence.
  if (/^(https?:\/\/\S+\s*)+$/i.test(text)) return null
  return text
}
