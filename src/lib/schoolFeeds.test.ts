import { describe, it, expect } from 'vitest'
import { feedStatus, type FeedHealthRow } from './schoolFeeds'

const NOW = new Date('2026-11-11T15:00:00Z')
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
const when = (d: Date) => d.toISOString()
const wa = (over: Partial<FeedHealthRow> = {}): FeedHealthRow => ({
  connector: 'whatsapp', last_ok_at: ago(30), last_error: null, last_error_at: null,
  heartbeat_at: ago(2), last_flush_at: '2026-11-10T22:00:00Z', pair_qr: null, pair_qr_at: null, ...over,
})
const dojo = (over: Partial<FeedHealthRow> = {}): FeedHealthRow => ({
  connector: 'classdojo', last_ok_at: ago(600), last_error: null, last_error_at: null,
  heartbeat_at: null, last_flush_at: null, pair_qr: null, pair_qr_at: null, ...over,
})
const text = (rows: FeedHealthRow[]) => feedStatus(rows, NOW, when).lines.map((l) => `${l.label}: ${l.text}`)

describe('feedStatus (Settings → School feeds)', () => {
  it('all working', () => {
    expect(text([wa(), dojo()])).toEqual(['WhatsApp: Connected', 'ClassDojo: Working', 'Last digest run: 2026-11-10T22:00:00.000Z'])
    expect(feedStatus([wa(), dojo()], NOW, when).needsLink).toBe(false)
  })

  it('an unlinked WhatsApp offers the fresh code to scan, and never a spent one', () => {
    const unlinked = { last_error: 'device unlinked — scan the QR in fly logs', last_error_at: ago(1), last_ok_at: ago(300) }
    const fresh = feedStatus([wa({ ...unlinked, pair_qr: '2@abc', pair_qr_at: ago(0.2) }), dojo()], NOW, when)
    expect(fresh.needsLink).toBe(true)
    expect(fresh.pairQr).toBe('2@abc')
    expect(fresh.lines[0]).toMatchObject({ label: 'WhatsApp', text: 'Needs linking', tone: 'bad' })
    const spent = feedStatus([wa({ ...unlinked, pair_qr: '2@abc', pair_qr_at: ago(3) }), dojo()], NOW, when)
    expect(spent.needsLink).toBe(true)
    expect(spent.pairQr).toBeNull()
  })

  it('a stopped worker says so, and offers no code', () => {
    const s = feedStatus([wa({ heartbeat_at: ago(45), pair_qr: '2@abc', pair_qr_at: ago(0.1) }), dojo()], NOW, when)
    expect(s.lines[0]).toMatchObject({ label: 'Worker', tone: 'bad' })
    expect(s.pairQr).toBeNull()
    expect(s.needsLink).toBe(false)
  })

  it('a WhatsApp reconnecting on its own, and ClassDojo wanting a code', () => {
    expect(text([wa({ last_error: 'connection closed (503) — reconnecting', last_error_at: ago(1) }), dojo({ last_error: 'awaiting one-time code — run otcLogin on the machine', last_error_at: ago(5) })]))
      .toEqual(['WhatsApp: Reconnecting', 'ClassDojo: Needs a new sign-in code', 'Last digest run: 2026-11-10T22:00:00.000Z'])
  })
})
