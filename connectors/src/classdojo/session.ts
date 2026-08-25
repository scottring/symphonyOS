import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/** The ClassDojo session cookie, persisted to the Fly volume.
 *
 * This is what makes the one-time-code dance a ONE-time dance: ClassDojo
 * challenges password logins from an unfamiliar IP with an emailed code, so
 * a connector that re-authenticated on every boot would need a human every
 * boot. Storing the cookie means restarts and deploys cost nothing. */
export class SessionStore {
  private cookie: string | null = null
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as { cookie?: string }
      this.cookie = parsed.cookie ?? null
    } catch {
      // No stored session yet, or unreadable — fall back to a fresh login.
      this.cookie = null
    }
  }

  get(): string | null {
    return this.cookie
  }

  async set(cookie: string): Promise<void> {
    this.cookie = cookie
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify({ cookie }), 'utf8')
  }

  async clear(): Promise<void> {
    this.cookie = null
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify({}), 'utf8')
  }
}

/** Thrown when ClassDojo wants an emailed one-time code. Distinct from a
 * plain auth failure because the fix is different: a human runs the OTC
 * flow once, rather than correcting a secret. */
export class OtcRequiredError extends Error {
  constructor() {
    super(
      'classdojo session expired and it refuses scripted logins from this IP ' +
      '(ERR_MUST_USE_OTC_ANOMALOUS_LOGIN). Capture a fresh session cookie from a ' +
      'logged-in browser and run: fly secrets set CLASSDOJO_COOKIE=... — see ' +
      'connectors/README.md.',
    )
    this.name = 'OtcRequiredError'
  }
}
