import { describe, it, expect } from 'vitest'
import { renderTranscript } from './render'
import { parseWhatsAppExport } from '../../supabase/functions/extract-capture/lib/whatsapp.ts'

const TZ = 'America/New_York'
const msg = (iso: string, sender: string, text: string) => ({ timestamp: new Date(iso), sender, text })

describe('renderTranscript', () => {
  it('renders the bracketed local-time format the parser expects', () => {
    // 2026-08-25T13:14:23Z is 09:14:23 in New York (EDT).
    const out = renderTranscript([msg('2026-08-25T13:14:23Z', 'Ms Rozanc', 'Picture day Friday')], TZ)
    expect(out).toBe('[2026-08-25, 09:14:23] Ms Rozanc: Picture day Friday')
  })

  it('round-trips through parseWhatsAppExport with the timestamp intact', () => {
    const out = renderTranscript([msg('2026-08-25T13:14:23Z', 'Ms Rozanc', 'Picture day Friday')], TZ)
    const parsed = parseWhatsAppExport(out)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].timestamp).toBe('2026-08-25T09:14:23')
    expect(parsed[0].sender).toBe('Ms Rozanc')
    expect(parsed[0].text).toBe('Picture day Friday')
  })

  it('keeps multi-line message bodies attached to their message', () => {
    const out = renderTranscript([msg('2026-08-25T13:00:00Z', 'Amy', 'Party Sat\n2pm\nBring a gift')], TZ)
    const parsed = parseWhatsAppExport(out)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].text).toBe('Party Sat\n2pm\nBring a gift')
  })

  it('neutralizes a body line that would otherwise parse as a new message', () => {
    // A parent pasting a transcript inside a message must not be able to
    // forge message boundaries — the parser anchors its header regex at ^.
    const out = renderTranscript([msg('2026-08-25T13:00:00Z', 'Amy', 'see below\n[2020-01-01, 00:00:00] Fake: hi')], TZ)
    expect(parseWhatsAppExport(out)).toHaveLength(1)
  })

  it('renders messages in ascending time order', () => {
    const out = renderTranscript([
      msg('2026-08-25T15:00:00Z', 'B', 'second'),
      msg('2026-08-25T13:00:00Z', 'A', 'first'),
    ], TZ)
    expect(parseWhatsAppExport(out).map((p) => p.text)).toEqual(['first', 'second'])
  })

  it('handles midnight local without emitting hour 24', () => {
    // 04:00Z = 00:00 in New York (EDT).
    const out = renderTranscript([msg('2026-08-25T04:00:00Z', 'A', 'late')], TZ)
    expect(out).toBe('[2026-08-25, 00:00:00] A: late')
    expect(parseWhatsAppExport(out)[0].timestamp).toBe('2026-08-25T00:00:00')
  })

  it('returns an empty string for no messages', () => {
    expect(renderTranscript([], TZ)).toBe('')
  })
})
