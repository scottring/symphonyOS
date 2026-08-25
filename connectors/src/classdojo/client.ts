import { toDojoPosts, type DojoPost, type FeedItem } from './map.ts'

// ClassDojo HTTP client. Endpoints and shapes are recorded in
// connectors/docs/classdojo-api.md — observed from a live session, not guessed.
//
// READ ONLY. This client logs in and reads the story feed. It never posts,
// comments, reacts, or marks anything read, for the same reason the WhatsApp
// adapter never sends.

const BASE = 'https://home.classdojo.com'
const FEED_PATH = '/api/storyFeed?withStudentCommentsAndLikes=true&withSyntheticPosts=true'

/** Pages are walked backwards with `before` — there is no `since` cursor —
 * so a run that finds nothing older still has to stop somewhere. */
const MAX_PAGES = 20

interface FeedResponse {
  _items?: FeedItem[]
}

export interface ClassDojoClient {
  login(): Promise<void>
  /** Every post newer than `since`, across all classes and the school.
   * The feed is combined; callers split on DojoPost.targetId. */
  fetchPostsSince(since: Date | null): Promise<DojoPost[]>
}

export function makeClassDojoClient({
  email,
  password,
  fetchImpl = fetch,
}: {
  email: string
  password: string
  fetchImpl?: typeof fetch
}): ClassDojoClient {
  // Cookie jar. The session cookie is the only credential the feed needs,
  // and it never leaves this process.
  let cookie = ''
  let loggedIn = false

  function remember(res: Response): void {
    // Node exposes multiple Set-Cookie headers through getSetCookie().
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    const pairs = raw.map((c) => c.split(';')[0]).filter(Boolean)
    if (pairs.length > 0) cookie = pairs.join('; ')
  }

  async function login(): Promise<void> {
    const res = await fetchImpl(`${BASE}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: email, password }),
    })
    if (!res.ok) {
      // This string lands in connector_health.last_error and is the only
      // thing that will tell anyone what broke, so it carries ClassDojo's
      // own error code — ERR_INCORRECT_USERNAME vs ERR_INCORRECT_PASSWORD
      // is the difference between a typo in the email and a typo in the
      // password, and guessing between them wastes a deploy each time.
      let code = ''
      try {
        const body = (await res.json()) as { error?: { code?: string; detail?: string } }
        code = body.error?.code ?? body.error?.detail ?? ''
      } catch {
        // Non-JSON error body; the status alone will have to do.
      }
      throw new Error(`classdojo login failed: ${res.status}${code ? ` (${code})` : ''}`)
    }
    remember(res)
    loggedIn = true
  }

  async function getFeed(url: string): Promise<Response> {
    return fetchImpl(url, { headers: cookie ? { cookie } : {} })
  }

  async function fetchPostsSince(since: Date | null): Promise<DojoPost[]> {
    if (!loggedIn) await login()

    const collected: DojoPost[] = []
    let url = `${BASE}${FEED_PATH}`
    let retriedLogin = false

    for (let page = 0; page < MAX_PAGES; page++) {
      let res = await getFeed(url)

      if (res.status === 401 && !retriedLogin) {
        // Session aged out mid-run. One re-login, then give up — a login loop
        // against someone's real account is how you get it locked.
        retriedLogin = true
        loggedIn = false
        await login()
        res = await getFeed(url)
      }
      if (!res.ok) throw new Error(`classdojo feed failed: ${res.status}`)

      const body = (await res.json()) as FeedResponse
      const items = body._items ?? []
      if (items.length === 0) break

      collected.push(...toDojoPosts(items))

      // The feed is newest-first. Once the oldest item on this page is at or
      // before the mark, everything further back is already delivered.
      const oldest = items[items.length - 1]?.time
      if (!oldest) break
      const oldestAt = new Date(oldest)
      if (since && (Number.isNaN(oldestAt.getTime()) || oldestAt.getTime() <= since.getTime())) break
      // A first run has no mark; one page is the right amount of history to
      // import rather than the entire school year.
      if (!since) break

      url = `${BASE}${FEED_PATH}&before=${encodeURIComponent(oldest)}`
    }

    return collected
  }

  return { login, fetchPostsSince }
}
