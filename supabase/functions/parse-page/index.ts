// PARSE-PAGE — given a page image or PDF in the `attachments` bucket, runs
// Claude vision and returns the page sorted into tasks, notes, and lines that
// could not be read. WRITES NOTHING: the review sheet commits only what the
// user confirms. Supersedes parse-plan, which only ever returned tasks.
//
// The CALLER owns the placement window and sends it in the body; this function
// never re-derives it (the Tend lesson: two derivations of the same window WILL
// disagree) and ECHOES it back, because a polled page may be reviewed hours
// later against what would by then be a different "today".
//
// Auth: either a user JWT, or the service-role key plus an explicit `userId`
// (the dropbox-poll caller, which has no user session).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { windowCalendar, buildPagePrompt, parsePageResponse, isAltitude, type Member, type PageAltitude } from './lib/parse.ts'

const MODEL = 'claude-sonnet-4-6'
const YMD = /^\d{4}-\d{2}-\d{2}$/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

async function callVision(fileUrl: string, isPdf: boolean, prompt: string, apiKey: string): Promise<string> {
  // A multi-page PDF export is one page-set the model sees together; images go
  // through the image block, the way analyze-attachment already branches.
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'url', url: fileUrl } }
    : { type: 'image', source: { type: 'url', url: fileUrl } }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic returned ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !serviceKey) return json({ error: 'Missing server config' }, 500)

  let body: {
    storagePath?: string
    userId?: string
    placeStart?: string
    placeEnd?: string
    today?: string
    members?: Member[]
    /** Which page this is (week/month/season/year). Absent = week, the only
     *  altitude before 2026-09-05, so the poller and older clients still work. */
    altitude?: PageAltitude
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const service = createClient(url, serviceKey)
  const token = authHeader.slice('Bearer '.length)

  // Two callers, two shapes of trust: a browser sends its own JWT and may only
  // read paths under its own user id; dropbox-poll sends the service key and
  // names the user explicitly.
  let userId: string
  if (token === serviceKey) {
    if (!body.userId) return json({ error: 'userId required for service-role calls' }, 400)
    userId = body.userId
  } else {
    const { data: { user }, error: authErr } = await service.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)
    userId = user.id
  }

  const { storagePath, placeStart, placeEnd, today } = body
  const altitude: PageAltitude = isAltitude(body.altitude) ? body.altitude : 'week'
  if (!storagePath) return json({ error: 'storagePath required' }, 400)
  if (!storagePath.startsWith(`${userId}/`)) return json({ error: 'storagePath must be under the user id' }, 403)
  // A year page has no dates to place on, so it carries no window.
  const needsWindow = altitude !== 'year'
  if (needsWindow && (!placeStart || !YMD.test(placeStart) || !placeEnd || !YMD.test(placeEnd) || placeEnd < placeStart)) {
    return json({ error: 'placeStart/placeEnd required as YYYY-MM-DD with placeStart <= placeEnd' }, 400)
  }
  if (!today || !YMD.test(today)) return json({ error: 'today required as YYYY-MM-DD' }, 400)

  const members = (body.members ?? [])
    .filter((m): m is Member => typeof m?.id === 'string' && typeof m?.name === 'string')
    .map((m) => ({ id: m.id, name: m.name, role: typeof m.role === 'string' && m.role.trim() ? m.role.trim() : null }))
    .slice(0, 20)

  try {
    const { data: signed, error: signErr } = await service.storage
      .from('attachments')
      .createSignedUrl(storagePath, 600)
    if (signErr || !signed?.signedUrl) throw new Error(`Could not sign file URL: ${signErr?.message}`)

    const calendar = needsWindow ? windowCalendar(placeStart!, placeEnd!) : []
    const prompt = buildPagePrompt(calendar, members, today, altitude)
    const isPdf = storagePath.toLowerCase().endsWith('.pdf')
    const calendarSet = new Set(calendar.map((c) => c.ymd))
    const memberIds = new Set(members.map((m) => m.id))

    // One retry: the failure mode is a model preamble around the JSON, and a
    // second pass almost always comes back clean (the analyze-attachment rule).
    let parsed
    try {
      parsed = parsePageResponse(await callVision(signed.signedUrl, isPdf, prompt, apiKey), calendarSet, memberIds, altitude)
    } catch {
      parsed = parsePageResponse(await callVision(signed.signedUrl, isPdf, prompt, apiKey), calendarSet, memberIds, altitude)
    }

    // The altitude is echoed with the window for the same reason: a staged
    // page is reviewed against what the model was told, never re-derived.
    return json({ ok: true, ...parsed, window: calendar.map((c) => c.ymd), altitude, storagePath })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('parse-page failed:', message)
    return json({ error: message }, 500)
  }
})
