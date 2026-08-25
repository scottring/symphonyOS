import { loadConfig } from './config.ts'
import { MessageBuffer } from './buffer.ts'
import { HighWaterStore } from './highWater.ts'
import { loadWatchlist } from './watchlist.ts'
import { attachReceiver, makeReceiveOnlySocket } from './whatsapp/adapter.ts'
import { dueNow, flushAll, localHour } from './scheduler.ts'
import { recordHealth } from './health.ts'
import { makeClassDojoClient } from './classdojo/client.ts'
import { toConnectorMessages } from './classdojo/map.ts'
import { SessionStore, OtcRequiredError } from './classdojo/session.ts'
import { join } from 'node:path'
import type { WatchedSource } from './types.ts'

const TICK_MS = 5 * 60 * 1000

async function main(): Promise<void> {
  const config = loadConfig(process.env)
  const buffer = new MessageBuffer()
  const highWater = new HighWaterStore(join(config.stateDir, 'high-water.json'))
  await highWater.load()
  // A stored ClassDojo session survives restarts, so the one-time-code dance
  // stays one-time.
  const dojoSession = new SessionStore(join(config.stateDir, 'classdojo-session.json'))
  await dojoSession.load()
  // A cookie supplied by secret wins over a stored one: it is how a human
  // hands over a fresh session after the old one expires.
  if (config.classdojoCookie && config.classdojoCookie !== dojoSession.get()) {
    await dojoSession.set(config.classdojoCookie)
    console.log('classdojo: seeded session from CLASSDOJO_COOKIE')
  }

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
      console.log(`whatsapp flush: ${r.delivered} delivered, ${r.failed} failed`)
      await recordHealth(
        config,
        'whatsapp',
        r.failed === 0 ? { ok: true } : { ok: false, error: `${r.failed} source(s) failed` },
      )

      // ClassDojo polls on the same tick rather than holding a socket. Wrapped
      // whole: a ClassDojo failure must never take WhatsApp down with it.
      const dojoSources = sources.filter((s) => s.connector === 'classdojo')
      if (dojoSources.length > 0 && config.classdojoEmail && config.classdojoPassword) {
        try {
          const client = makeClassDojoClient({
            email: config.classdojoEmail,
            password: config.classdojoPassword,
            sessionStore: dojoSession,
          })
          // The feed is combined across classes, so it is fetched ONCE from the
          // oldest mark among the watched sources, then split by targetId.
          const marks = dojoSources.map((s) => highWater.get(s.sourceKey))
          const oldest = marks.some((m) => m === null)
            ? null
            : new Date(Math.min(...marks.map((m) => m!.getTime())))
          const posts = await client.fetchPostsSince(oldest)

          for (const source of dojoSources) {
            const targetId = source.sourceKey.replace(/^classdojo:/, '')
            const mine = posts.filter((p) => p.targetId === targetId)
            for (const m of toConnectorMessages(mine, highWater.get(source.sourceKey))) {
              buffer.add(source.sourceKey, m)
            }
          }

          const dr = await flushAll({ buffer, sources: dojoSources, config, highWater })
          console.log(`classdojo flush: ${dr.delivered} delivered, ${dr.failed} failed`)
          await recordHealth(
            config,
            'classdojo',
            dr.failed === 0 ? { ok: true } : { ok: false, error: `${dr.failed} source(s) failed` },
          )
        } catch (e) {
          // An OTC demand is not a broken connector — it is a connector
          // waiting on a human. Say so plainly, because "login failed" would
          // send someone hunting for a wrong password that isn't wrong.
          const needsCode = e instanceof OtcRequiredError
          console.error(needsCode ? `classdojo needs a one-time code: ${String(e)}` : `classdojo pull failed: ${String(e)}`)
          await recordHealth(config, 'classdojo', {
            ok: false,
            error: needsCode ? 'awaiting one-time code — run otcLogin on the machine' : String(e),
          })
        }
      }
    })()
  }, TICK_MS)
}

void main().catch((e) => {
  console.error('connector failed to start:', e)
  process.exit(1)
})
