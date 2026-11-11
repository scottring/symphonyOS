import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MessageBuffer } from './buffer'

const msg = (iso: string, text: string) => ({ timestamp: new Date(iso), sender: 'A', text })

describe('MessageBuffer', () => {
  it('collects per source and drains only that source', () => {
    const b = new MessageBuffer()
    b.add('whatsapp:one', msg('2026-08-25T12:00:00Z', 'a'))
    b.add('whatsapp:two', msg('2026-08-25T12:01:00Z', 'b'))
    expect(b.drain('whatsapp:one').map((m) => m.text)).toEqual(['a'])
    expect(b.drain('whatsapp:two').map((m) => m.text)).toEqual(['b'])
  })

  it('empties on drain so a delivered batch is never sent twice', () => {
    const b = new MessageBuffer()
    b.add('s', msg('2026-08-25T12:00:00Z', 'a'))
    b.drain('s')
    expect(b.drain('s')).toEqual([])
  })

  it('restores a batch when delivery failed, ahead of anything that arrived since', () => {
    const b = new MessageBuffer()
    const failed = [msg('2026-08-25T12:00:00Z', 'older')]
    b.add('s', msg('2026-08-25T12:05:00Z', 'newer'))
    b.restore('s', failed)
    expect(b.drain('s').map((m) => m.text)).toEqual(['older', 'newer'])
  })

  it('lists only sources holding messages', () => {
    const b = new MessageBuffer()
    b.add('s', msg('2026-08-25T12:00:00Z', 'a'))
    expect(b.keys()).toEqual(['s'])
    b.drain('s')
    expect(b.keys()).toEqual([])
  })

  // 2026-11-11: WhatsApp keeps no history the worker can re-read, so a restart
  // used to lose the day's messages. The buffer now lives on the volume.
  it('survives a restart: a new buffer on the same file has what the old one held', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'buf-')), 'buffer.json')
    const a = new MessageBuffer(file)
    a.add('whatsapp:one', msg('2026-11-11T12:00:00Z', 'kept'))
    a.add('whatsapp:two', msg('2026-11-11T12:01:00Z', 'sent'))
    a.drain('whatsapp:two')
    const b = new MessageBuffer(file)
    b.load()
    expect(b.keys()).toEqual(['whatsapp:one'])
    const [m] = b.drain('whatsapp:one')
    expect(m!.text).toBe('kept')
    expect(m!.timestamp).toBeInstanceOf(Date)
  })

  it('a missing file is an empty buffer', () => {
    const b = new MessageBuffer(join(tmpdir(), 'no-such-dir-xyz', 'buffer.json'))
    b.load()
    expect(b.keys()).toEqual([])
  })

  it('keeps a message with an id once', () => {
    const b = new MessageBuffer()
    expect(b.add('s', { ...msg('2026-11-11T12:00:00Z', 'a'), id: 'X' })).toBe(true)
    expect(b.add('s', { ...msg('2026-11-11T12:00:00Z', 'a'), id: 'X' })).toBe(false)
    expect(b.drain('s')).toHaveLength(1)
  })
})
