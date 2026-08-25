import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HighWaterStore } from './highWater'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'hw-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('HighWaterStore', () => {
  it('returns null for a source it has never seen', async () => {
    const s = new HighWaterStore(join(dir, 'marks.json'))
    await s.load()
    expect(s.get('whatsapp:one')).toBeNull()
  })

  it('persists a mark across instances', async () => {
    const path = join(dir, 'marks.json')
    const a = new HighWaterStore(path)
    await a.load()
    await a.set('whatsapp:one', new Date('2026-08-25T12:00:00Z'))

    const b = new HighWaterStore(path)
    await b.load()
    expect(b.get('whatsapp:one')?.toISOString()).toBe('2026-08-25T12:00:00.000Z')
  })

  it('tolerates a missing file on first boot', async () => {
    const s = new HighWaterStore(join(dir, 'nested', 'marks.json'))
    await expect(s.load()).resolves.toBeUndefined()
  })

  it('never moves a mark backwards', async () => {
    const s = new HighWaterStore(join(dir, 'marks.json'))
    await s.load()
    await s.set('s', new Date('2026-08-25T12:00:00Z'))
    await s.set('s', new Date('2026-08-24T12:00:00Z'))
    expect(s.get('s')?.toISOString()).toBe('2026-08-25T12:00:00.000Z')
  })
})
