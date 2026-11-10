import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { join } from 'node:path'
import { rename } from 'node:fs/promises'
import type { ConnectorMessage, WatchedSource } from '../types.ts'
import type { MessageBuffer } from '../buffer.ts'
import { isWatched } from '../watchlist.ts'

// ════════════════════════════════════════════════════════════════
// WHATSAPP ADAPTER — RECEIVE ONLY.
//
// This module must never gain the ability to write to WhatsApp: no
// messages, reactions, read receipts, presence updates, group joins or
// leaves. That restraint is the entire basis on which linking a companion
// device to a personal account was judged acceptable. Two tests enforce it —
// a trap socket whose write methods throw, and a source scan for forbidden
// tokens. If you need to send something, that is a new design conversation,
// not an edit to this file.
// ════════════════════════════════════════════════════════════════

type Long = { toNumber: () => number }

export interface SocketLike {
  ev: { on: (event: string, handler: (arg: unknown) => void) => void }
}

export interface RawMessage {
  key: { remoteJid?: string | null; fromMe?: boolean | null }
  pushName?: string | null
  messageTimestamp?: number | Long | null
  message?: {
    conversation?: string | null
    extendedTextMessage?: { text?: string | null } | null
  } | null
}

export interface UpsertEvent {
  messages: RawMessage[]
  type: string
}

function seconds(ts: RawMessage['messageTimestamp']): number | null {
  if (typeof ts === 'number') return ts
  if (ts && typeof (ts as Long).toNumber === 'function') return (ts as Long).toNumber()
  return null
}

export function toConnectorMessage(rawMsg: RawMessage): ConnectorMessage | null {
  const text = rawMsg.message?.conversation ?? rawMsg.message?.extendedTextMessage?.text ?? null
  if (!text || text.trim() === '') return null
  const ts = seconds(rawMsg.messageTimestamp)
  if (ts === null) return null
  return {
    timestamp: new Date(ts * 1000),
    sender: rawMsg.pushName?.trim() || rawMsg.key.remoteJid || 'unknown',
    text,
  }
}

/** Subscribe to incoming messages. `sources` is a getter, not a snapshot, so
 * a watchlist edit takes effect without a reconnect. */
export function attachReceiver(
  sock: SocketLike,
  { buffer, sources }: { buffer: MessageBuffer; sources: () => WatchedSource[] },
): void {
  sock.ev.on('messages.upsert', (arg: unknown) => {
    const ev = arg as UpsertEvent
    // 'notify' is a live message. 'append'/'prepend' are history sync, which
    // would replay an entire group's backlog through extraction.
    if (ev.type !== 'notify') return

    for (const rawMsg of ev.messages) {
      const jid = rawMsg.key.remoteJid
      if (!jid || rawMsg.key.fromMe) continue
      const sourceKey = `whatsapp:${jid}`
      // The allowlist gate, applied at RECEIPT. An unlisted conversation
      // never reaches the buffer, so it never reaches memory or the network.
      if (!isWatched(sources(), 'whatsapp', sourceKey)) continue

      const msg = toConnectorMessage(rawMsg)
      if (msg) buffer.add(sourceKey, msg)
    }
  })
}


/** One-time log of the groups this account is in, so their jids can be added
 * to capture_sources. Metadata only: subject and jid, never message content,
 * and never 1:1 chats. */
async function listGroups(sock: { groupFetchAllParticipating: () => Promise<Record<string, { subject?: string }>> }): Promise<void> {
  try {
    const groups = await sock.groupFetchAllParticipating()
    const rows = Object.entries(groups).map(([jid, g]) => `  whatsapp:${jid}  ${g.subject ?? '(no subject)'}`)
    console.log(`\n=== groups visible to this device (${rows.length}) ===\n${rows.join('\n')}\n`)
  } catch (e) {
    console.error('group listing failed:', e)
  }
}

/** What the supervisor does about a dropped connection. */
export type DownReason = { unlinked: boolean; status?: number }

/** Wait before the nth reconnect: 5s doubling to a 5-minute ceiling. */
export function backoffMs(attempt: number): number {
  return Math.min(5_000 * 2 ** attempt, 5 * 60_000)
}

