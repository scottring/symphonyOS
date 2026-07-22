// TEND-WEEK — one-shot week-list tending. Given the unplaced pool (+ carried-
// over items) and the week's busy times, returns proposals: merge duplicates,
// put stale items aside, re-grade wrong-sized items, suggest placements.
// No DB reads/writes: the client applies a proposal only when the user taps
// Apply (AI proposes; only the user's tap writes). Auth: user JWT — same
// pattern as sharpen-goal.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

interface TendTask {
  id: string
  title: string
  notes?: string
  project?: string
  ageDays: number
  overdue: boolean
}
interface BusySlot { title: string; start: string; end: string }

function buildPrompt(tasks: TendTask[], weekStart: string, today: string, busy: BusySlot[]): string {
  const taskLines = tasks
    .map((t) => {
      const bits = [
        `id "${t.id}"`,
        `"${t.title}"`,
        t.project ? `project: ${t.project}` : null,
        `${t.ageDays}d old`,
        t.overdue ? 'OVERDUE (carried over)' : null,
        t.notes ? `notes: ${t.notes.slice(0, 120)}` : null,
      ].filter(Boolean)
      return `- ${bits.join(' · ')}`
    })
    .join('\n')
  const busyLines = busy.length
    ? busy.map((b) => `- ${b.start} → ${b.end}: ${b.title}`).join('\n')
    : '(no calendar events this week)'

  return `You are the list gardener for Symphony, a personal planning app. The user's week list (week starting ${weekStart}; today is ${today}) has grown unwieldy. Here are the unplaced tasks:

${taskLines}

Already-busy times this week:
${busyLines}

Propose a SHORT list of tending actions. Kinds:
- "merge": two+ entries are the same real-world task. {"kind":"merge","keepId":"...","dropIds":["..."],"why":"..."} — keep the older/richer one.
- "put_aside": the timing is wrong, not the idea — it has sat untouched and isn't urgent. {"kind":"put_aside","taskId":"...","why":"..."}
- "regrade": wrong-sized for a week — a month-scale chunk or a timeless idea. {"kind":"regrade","taskId":"...","to":"month"|"someday","why":"..."}
- "place": a concrete day/time suggestion this week. {"kind":"place","taskIds":["..."],"date":"YYYY-MM-DD","time":"HH:MM","why":"..."} — you may pair naturally-batched tasks (errands, outdoor work) in one proposal.

Rules:
- Use ONLY the task ids listed above. Never invent ids.
- "date" must be between ${today} and 6 days after ${weekStart}, never before ${today}.
- Avoid the busy times listed. Prefer mornings for focused work, weekends for house/outdoor work.
- Be conservative: at most 8 proposals, only ones you'd defend. An empty list is a fine answer.
- "why" is ONE short sentence, plain language, addressed to the user.

Respond with ONLY a JSON object (no markdown fences, no prose):
{"proposals":[ ... ]}`
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
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

  // Validate the caller's JWT so unauthenticated requests can't bill the model.
  const token = authHeader.slice('Bearer '.length)
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let body: { tasks?: unknown; weekStart?: unknown; today?: unknown; busy?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const tasks = (Array.isArray(body.tasks) ? body.tasks : [])
    .filter((t): t is TendTask =>
      typeof (t as TendTask)?.id === 'string' && typeof (t as TendTask)?.title === 'string')
    .slice(0, 60)
    .map((t) => ({
      id: t.id,
      title: String(t.title).slice(0, 300),
      notes: typeof t.notes === 'string' ? t.notes.slice(0, 300) : undefined,
      project: typeof t.project === 'string' ? t.project.slice(0, 120) : undefined,
      ageDays: typeof t.ageDays === 'number' ? Math.max(0, Math.round(t.ageDays)) : 0,
      overdue: t.overdue === true,
    }))
  const weekStart = typeof body.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart) ? body.weekStart : null
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null
  const busy = (Array.isArray(body.busy) ? body.busy : [])
    .filter((b): b is BusySlot =>
      typeof (b as BusySlot)?.start === 'string' && typeof (b as BusySlot)?.end === 'string')
    .slice(0, 40)
    .map((b) => ({ title: typeof b.title === 'string' ? b.title.slice(0, 120) : 'busy', start: b.start, end: b.end }))

  if (tasks.length === 0 || !weekStart || !today) return json({ error: 'tasks, weekStart, today required' }, 400)

  try {
    const text = await callClaude(buildPrompt(tasks, weekStart, today, busy), apiKey)
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(stripped) as { proposals?: unknown }
    const proposals = Array.isArray(parsed.proposals) ? parsed.proposals.slice(0, 12) : []
    return json({ proposals })
  } catch (e) {
    console.error('tend-week failed:', e)
    return json({ error: 'Tending failed' }, 502)
  }
})
