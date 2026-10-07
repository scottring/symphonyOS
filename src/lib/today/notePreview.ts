// The two lines of a task's note a For today card shows (design B, 2026-10-07:
// "Call Sleep Study — called to schedule; offered the 29th, 30th or 31st…").
// Only when the note says something: a heading, a bare link or a few
// characters is not worth two italic lines under every card.

const MIN_CHARS = 12

/** Plain text of a note (markdown or HTML), headings dropped; null when empty. */
export function notePreview(notes: string | null | undefined): string | null {
  if (!notes) return null
  const text = notes
    // HTML: block ends become line breaks, then tags go.
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, '\n')
    .replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, '’').replace(/&quot;/g, '"')
  const lines = text.split(/\r?\n/)
    .map((l) => l.trim())
    // A heading names the note; the preview is what it says.
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^[-*_]{3,}$/.test(l))
    .map((l) => l
      .replace(/^([-*+]|\d+\.)\s+/, '')            // list markers
      .replace(/^>\s?/, '')                          // quotes
      .replace(/^\[[ xX]\]\s+/, '')                  // checkboxes
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // images
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')      // links → their words
      .replace(/(\*\*|__|\*|_|~~|`)/g, ''))          // emphasis, code
  const out = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (out.length < MIN_CHARS) return null
  if (/^(https?:\/\/|www\.)\S+$/i.test(out)) return null
  return out
}
