import type { Config, WatchedSource } from './types.ts'
import type { MessageBuffer } from './buffer.ts'
import type { HighWaterStore } from './highWater.ts'
import { deliver } from './capture.ts'

/** Local hour in the household's zone. */
export function localHour(now: Date, timeZone: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now),
    10,
  )
}

/** True when `now` falls in a configured flush hour we have not already
 * fired for. The tick loop runs every few minutes; this keeps one flush per
 * scheduled hour regardless of tick jitter. */
export function dueNow(
  now: Date,
  timezone: string,
  flushHoursLocal: number[],
  lastFiredHour: number | null,
): boolean {
  const hour = localHour(now, timezone)
  if (!flushHoursLocal.includes(hour)) return false
  return lastFiredHour !== hour
}

export async function flushAll({
  buffer,
  sources,
  config,
  highWater,
  deliverImpl = deliver,
}: {
  buffer: MessageBuffer
  sources: WatchedSource[]
  config: Config
  highWater: HighWaterStore
  deliverImpl?: typeof deliver
}): Promise<{ delivered: number; failed: number }> {
  let delivered = 0
  let failed = 0

  for (const source of sources) {
    const messages = buffer.drain(source.sourceKey)
    if (messages.length === 0) continue

    const result = await deliverImpl({ source, messages, config })
    if (result.delivered && result.newest) {
      await highWater.set(source.sourceKey, result.newest)
      delivered += 1
    } else if (!result.delivered) {
      // Put it back, mark unmoved. Next tick re-sends; capture_checkpoints
      // makes the duplicate harmless.
      buffer.restore(source.sourceKey, messages)
      failed += 1
      console.error(`flush failed for ${source.sourceKey}: ${result.error ?? 'unknown'}`)
    }
  }

  return { delivered, failed }
}
