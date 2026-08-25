import { loadConfig } from './config.ts'
import { MessageBuffer } from './buffer.ts'
import { HighWaterStore } from './highWater.ts'
import { loadWatchlist } from './watchlist.ts'
import { attachReceiver, makeReceiveOnlySocket } from './whatsapp/adapter.ts'
import { dueNow, flushAll, localHour } from './scheduler.ts'
import { recordHealth } from './health.ts'
import { join } from 'node:path'
import type { WatchedSource } from './types.ts'

const TICK_MS = 5 * 60 * 1000

async function main(): Promise<void> {
  const config = loadConfig(process.env)
  const buffer = new MessageBuffer()
  const highWater = new HighWaterStore(join(config.stateDir, 'high-water.json'))
  await highWater.load()

  let sources: WatchedSource[] = await loadWatchlist(config)
  console.log(`watching ${sources.length} source(s): ${sources.map((s) => s.sourceLabel).join(', ') || 'none'}`)

  const sock = await makeReceiveOnlySocket(config.stateDir)
  attachReceiver(sock, { buffer, sources: () => sources })
  await recordHealth(config, 'whatsapp', { ok: true })

  let lastFiredHour: number | null = null
  setInterval(() => {
    void (async () => {
      const now = new Date()
      if (!dueNow(now, config.timezone, config.flushHoursLocal, lastFiredHour)) return
      lastFiredHour = localHour(now, config.timezone)

      // Re-read the allowlist each flush so adding a thread needs no restart.
      sources = await loadWatchlist(config)
      const whatsappSources = sources.filter((s) => s.connector === 'whatsapp')
      const r = await flushAll({ buffer, sources: whatsappSources, config, highWater })
      console.log(`flush: ${r.delivered} delivered, ${r.failed} failed`)
      await recordHealth(
        config,
        'whatsapp',
        r.failed === 0 ? { ok: true } : { ok: false, error: `${r.failed} source(s) failed` },
      )
    })()
  }, TICK_MS)
}

void main().catch((e) => {
  console.error('connector failed to start:', e)
  process.exit(1)
})
