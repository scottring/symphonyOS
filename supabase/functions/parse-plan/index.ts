// PARSE-PLAN — given a photo of a handwritten/printed plan page (uploaded to the
// `attachments` bucket by the client), runs Claude vision and returns the plan's
// items as structured, placeable tasks. WRITES NOTHING — the client shows a
// review sheet and commits only what the user confirms.
//
// The client owns the placement window (placeStart/placeEnd) and sends it in the
// body; this function never re-derives it (the Tend lesson: two derivations of
// the same window WILL disagree). The prompt embeds the window as an explicit
// weekday↔date calendar so the model never does date arithmetic.
// Auth: user JWT (same pattern as analyze-capture / symphony-agent).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-6'
const MAX_ITEMS = 40

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

interface Member {
  id: string
  name: string
}

interface PlanItem {
  title: string
  day: string // 'YYYY-MM-DD' | 'week' | 'inbox'
  assignee_id: string | null
  note: string | null
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** The dates of the window, inclusive, as local YYYY-MM-DD strings + weekday names. */
function windowCalendar(placeStart: string, placeEnd: string): { ymd: string; weekday: string }[] {
  const out: { ymd: string; weekday: string }[] = []
  const [y, m, d] = placeStart.split('-').map(Number)
  const cursor = new Date(y, m - 1, d)
  for (let i = 0; i < 60; i++) {
    const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    out.push({ ymd, weekday: cursor.toLocaleDateString('en-US', { weekday: 'long' }) })
    if (ymd === placeEnd) return out
    cursor.setDate(cursor.getDate() + 1)
  }
  return out // malformed placeEnd — validated by the caller before we get here
}

function buildPrompt(calendar: { ymd: string; weekday: string }[], members: Member[], today: string): string {
  const calendarLines = calendar.map((c) => `- ${c.ymd} (${c.weekday})`).join('\n')
  const memberLines = members.length
    ? members.map((m) => `- ${m.id}: ${m.name}`).join('\n')
    : '(none)'
  return `You are the planning assistant for Symphony, a personal task app. The user planned on paper and photographed the page. Transcribe the plan into individual actionable tasks.

Today is ${today}. The ONLY dates a task may be placed on (day headers like "Mon" or "Tue 8/18" map to these):
${calendarLines}

Household members (id: name) — assign a task ONLY when the line clearly names one (e.g. "Iris: return library books"):
${memberLines}

Respond with ONLY a JSON object (no markdown fences, no prose):

{
  "items": [
    {
      "title": "Short imperative task title, cleaned up from the handwriting",
      "day": "YYYY-MM-DD from the calendar above if the item sits under a day heading or names a day; \\"week\\" if the page is a weekly plan and the item has no specific day; \\"inbox\\" if it has no time frame at all",
      "assignee_id": "member id from the list above, or null",
      "note": "extra detail written on that line beyond the action itself (phone number, store, quantity, 'before 3pm'), or null"
    }
  ]
}

Rules:
- One item per distinct action written on the page. Do not invent tasks, do not merge lines.
- Skip crossed-out lines, page titles, decorations, and anything already marked done (✓/x in a checkbox).
- A day name with no date (e.g. "Wed") means the NEXT such weekday in the calendar above.
- If a named day is NOT in the calendar (e.g. a past day), use "week".
- If you cannot read the page at all, return {"items": []}.`
}

function validateItems(raw: unknown, calendar: Set<string>, memberIds: Set<string>): PlanItem[] {
  const items = (raw as { items?: unknown })?.items
  if (!Array.isArray(items)) throw new Error('Response missing items array')
  const out: PlanItem[] = []
  for (const entry of items.slice(0, MAX_ITEMS)) {
    const e = entry as Partial<PlanItem>
    if (typeof e.title !== 'string' || !e.title.trim()) continue
    let day = typeof e.day === 'string' ? e.day : 'inbox'
    // A date outside the window degrades to 'week' rather than being dropped —
    // the review sheet lets the user fix it.
    if (day !== 'week' && day !== 'inbox' && !(YMD.test(day) && calendar.has(day))) day = 'week'
    out.push({
      title: e.title.trim().slice(0, 200),
      day,
      assignee_id: typeof e.assignee_id === 'string' && memberIds.has(e.assignee_id) ? e.assignee_id : null,
      note: typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 1000) : null,
    })
  }
  return out
}

async function callVision(imageUrl: string, prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: prompt },
          ],
        },
      ],
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

  const token = authHeader.slice('Bearer '.length)
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let body: {
    storagePath?: string
    placeStart?: string
    placeEnd?: string
    today?: string
    members?: Member[]
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { storagePath, placeStart, placeEnd, today } = body
  if (!storagePath) return json({ error: 'storagePath required' }, 400)
  if (!storagePath.startsWith(`${user.id}/`)) return json({ error: 'storagePath must be under your user id' }, 403)
  if (!placeStart || !YMD.test(placeStart) || !placeEnd || !YMD.test(placeEnd) || placeEnd < placeStart) {
    return json({ error: 'placeStart/placeEnd required as YYYY-MM-DD with placeStart <= placeEnd' }, 400)
  }
  if (!today || !YMD.test(today)) return json({ error: 'today required as YYYY-MM-DD' }, 400)

  const members = (body.members ?? [])
    .filter((m): m is Member => typeof m?.id === 'string' && typeof m?.name === 'string')
    .slice(0, 20)

  try {
    const { data: signed, error: signErr } = await service.storage
      .from('attachments')
      .createSignedUrl(storagePath, 600)
    if (signErr || !signed?.signedUrl) throw new Error(`Could not sign image URL: ${signErr?.message}`)

    const calendar = windowCalendar(placeStart, placeEnd)
    const raw = await callVision(signed.signedUrl, buildPrompt(calendar, members, today), apiKey)
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const items = validateItems(
      JSON.parse(stripped),
      new Set(calendar.map((c) => c.ymd)),
      new Set(members.map((m) => m.id)),
    )

    return json({ ok: true, items })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('parse-plan failed:', message)
    return json({ error: message }, 500)
  }
})
