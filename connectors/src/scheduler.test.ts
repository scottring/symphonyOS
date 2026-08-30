import { describe, it, expect, vi } from 'vitest'
import { dueNow, flushAll } from './scheduler'
import { MessageBuffer } from './buffer'
import { HighWaterStore } from './highWater'
import type { Config, WatchedSource } from './types'

const config: Config = {
  supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'svc', captureSecret: 'sec',
  userEmail: 'a@b.com', userId: 'u-1', timezone: 'America/New_York',
  stateDir: '/tmp', flushHoursLocal: [17], digestTo: [],
}
const sources: WatchedSource[] = [
  { connector: 'whatsapp', sourceKey: 'whatsapp:120@g.us', sourceLabel: '3B Parents' },
  { connector: 'classdojo', sourceKey: 'classdojo:3-01', sourceLabel: '3-01 Ms. Reynolds' },
]
const msg = (iso: string, text: string) => ({ timestamp: new Date(iso), sender: 'A', text })

describe('dueNow', () => {
  it('fires at the configured local hour', () => {
    // 21:00Z = 17:00 in New York (EDT).
    expect(dueNow(new Date('2026-08-25T21:00:00Z'), config.timezone, [17], null)).toBe(true)
  })

  it('does not fire at an unconfigured hour', () => {
    expect(dueNow(new Date('2026-08-25T14:00:00Z'), config.timezone, [17], null)).toBe(false)
  })

  it('does not fire twice within the same hour', () => {
    expect(dueNow(new Date('2026-08-25T21:30:00Z'), config.timezone, [17], 17)).toBe(false)
  })
})

describe('flushAll', () => {
  const store = () => {
    const s = new HighWaterStore('/tmp/ignored.json')
    vi.spyOn(s, 'set').mockResolvedValue(undefined)
    return s
  }

  it('sends every source in one digest and advances each mark', async () => {
    const buffer = new MessageBuffer()
    buffer.add('whatsapp:120@g.us', msg('2026-08-25T13:00:00Z', 'Picture day'))
    buffer.add('classdojo:3-01', msg('2026-08-25T15:00:00Z', 'Folder home'))
    const highWater = store()
    const sendImpl = vi.fn(async () => ({
      delivered: true,
      newest: new Map([
        ['whatsapp:120@g.us', new Date('2026-08-25T13:00:00Z')],
        ['classdojo:3-01', new Date('2026-08-25T15:00:00Z')],
      ]),
    }))

    const r = await flushAll({ buffer, sources, config, highWater, sendImpl: sendImpl as never })

    expect(sendImpl).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ delivered: 2, failed: 0 })
    expect(highWater.set).toHaveBeenCalledWith('whatsapp:120@g.us', new Date('2026-08-25T13:00:00Z'))
    expect(highWater.set).toHaveBeenCalledWith('classdojo:3-01', new Date('2026-08-25T15:00:00Z'))
    expect(buffer.keys()).toEqual([])
  })

  it('restores every batch and leaves the marks alone when the send fails', async () => {
    const buffer = new MessageBuffer()
    buffer.add('whatsapp:120@g.us', msg('2026-08-25T13:00:00Z', 'Picture day'))
    buffer.add('classdojo:3-01', msg('2026-08-25T15:00:00Z', 'Folder home'))
    const highWater = store()
    const sendImpl = vi.fn(async () => ({ delivered: false, newest: new Map(), error: '500' }))

    const r = await flushAll({ buffer, sources, config, highWater, sendImpl: sendImpl as never })

    expect(r).toEqual({ delivered: 0, failed: 2 })
    expect(highWater.set).not.toHaveBeenCalled()
    // Still queued for the next tick — nothing was lost.
    expect(buffer.drain('whatsapp:120@g.us')).toHaveLength(1)
    expect(buffer.drain('classdojo:3-01')).toHaveLength(1)
  })

  it('does not call out when nothing is buffered', async () => {
    const sendImpl = vi.fn()
    const r = await flushAll({
      buffer: new MessageBuffer(), sources, config, highWater: store(), sendImpl: sendImpl as never,
    })
    expect(sendImpl).not.toHaveBeenCalled()
    expect(r).toEqual({ delivered: 0, failed: 0 })
  })
})
