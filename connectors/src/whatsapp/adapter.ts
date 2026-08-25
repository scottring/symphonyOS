import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { join } from 'node:path'
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
    printQRInTerminal: true,
  })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (u: { connection?: string; lastDisconnect?: { error?: unknown } }) => {
    if (u.connection === 'close') {
      const status = (u.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode
      // loggedOut means the phone unlinked this device — a human must re-scan
      // the QR. Anything else is transient; the supervisor restarts us.
      console.error(
        status === DisconnectReason.loggedOut
          ? 'whatsapp: device unlinked — re-run the QR link (see connectors/README.md)'
          : `whatsapp: connection closed (${status}) — restarting`,
      )
      process.exit(1)
    }
  })
  return sock as unknown as SocketLike
}
