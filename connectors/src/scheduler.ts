import type { Config, WatchedSource } from './types.ts'
import type { MessageBuffer } from './buffer.ts'
import type { HighWaterStore } from './highWater.ts'
import { sendDigest } from './digest.ts'

/** Local hour in the household's zone. */
export function localHour(now: Date, timeZone: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now),
    10,
  )
}

/** The local calendar day and hour, e.g. "2026-11-16T17". This is what a
 * flush is remembered by. Remembering the bare hour (17) latched for good:
 * 17 equals 17 again the next day, so a worker that stays up sent one digest
 * and then skipped every day after it (2026-11-12 to 11-16). */
export function flushSlot(now: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return `${day}T${String(localHour(now, timeZone)).padStart(2, '0')}`
}

/** True when `now` falls in a configured flush hour we have not already
 * fired for TODAY. The tick loop runs every few minutes; this keeps one
 * flush per scheduled hour per day regardless of tick jitter. */
export function dueNow(
  now: Date,
  timezone: string,
  flushHoursLocal: number[],
  lastFiredSlot: string | null,
): boolean {
  if (!flushHoursLocal.includes(localHour(now, timezone))) return false
  return lastFiredSlot !== flushSlot(now, timezone)
}

/** Drain every source into ONE digest email. All-or-nothing: the marks
 * advance together on success, and on failure every batch goes back so
 * the next tick re-sends the same day. */
export async function flushAll({
  buffer,
  sources,
  config,
  highWater,
  sendImpl = sendDigest,
}: {
  buffer: MessageBuffer
  sources: WatchedSource[]
  config: Config
  highWater: HighWaterStore
  sendImpl?: typeof sendDigest
}): Promise<{ delivered: number; failed: number }> {
  const batches = sources
    .map((source) => ({ source, messages: buffer.drain(source.sourceKey) }))
    .filter((b) => b.messages.length > 0)
  if (batches.length === 0) return { delivered: 0, failed: 0 }

  const result = await sendImpl({ batches, config })
  if (result.delivered) {
    for (const [sourceKey, newest] of result.newest) await highWater.set(sourceKey, newest)
    return { delivered: batches.length, failed: 0 }
  }

  for (const b of batches) buffer.restore(b.source.sourceKey, b.messages)
  console.error(`digest failed for ${batches.length} source(s): ${result.error ?? 'unknown'}`)
  return { delivered: 0, failed: batches.length }
}
