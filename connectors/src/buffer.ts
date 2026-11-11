import { readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ConnectorMessage } from './types.ts'

/** Messages accumulate here between flush ticks.
 *
 * Kept on the volume as well as in memory (2026-11-11): WhatsApp keeps no
 * history this worker can re-read, so a restart used to lose every message
 * collected since the last 5pm run. With a file, the buffer survives a
 * restart, a crash and a deploy. Without one (tests), memory only.
 *
 * A message with an id is kept once: the history WhatsApp sends on a fresh
 * link overlaps what arrived live. */
export class MessageBuffer {
  private readonly bySource = new Map<string, ConnectorMessage[]>()
  private readonly filePath: string | null

  constructor(filePath: string | null = null) {
    this.filePath = filePath
  }

  /** Read what a previous run left; a missing or broken file is an empty buffer. */
  load(): void {
    if (!this.filePath) return
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, (Omit<ConnectorMessage, 'timestamp'> & { timestamp: string })[]>
      for (const [key, list] of Object.entries(raw)) {
        this.bySource.set(key, list.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })))
      }
    } catch {
      // First boot, or a file cut short: start empty.
    }
  }

  add(sourceKey: string, message: ConnectorMessage): boolean {
    const list = this.bySource.get(sourceKey)
    if (message.id && list?.some((m) => m.id === message.id)) return false
    if (list) list.push(message)
    else this.bySource.set(sourceKey, [message])
    this.save()
    return true
  }

  drain(sourceKey: string): ConnectorMessage[] {
    const list = this.bySource.get(sourceKey) ?? []
    this.bySource.delete(sourceKey)
    this.save()
    return list
  }

  /** Put a failed batch back at the FRONT, so time order survives a retry. */
  restore(sourceKey: string, messages: ConnectorMessage[]): void {
    if (messages.length === 0) return
    const current = this.bySource.get(sourceKey) ?? []
    this.bySource.set(sourceKey, [...messages, ...current])
    this.save()
  }

  keys(): string[] {
    return [...this.bySource.keys()]
  }

  /** Written whole to a temp file and renamed over, so a crash mid-write
   * leaves the previous buffer, never half of one. */
  private save(): void {
    if (!this.filePath) return
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.bySource)), 'utf8')
      renameSync(tmp, this.filePath)
    } catch (e) {
      console.error('buffer: saving to disk failed; it is still in memory:', e)
    }
  }
}
