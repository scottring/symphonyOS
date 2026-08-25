import { describe, it, expect, vi } from 'vitest'
import { dueNow, flushAll } from './scheduler'
import { MessageBuffer } from './buffer'
import { HighWaterStore } from './highWater'
import type { Config, WatchedSource } from './types'

const config: Config = {
  supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'svc', captureSecret: 'sec',
  userEmail: 'a@b.com', userId: 'u-1', timezone: 'America/New_York',
  stateDir: '/tmp', flushHoursLocal: [12, 20],
}
const sources: WatchedSource[] = [
  { connector: 'whatsapp', sourceKey: 'whatsapp:120@g.us', sourceLabel: '3B Parents' },
]
const msg = (iso: string, text: string) => ({ timestamp: new Date(iso), sender: 'A', text })

describe('dueNow', () => {
  it('fires at a configured local hour', () => {
    // 16:00Z = 12:00 in New York (EDT).
    expect(dueNow(new Date('2026-08-25T16:00:00Z'), config.timezone, [12, 20], null)).toBe(true)
  })

  it('does not fire at an unconfigured hour', () => {
    expect(dueNow(new Date('2026-08-25T14:00:00Z'), config.timezone, [12, 20], null)).toBe(false)
  })

  it('does not fire twice within the same hour', () => {
    expect(dueNow(new Date('2026-08-25T16:30:00Z'), config.timezone, [12, 20], 12)).toBe(false)
  })

  it('fires again at the next configured hour', () => {
    // 00:00Z on the 26th = 20:00 on the 25th in New York.
    expect(dueNow(new Date('2026-08-26T00:00:00Z'), config.timezone, [12, 20], 12)).toBe(true)
  })
})

describe('flushAll', () => {
  const store = () => {
    const s = new HighWaterStore('/tmp/ignored.json')
    vi.spyOn(s, 'set').mockResolvedValue(undefined)
    return s
  }

  it('delivers each source that has messages and advances its mark', async () => {
    const buffer = new MessageBuffer()
    buffer.add('whatsapp:120@g.us', msg('2026-08-25T13:00:00Z', 'Picture day'))
    const highWater = store()
    const deliverImpl = vi.fn(async () => ({ delivered: true, newest: new Date('2026-08-25T13:00:00Z') }))

    const r = await flushAll({ buffer, sources, config, highWater, deliverImpl: deliverImpl as never })

    expect(r).toEqual({ delivered: 1, failed: 0 })
    expect(highWater.set).toHaveBeenCalledWith('whatsapp:120@g.us', new Date('2026-08-25T13:00:00Z'))
    expect(buffer.keys()).toEqual([])
  })

  it('restores the batch and leaves the mark alone when delivery fails', async () => {
    const buffer = new MessageBuffer()
    buffer.add('whatsapp:120@g.us', msg('2026-08-25T13:00:00Z', 'Picture day'))
    const highWater = store()
    const deliverImpl = vi.fn(async () => ({ delivered: false, newest: null, error: '500' }))

    const r = await flushAll({ buffer, sources, config, highWater, deliverImpl: deliverImpl as never })

    expect(r).toEqual({ delivered: 0, failed: 1 })
    expect(highWater.set).not.toHaveBeenCalled()
    // The batch is still queued for the next tick — nothing was lost.
    expect(buffer.drain('whatsapp:120@g.us')).toHaveLength(1)
  })

  it('skips a source with nothing buffered without calling out', async () => {
    const deliverImpl = vi.fn()
    const r = await flushAll({
      buffer: new MessageBuffer(), sources, config, highWater: store(), deliverImpl: deliverImpl as never,
    })
    expect(deliverImpl).not.toHaveBeenCalled()
    expect(r).toEqual({ delivered: 0, failed: 0 })
  })
})
