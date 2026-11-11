import { describe, it, expect, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { attachReceiver, backoffMs, PAIRING_RETRY_MS, superviseSocket, toConnectorMessage, type RawMessage, type SocketLike } from './adapter'
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

  // 2026-11-11: the link was down Nov 7–10 and those messages were lost. The
  // history WhatsApp sends when the phone links again fills the gap — only
  // the gap, never the group's whole backlog.
  describe('history on a fresh link fills the gap', () => {
    const at = (iso: string) => raw({ key: { remoteJid: '120@g.us', fromMe: false, id: iso }, messageTimestamp: Date.parse(iso) / 1000, message: { conversation: iso } })
    const NOW = () => new Date('2026-11-11T11:15:00Z')
    const setup = (since: Date | null) => {
      const buffer = new MessageBuffer()
      const sock = trapSocket()
      attachReceiver(sock, { buffer, sources: () => WATCHED, since: () => since, now: NOW })
      return { buffer, sock }
    }

    it('keeps history newer than the last delivered message, and nothing older', () => {
      const { buffer, sock } = setup(new Date('2026-11-06T22:53:56Z'))
      sock.handlers.get('messaging-history.set')!({ messages: [at('2026-11-06T20:00:00Z'), at('2026-11-08T14:00:00Z'), at('2026-11-10T09:30:00Z')] })
      expect(buffer.drain('whatsapp:120@g.us').map((m) => m.text)).toEqual(['2026-11-08T14:00:00Z', '2026-11-10T09:30:00Z'])
    })

    it('never reaches back more than a week, even with no mark (a first link)', () => {
      const { buffer, sock } = setup(null)
      sock.handlers.get('messages.upsert')!({ messages: [at('2026-10-01T12:00:00Z'), at('2026-11-09T12:00:00Z')], type: 'append' })
      expect(buffer.drain('whatsapp:120@g.us').map((m) => m.text)).toEqual(['2026-11-09T12:00:00Z'])
    })

    it('keeps the allowlist: history from an unlisted chat is never buffered', () => {
      const { buffer, sock } = setup(null)
      sock.handlers.get('messaging-history.set')!({ messages: [raw({ key: { remoteJid: 'private@s.whatsapp.net', fromMe: false, id: 'p' }, messageTimestamp: Date.parse('2026-11-10T12:00:00Z') / 1000 })] })
      expect(buffer.keys()).toEqual([])
    })

    it('a message that came live and again in history is kept once', () => {
      const { buffer, sock } = setup(null)
      const m = at('2026-11-11T11:00:00Z')
      sock.handlers.get('messages.upsert')!({ messages: [m], type: 'notify' })
      sock.handlers.get('messaging-history.set')!({ messages: [m] })
      expect(buffer.drain('whatsapp:120@g.us')).toHaveLength(1)
    })

    it('ignores other upsert kinds (prepend)', () => {
      const { buffer, sock } = setup(null)
      sock.handlers.get('messages.upsert')!({ messages: [at('2026-11-10T12:00:00Z')], type: 'prepend' })
      expect(buffer.keys()).toEqual([])
    })
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

  it('shows each pairing code, clears it once paired, and waits a minute between codes', async () => {
    const socks = [fakeSocket(), fakeSocket(), fakeSocket()]
    let n = 0
    const codes: (string | null)[] = []
    const waits: number[] = []
    await superviseSocket({
      connect: async () => socks[n++]!,
      onSocket: () => {},
      onQr: (qr) => { codes.push(qr) },
      wait: async (ms) => { waits.push(ms) },
    })
    socks[0]!.fire('connection.update', { qr: 'code-1' })
    socks[0]!.fire('connection.update', closed(408)) // nobody scanned
    await settle()
    expect(waits).toEqual([PAIRING_RETRY_MS])
    socks[1]!.fire('connection.update', { qr: 'code-2' })
    socks[1]!.fire('connection.update', closed(515)) // scanned: WhatsApp asks for a restart
    await settle()
    expect(waits[1]).toBeLessThanOrEqual(1_000)
    socks[2]!.fire('connection.update', { connection: 'open' })
    expect(codes).toEqual(['code-1', 'code-2', null])
  })

  it('an unlinked device waits the pairing minute, not the long backoff', async () => {
    const socks = [fakeSocket(), fakeSocket()]
    let n = 0
    const waits: number[] = []
    await superviseSocket({ connect: async () => socks[n++]!, onSocket: () => {}, onUnlinked: async () => {}, wait: async (ms) => { waits.push(ms) } })
    socks[0]!.fire('connection.update', closed(401))
    await settle()
    expect(waits).toEqual([PAIRING_RETRY_MS])
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
