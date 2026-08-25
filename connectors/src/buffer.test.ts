import { describe, it, expect } from 'vitest'
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
})
