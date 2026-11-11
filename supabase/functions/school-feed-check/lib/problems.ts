// What is wrong with a household's school feeds, if anything (Scott,
// 2026-11-11: the worker stopped on Nov 8 and nobody knew for three days).
// Pure: rows in, problems out. The handler emails them.

export interface HealthRow {
  connector: 'whatsapp' | 'classdojo'
  last_ok_at: string | null
  last_error: string | null
  last_error_at: string | null
  heartbeat_at: string | null
  last_flush_at: string | null
}

export interface Problem {
  /** Stable for as long as the problem lasts: the alert is mailed once per key. */
  key: string
  /** One plain sentence: what is wrong and what to do. */
  text: string
}

/** The worker beats every 5 minutes; this much silence means it has stopped. */
const DEAD_AFTER_MS = 30 * 60_000
/** WhatsApp reconnects on its own; only a link down this long is worth a word. */
const WHATSAPP_GRACE_MS = 30 * 60_000
/** The digest runs at 5pm; by 5:45 it has run or it has not. */
const FLUSH_HOUR = 17
const FLUSH_GRACE_MIN = 45

const ms = (s: string | null) => (s ? new Date(s).getTime() : null)

/** The wall clock in `tz`: date and minutes past midnight. */
export function localClock(now: Date, tz: string): { ymd: string; minutes: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '0'
  return { ymd: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) }
}

/** Is the error newer than the last success? */
const failing = (r: HealthRow) => {
  const err = ms(r.last_error_at)
  return err !== null && err > (ms(r.last_ok_at) ?? 0)
}

export function feedProblems(rows: readonly HealthRow[], watched: ReadonlySet<string>, now: Date, tz: string): Problem[] {
  const out: Problem[] = []
  const t = now.getTime()
  const wa = rows.find((r) => r.connector === 'whatsapp')
  const dojo = rows.find((r) => r.connector === 'classdojo')

  // The worker itself. It beats on the WhatsApp row; before the first beat
  // (an older worker) there is nothing to judge, so nothing is said.
  const beat = ms(wa?.heartbeat_at ?? null)
  if (beat !== null && t - beat > DEAD_AFTER_MS) {
    out.push({
      key: 'worker-down',
      text: 'The school feeds worker has stopped, so no school messages are being collected and tonight’s digest won’t go out. Restart it: fly machine start -a symphony-connectors.',
    })
    // A dead worker explains everything else; one message is enough.
    return out
  }

  if (wa && watched.has('whatsapp') && failing(wa) && t - (ms(wa.last_ok_at) ?? 0) > WHATSAPP_GRACE_MS) {
    const unlinked = /unlinked/i.test(wa.last_error ?? '')
    out.push(unlinked
      ? { key: 'whatsapp-unlinked', text: 'WhatsApp unlinked the school feed, so school group messages aren’t being collected. Re-link it at https://app.symphony-os.com/settings#school-feeds and scan the code with WhatsApp → Linked Devices.' }
      : { key: 'whatsapp-down', text: `WhatsApp has been disconnected for over half an hour (${wa.last_error ?? 'no reason given'}). It keeps retrying on its own; if this stays, check the worker’s logs.` })
  }

  if (dojo && watched.has('classdojo') && failing(dojo)) {
    const code = /one-time code|otc/i.test(dojo.last_error ?? '')
    out.push(code
      ? { key: 'classdojo-code', text: 'ClassDojo wants a new sign-in code, so its posts are missing from the digest. Sign in again on the worker (see connectors/README.md).' }
      : { key: 'classdojo-down', text: `ClassDojo couldn’t be read (${dojo.last_error ?? 'no reason given'}), so its posts are missing from the digest.` })
  }

  // The 5pm run. Before the first recorded run there is nothing to judge.
  const flushed = ms(wa?.last_flush_at ?? null)
  const clock = localClock(now, tz)
  if (flushed !== null && clock.minutes >= FLUSH_HOUR * 60 + FLUSH_GRACE_MIN) {
    const ranToday = localClock(new Date(flushed), tz).ymd === clock.ymd && localClock(new Date(flushed), tz).minutes >= FLUSH_HOUR * 60
    if (!ranToday) {
      out.push({ key: `flush-missed-${clock.ymd}`, text: 'Today’s 5pm school digest didn’t run.' })
    }
  }
  return out
}

/** One key for the whole set, so a change in what is wrong is mailed again. */
export function alertKey(problems: readonly Problem[]): string | null {
  return problems.length ? problems.map((p) => p.key).sort().join('+') : null
}

/** Quiet hours: nothing is mailed between 10pm and 7am; it waits for morning. */
export function awake(now: Date, tz: string): boolean {
  const m = localClock(now, tz).minutes
  return m >= 7 * 60 && m < 22 * 60
}

/** Mail when what is wrong has changed, or the same thing is still wrong a day later. */
export function shouldMail(key: string | null, last: { alert_key: string | null; alerted_at: string | null } | null, now: Date): 'problem' | 'resolved' | null {
  const prevKey = last?.alert_key ?? null
  if (key === null) return prevKey ? 'resolved' : null
  if (key !== prevKey) return 'problem'
  const at = ms(last?.alerted_at ?? null)
  return at === null || now.getTime() - at > 24 * 60 * 60_000 ? 'problem' : null
}