/** Keep a WhatsApp connection alive IN this process.
 *
 * It used to exit on every close and lean on Fly to restart the machine. Fly
 * gives up after ten failed restarts, and on 2026-11-08 a burst of ten closes
 * in two minutes left the machine stopped — no digest email, no homework on
 * the wall — for days, the ClassDojo half dead with it. Now a close only
 * reconnects this socket, with backoff, and the process (and the 5pm digest)
 * keeps running whatever WhatsApp does.
 *
 * `connect` builds a fresh socket; `onSocket` wires each one up (the receiver
 * must be re-attached, a new socket has new events). An unlinked device
 * (loggedOut) cannot reconnect on its old credentials: `onUnlinked` clears
 * them so the next connect prints a fresh pairing QR for a human to scan. */
export async function superviseSocket(opts: {
  connect: () => Promise<SocketLike>
  onSocket: (sock: SocketLike) => void
  onUp?: () => void
  onDown?: (why: DownReason) => void
  onUnlinked?: () => Promise<void>
  wait?: (ms: number) => Promise<void>
}): Promise<void> {
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let attempt = 0

  const reconnect = async (): Promise<void> => {
    for (;;) {
      await wait(backoffMs(attempt++))
      try {
        await open()
        return
      } catch (e) {
        console.error('whatsapp: reconnect failed, trying again:', e)
      }
    }
  }

  const open = async (): Promise<void> => {
    const sock = await opts.connect()
    let down = false
    sock.ev.on('connection.update', (arg: unknown) => {
      const u = arg as { connection?: string; lastDisconnect?: { error?: unknown } }
      if (u.connection === 'open') { attempt = 0; opts.onUp?.(); return }
      if (u.connection !== 'close' || down) return
      down = true
      const status = (u.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode
      const unlinked = status === DisconnectReason.loggedOut
      console.error(
        unlinked
          ? 'whatsapp: device unlinked — scan the new QR in `fly logs` (see connectors/README.md)'
          : `whatsapp: connection closed (${status}) — reconnecting`,
      )
      opts.onDown?.({ unlinked, status })
      void (async () => {
        if (unlinked) await opts.onUnlinked?.().catch((e) => console.error('whatsapp: clearing the old link failed:', e))
        await reconnect()
      })()
    })
    opts.onSocket(sock)
  }

  await open()
}

/** Build the companion-device socket.
 *
 * markOnlineOnConnect: false is load-bearing — a linked device that marks
 * itself online takes over notification delivery from the phone, so the
 * handset would stop showing WhatsApp notifications.
 * syncFullHistory: false keeps the link from dragging every past message
 * through the pipeline on first connect. */
export async function makeReceiveOnlySocket(stateDir: string): Promise<SocketLike> {
  const { state, saveCreds } = await useMultiFileAuthState(join(stateDir, 'wa-auth'))
  const sock = makeWASocket({
    auth: state,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (u: {
    connection?: string
    qr?: string
    lastDisconnect?: { error?: unknown }
  }) => {
    // Baileys no longer prints the pairing QR itself, so we render it. It
    // appears in `fly logs`, which is the only screen this headless box has.
    if (u.qr) {
      console.log('\n=== scan this with WhatsApp -> Linked Devices ===')
      qrcode.generate(u.qr, { small: true })
      // Also emit the raw payload on one line. Fly prefixes every log line
      // with a timestamp, which mangles the block-drawing QR above; the raw
      // string can be re-rendered cleanly off-box.
      console.log(`QR_RAW:${u.qr}`)
    }
    if (u.connection === 'open') {
      // Group discovery. Without this there is no way to learn a group's jid
      // to put in capture_sources, and nothing can be watched. Read-only, and
      // groups only — 1:1 conversations are never enumerated.
      void listGroups(sock)
    }
    // A close is handled by superviseSocket, which reconnects in place.
  })
  return sock as unknown as SocketLike
}

/** The phone unlinked this device: set its dead credentials aside (never
 * deleted) so the next connect starts a fresh pairing and prints a QR. */
export async function setAsideUnlinkedAuth(stateDir: string): Promise<void> {
  await rename(join(stateDir, 'wa-auth'), join(stateDir, `wa-auth.unlinked-${Date.now()}`))
}
