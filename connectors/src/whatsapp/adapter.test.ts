import { describe, it, expect, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { attachReceiver, backoffMs, superviseSocket, toConnectorMessage, type RawMessage, type SocketLike } from './adapter'
import { MessageBuffer } from '../buffer'
import type { WatchedSource } from '../types'

const WATCHED: WatchedSource[] = [
  { connector: 'whatsapp', sourceKey: 'whatsapp:120@g.us', sourceLabel: '3B Parents' },
]

const raw = (over: Partial<RawMessage> = {}): RawMessage => ({
  key: { remoteJid: '120@g.us', fromMe: false },
  pushName: 'Amy',
  messageTimestamp: 1787662800, // 2026-08-25T13:00:00Z
  message: { conversation: 'Picture day Friday' },
  ...over,
})

/** A socket that explodes if anything tries to write. Any send, receipt or
 * presence call fails the test loudly instead of silently shipping. */
function trapSocket(): SocketLike & { handlers: Map<string, (a: unknown) => void> } {
  const handlers = new Map<string, (a: unknown) => void>()
  const boom = (name: string) => () => { throw new Error(`FORBIDDEN WRITE: ${name}`) }
  return {
    ev: { on: (e: string, h: (a: unknown) => void) => { handlers.set(e, h) } },
    handlers,
    sendMessage: boom('sendMessage'),
    readMessages: boom('readMessages'),
    sendPresenceUpdate: boom('sendPresenceUpdate'),
    chatModify: boom('chatModify'),
    groupLeave: boom('groupLeave'),
  } as never
}

describe('toConnectorMessage', () => {
  it('reads a plain conversation message', () => {
    const m = toConnectorMessage(raw())
    expect(m?.sender).toBe('Amy')
    expect(m?.text).toBe('Picture day Friday')
    expect(m?.timestamp.toISOString()).toBe('2026-08-25T13:00:00.000Z')
  })

  it('reads an extended text message', () => {
    const m = toConnectorMessage(raw({ message: { extendedTextMessage: { text: 'Party Sat' } } }))
    expect(m?.text).toBe('Party Sat')
  })

  it('returns null for a message with no text body (media, sticker, reaction)', () => {
    expect(toConnectorMessage(raw({ message: {} }))).toBeNull()
  })

  it('falls back to the jid when pushName is absent', () => {
    expect(toConnectorMessage(raw({ pushName: null }))?.sender).toBe('120@g.us')
  })
})

describe('attachReceiver', () => {
  it('buffers a message from a watched group', () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    sock.handlers.get('messages.upsert')!({ messages: [raw()], type: 'notify' })
    expect(buffer.drain('whatsapp:120@g.us').map((m) => m.text)).toEqual(['Picture day Friday'])
  })

  it('IGNORES a message from an unlisted chat — the allowlist is the privacy boundary', () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    sock.handlers.get('messages.upsert')!({
      messages: [raw({ key: { remoteJid: 'private@s.whatsapp.net', fromMe: false } })],
      type: 'notify',
    })
    expect(buffer.keys()).toEqual([])
  })

  it("ignores Scott's own messages", () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    sock.handlers.get('messages.upsert')!({
      messages: [raw({ key: { remoteJid: '120@g.us', fromMe: true } })],
      type: 'notify',
    })
    expect(buffer.keys()).toEqual([])
  })

  it('ignores history-sync batches, which would replay the whole group', () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    sock.handlers.get('messages.upsert')!({ messages: [raw()], type: 'append' })
    expect(buffer.keys()).toEqual([])
  })

  it('never calls a write method on the socket', () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    expect(() => sock.handlers.get('messages.upsert')!({ messages: [raw()], type: 'notify' })).not.toThrow()
  })
})

/** A socket whose connection events the test fires by hand. */
function fakeSocket() {
  const handlers = new Map<string, ((a: unknown) => void)[]>()
  return {
    ev: { on: (e: string, h: (a: unknown) => void) => { handlers.set(e, [...(handlers.get(e) ?? []), h]) } },
    fire: (e: string, a: unknown) => { for (const h of handlers.get(e) ?? []) h(a) },
  }
}
const closed = (statusCode: number) => ({ connection: 'close', lastDisconnect: { error: { output: { statusCode } } } })
const settle = () => new Promise((r) => setTimeout(r, 0))

// 2026-11-08: the worker exited on every close and Fly stopped restarting it
// after ten, so the 5pm school digest (and the wall's homework) went silent.
describe('superviseSocket — a dropped link reconnects in place', () => {
  it('reconnects after a close, re-wires the new socket, and never exits', async () => {
    const socks = [fakeSocket(), fakeSocket()]
    const wired: unknown[] = []
    const waits: number[] = []
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exited') }) as never)
    await superviseSocket({
      connect: async () => socks[wired.length]!,
      onSocket: (s) => { wired.push(s) },
      wait: async (ms) => { waits.push(ms) },
    })
    socks[0]!.fire('connection.update', closed(503))
    await settle()
    expect(wired).toEqual([socks[0], socks[1]])
    expect(waits).toEqual([backoffMs(0)])
    expect(exit).not.toHaveBeenCalled()
    exit.mockRestore()
  })

  it('an unlinked device sets its old link aside so the next connect pairs afresh', async () => {
    const socks = [fakeSocket(), fakeSocket()]
    let n = 0
    const down: unknown[] = []
    const onUnlinked = vi.fn(async () => {})
    await superviseSocket({
      connect: async () => socks[n++]!,
      onSocket: () => {},
      onDown: (why) => { down.push(why) },
      onUnlinked,
      wait: async () => {},
    })
    socks[0]!.fire('connection.update', closed(401))
    await settle()
    expect(down).toEqual([{ unlinked: true, status: 401 }])
    expect(onUnlinked).toHaveBeenCalledOnce()
    expect(n).toBe(2)
  })

  it('keeps trying when a reconnect itself fails, and backs off', async () => {
    const socks = [fakeSocket(), fakeSocket()]
    let calls = 0
    const waits: number[] = []
    await superviseSocket({
      connect: async () => {
        calls++
        if (calls === 2) throw new Error('offline')
        return calls === 1 ? socks[0]! : socks[1]!
      },
      onSocket: () => {},
      wait: async (ms) => { waits.push(ms) },
    })
    socks[0]!.fire('connection.update', closed(428))
    await settle(); await settle()
    expect(calls).toBe(3)
    expect(waits).toEqual([backoffMs(0), backoffMs(1)])
  })

  it('backs off from 5 seconds to a 5-minute ceiling', () => {
    expect(backoffMs(0)).toBe(5_000)
    expect(backoffMs(1)).toBe(10_000)
    expect(backoffMs(20)).toBe(300_000)
  })
})

describe('the send lockout is structural', () => {
  it('the adapter source contains no outbound-write call', async () => {
    const src = await readFile(resolve('connectors/src/whatsapp/adapter.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '') // strip comments
    for (const forbidden of [
      'sendMessage', 'sendPresenceUpdate', 'readMessages',
      'chatModify', 'groupLeave', 'groupAcceptInvite', 'updateProfileStatus',
    ]) {
      expect(code, `adapter must never reference ${forbidden}`).not.toContain(forbidden)
    }
  })
})
