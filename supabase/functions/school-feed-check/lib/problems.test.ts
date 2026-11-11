import { describe, it, expect } from 'vitest'
import { alertKey, awake, feedProblems, shouldMail, type HealthRow } from './problems'

const TZ = 'America/New_York'
// Wed Nov 11 2026, 2:00pm in New York (19:00 UTC).
const NOW = new Date('2026-11-11T19:00:00Z')
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
const both = new Set(['whatsapp', 'classdojo'])

const wa = (over: Partial<HealthRow> = {}): HealthRow => ({
  connector: 'whatsapp', last_ok_at: ago(60), last_error: null, last_error_at: null,
  heartbeat_at: ago(3), last_flush_at: '2026-11-10T22:00:05Z', ...over,
})
const dojo = (over: Partial<HealthRow> = {}): HealthRow => ({
  connector: 'classdojo', last_ok_at: '2026-11-10T22:00:05Z', last_error: null, last_error_at: null,
  heartbeat_at: null, last_flush_at: null, ...over,
})
const keys = (rows: HealthRow[], now = NOW, watched = both) => feedProblems(rows, watched, now, TZ).map((p) => p.key)

describe('feedProblems', () => {
  it('says nothing when all is well', () => {
    expect(keys([wa(), dojo()])).toEqual([])
  })

  it('a worker that has stopped beating is the one problem named (Nov 8)', () => {
    expect(keys([wa({ heartbeat_at: ago(45), last_error: 'connection closed (428)', last_error_at: ago(46) }), dojo({ last_error: 'x', last_error_at: ago(50) })]))
      .toEqual(['worker-down'])
  })

  it('an older worker with no heartbeat yet is not judged dead', () => {
    expect(keys([wa({ heartbeat_at: null }), dojo()])).toEqual([])
  })

  it('a WhatsApp blip that reconnects is not mailed', () => {
    expect(keys([wa({ last_ok_at: ago(10), last_error: 'connection closed (408) — reconnecting', last_error_at: ago(11) }), dojo()])).toEqual([])
    expect(keys([wa({ last_ok_at: ago(20), last_error: 'connection closed (408) — reconnecting', last_error_at: ago(2) }), dojo()])).toEqual([])
  })

  it('an unlinked WhatsApp says to re-link in Settings', () => {
    const p = feedProblems([wa({ last_ok_at: ago(120), last_error: 'device unlinked — scan the QR in fly logs', last_error_at: ago(1) }), dojo()], both, NOW, TZ)
    expect(p.map((x) => x.key)).toEqual(['whatsapp-unlinked'])
    expect(p[0].text).toContain('/settings#school-feeds')
  })

  it('a WhatsApp down past the grace is mailed, unless WhatsApp is not watched', () => {
    const rows = [wa({ last_ok_at: ago(90), last_error: 'connection closed (503) — reconnecting', last_error_at: ago(5) }), dojo()]
    expect(keys(rows)).toEqual(['whatsapp-down'])
    expect(keys(rows, NOW, new Set(['classdojo']))).toEqual([])
  })

  it('ClassDojo asking for a code is named as such', () => {
    expect(keys([wa(), dojo({ last_error: 'awaiting one-time code — run otcLogin on the machine', last_error_at: ago(30) })])).toEqual(['classdojo-code'])
    expect(keys([wa(), dojo({ last_error: 'HTTP 500', last_error_at: ago(30) })])).toEqual(['classdojo-down'])
  })

  it('a missed 5pm run is named from 5:45pm, once per day', () => {
    const at545 = new Date('2026-11-11T22:45:00Z') // 5:45pm New York
    const at530 = new Date('2026-11-11T22:30:00Z')
    const row = (flush: string) => [wa({ heartbeat_at: new Date(at545.getTime() - 60_000).toISOString(), last_flush_at: flush }), dojo()]
    expect(keys(row('2026-11-10T22:00:05Z'), at545)).toEqual(['flush-missed-2026-11-11'])
    expect(keys(row('2026-11-10T22:00:05Z'), at530)).toEqual([])
    expect(keys(row('2026-11-11T22:00:04Z'), at545)).toEqual([])
    // A run earlier the same day (a manual catch-up) is not the 5pm run.
    expect(keys(row('2026-11-11T11:23:00Z'), at545)).toEqual(['flush-missed-2026-11-11'])
  })
})

describe('mailing', () => {
  it('mails a new problem, not the same one again within a day, and the end of it once', () => {
    expect(shouldMail('worker-down', null, NOW)).toBe('problem')
    expect(shouldMail('worker-down', { alert_key: 'worker-down', alerted_at: ago(60) }, NOW)).toBeNull()
    expect(shouldMail('worker-down', { alert_key: 'worker-down', alerted_at: ago(25 * 60) }, NOW)).toBe('problem')
    expect(shouldMail('classdojo-code+worker-down', { alert_key: 'worker-down', alerted_at: ago(60) }, NOW)).toBe('problem')
    expect(shouldMail(null, { alert_key: 'worker-down', alerted_at: ago(60) }, NOW)).toBe('resolved')
    expect(shouldMail(null, { alert_key: null, alerted_at: ago(60) }, NOW)).toBeNull()
  })

  it('one key for the set, in a stable order', () => {
    expect(alertKey([{ key: 'b', text: '' }, { key: 'a', text: '' }])).toBe('a+b')
    expect(alertKey([])).toBeNull()
  })

  it('keeps quiet from 10pm to 7am New York time', () => {
    expect(awake(NOW, TZ)).toBe(true)
    expect(awake(new Date('2026-11-12T03:30:00Z'), TZ)).toBe(false) // 10:30pm
    expect(awake(new Date('2026-11-12T12:05:00Z'), TZ)).toBe(true) // 7:05am
  })
})
