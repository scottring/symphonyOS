import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ════════════════════════════════════════════════════════════════
// SYMPHONY AGENT — a smart, Symphony-scoped assistant.
//
// Runs an Anthropic tool-use loop where every tool is a query against
// the caller's own Symphony data, executed with a USER-JWT-scoped
// Supabase client. RLS is the fence: the agent can only ever read or
// write rows the signed-in user owns. No vault, no email, no Mini.
//
// Streams the AgentStreamEvent SSE shape the client already parses:
//   {type:'session'|'text'|'tool'|'done'|'error'}
// ════════════════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'claude-sonnet-4-6'
const MAX_TURNS = 8

const SYSTEM_PROMPT = `You are the assistant inside Symphony, Scott's task, project, and routine manager. You help manage tasks, projects, and contacts using the tools available to you.

Rules:
- You operate ONLY within Symphony. You have no access to files, email, the vault, or the web. If asked to do something outside Symphony, say so plainly and stop.
- No em dashes. No AI cliches. No sycophancy. Be direct and action-oriented.
- Just do it; don't narrate what you are about to do. After acting, confirm briefly.

Symphony domain model:
- Tasks have a context: work, family, or personal. An unscheduled task (bucket "inbox") needs triage; a scheduled task has bucket "timed" and a scheduled_for date.
- contact_id = who the task is ABOUT. assigned_to = who should DO it (a household member id). They are different.
- To schedule a task, set scheduled_for; the system files it as "timed" automatically.
- When unsure which context or date the user means, ask one short question rather than guessing.
- Dates are ISO (YYYY-MM-DD). Today's date is provided in the first user message.

Keep replies tight. Summary first, offer to expand.

When the user attaches a document describing a recurring protocol (e.g. a physical-therapy home exercise program):
- Read it. Extract each distinct item, its instructions, and how many times per day it is done.
- First create a project to hold the program (symphony_create_project), context "personal".
- Then create one routine per item (symphony_create_routine), setting times_per_day when an item is done more than once a day.
- Before creating anything, list what you found (item -> frequency) and ask the user to confirm. Only write after they confirm.
- If a frequency is unclear, ask rather than guessing. Never invent a cadence the document does not state.`

// ── Tool schemas (Anthropic tool-use format) ───────────────────────
const CONTEXT_ENUM = ['work', 'family', 'personal']
const BUCKET_ENUM = ['inbox', 'timed', 'week', 'month', 'quarter']

const TOOLS = [
  {
    name: 'symphony_list_tasks',
    description: 'List tasks (max 50). Filter by bucket, context, completed, is_waiting, project_id, scheduled_for (YYYY-MM-DD), or search (title substring).',
    input_schema: {
      type: 'object',
      properties: {
        bucket: { type: 'string', enum: BUCKET_ENUM },
        context: { type: 'string', enum: CONTEXT_ENUM },
        completed: { type: 'boolean' },
        is_waiting: { type: 'boolean' },
        project_id: { type: 'string' },
        scheduled_for: { type: 'string', description: 'YYYY-MM-DD' },
        search: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'symphony_create_task',
    description: 'Create a task. Set scheduled_for (YYYY-MM-DD) to schedule it; otherwise it lands in the inbox. context is the life domain.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        scheduled_for: { type: 'string', description: 'YYYY-MM-DD or ISO8601' },
        is_all_day: { type: 'boolean' },
        context: { type: 'string', enum: CONTEXT_ENUM },
        category: { type: 'string', enum: ['task', 'chore', 'errand', 'event', 'activity'] },
        notes: { type: 'string' },
        project_id: { type: 'string' },
        contact_id: { type: 'string', description: 'who the task is ABOUT' },
        assigned_to: { type: 'string', description: 'household member id who should DO it' },
        phone_number: { type: 'string' },
        location: { type: 'string' },
        estimated_duration: { type: 'number', description: 'minutes' },
      },
      required: ['title'],
    },
  },
  {
    name: 'symphony_update_task',
    description: 'Update a task by id. Set scheduled_for to reschedule (or null to move to inbox), change context, notes, etc.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        completed: { type: 'boolean' },
        scheduled_for: { type: ['string', 'null'] },
        is_all_day: { type: 'boolean' },
        context: { type: ['string', 'null'], enum: [...CONTEXT_ENUM, null] },
        category: { type: 'string' },
        notes: { type: ['string', 'null'] },
        project_id: { type: ['string', 'null'] },
        contact_id: { type: ['string', 'null'] },
        assigned_to: { type: ['string', 'null'] },
        is_waiting: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'symphony_complete_task',
    description: 'Mark a task complete or uncomplete.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, completed: { type: 'boolean' } },
      required: ['id'],
    },
  },
  {
    name: 'symphony_list_projects',
    description: 'List projects. Filter by status (not_started/in_progress/on_hold/completed), context, or search (name).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['not_started', 'in_progress', 'on_hold', 'completed'] },
        context: { type: 'string', enum: CONTEXT_ENUM },
        search: { type: 'string' },
      },
    },
  },
  {
    name: 'symphony_create_project',
    description: 'Create a project (a container for related tasks).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        status: { type: 'string', enum: ['not_started', 'in_progress', 'on_hold', 'completed'] },
        context: { type: 'string', enum: CONTEXT_ENUM },
        notes: { type: 'string' },
        phone_number: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'symphony_list_contacts',
    description: 'List contacts. Filter by category (family/friend/service_provider/professional/school/medical/other) or search (name).',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        search: { type: 'string' },
      },
    },
  },
  {
    name: 'symphony_list_household_members',
    description: 'List household/family members. Use their ids for assigned_to.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'symphony_daily_summary',
    description: "Summary of today's tasks, inbox count, waiting items, and overdue. Good for a briefing.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'symphony_create_routine',
    description: 'Create a recurring routine. For a protocol/exercise done multiple times a day, set times_per_day (array of HH:MM). recurrence_pattern defaults to daily.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string', description: 'instructions shown when expanded' },
        recurrence_pattern: { type: 'object', description: 'defaults to {"type":"daily"}' },
        times_per_day: { type: 'array', items: { type: 'string' }, description: 'HH:MM list, e.g. ["09:00","18:00"]' },
        time_of_day: { type: 'string', description: 'HH:MM for a once-a-day routine' },
        context: { type: 'string', enum: CONTEXT_ENUM },
        image_url: { type: 'string' },
      },
      required: ['name'],
    },
  },
]

// ── Scheduling normalization ───────────────────────────────────────
// The Today view buckets by the app's timezone (America/New_York). An
// all-day task must be stored at LOCAL midnight expressed in UTC (e.g.
// 2026-06-06 -> 2026-06-06T04:00:00Z in EDT) or it shifts to the wrong day.
const APP_TZ = 'America/New_York'

function etOffsetMinutes(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12))
  const name = new Intl.DateTimeFormat('en-US', { timeZone: APP_TZ, timeZoneName: 'shortOffset' })
    .formatToParts(utcNoon).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5'
  const mt = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/)
  if (!mt) return -300
  const sign = mt[1] === '-' ? -1 : 1
  return sign * (parseInt(mt[2]) * 60 + (mt[3] ? parseInt(mt[3]) : 0))
}

/** Resolve scheduled_for + is_all_day + bucket from raw tool input. */
function normalizeSchedule(
  scheduledFor: unknown,
  isAllDay: unknown,
): { scheduled_for: string | null; is_all_day: boolean; bucket: string } {
  if (!scheduledFor || typeof scheduledFor !== 'string') {
    return { scheduled_for: null, is_all_day: isAllDay === true, bucket: 'inbox' }
  }
  const hasTime = /T\d{2}:\d{2}/.test(scheduledFor)
  const allDay = typeof isAllDay === 'boolean' ? isAllDay : !hasTime
  let sf = scheduledFor
  if (allDay && !hasTime) {
    const dateStr = scheduledFor.slice(0, 10)
    const offMin = etOffsetMinutes(dateStr)
    const utcMs = Date.parse(`${dateStr}T00:00:00Z`) - offMin * 60000
    sf = new Date(utcMs).toISOString()
  }
  return { scheduled_for: sf, is_all_day: allDay, bucket: 'timed' }
}

// ── Tool executor (RLS-scoped via userSupabase) ────────────────────
async function runTool(
  db: SupabaseClient,
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const now = () => new Date().toISOString()
  try {
    switch (name) {
      case 'symphony_list_tasks': {
        let q = db.from('tasks').select('*').order('scheduled_for', { ascending: true, nullsFirst: false })
        if (input.bucket) q = q.eq('bucket', input.bucket)
        if (input.context) q = q.eq('context', input.context)
        if (input.completed !== undefined) q = q.eq('completed', input.completed)
        if (input.is_waiting !== undefined) q = q.eq('is_waiting', input.is_waiting)
        if (input.project_id) q = q.eq('project_id', input.project_id)
        if (input.search) q = q.ilike('title', `%${input.search}%`)
        if (input.scheduled_for) {
          q = q.gte('scheduled_for', `${input.scheduled_for}T00:00:00`).lte('scheduled_for', `${input.scheduled_for}T23:59:59`)
        }
        q = q.limit(typeof input.limit === 'number' ? input.limit : 50)
        const { data, error } = await q
        if (error) throw error
        return `${(data || []).length} tasks:\n${JSON.stringify(data, null, 2)}`
      }
      case 'symphony_create_task': {
        const { id: _id, scheduled_for, is_all_day, bucket: rawBucket, ...rest } = input as Record<string, unknown>
        const sched = normalizeSchedule(scheduled_for, is_all_day)
        const bucket = sched.scheduled_for ? 'timed' : ((rawBucket as string) ?? 'inbox')
        const { data, error } = await db.from('tasks')
          .insert({
            ...rest,
            scheduled_for: sched.scheduled_for,
            is_all_day: sched.is_all_day,
            bucket,
            user_id: userId,
            completed: false,
          })
          .select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_update_task': {
        const { id, ...updates } = input as Record<string, unknown>
        if (!id) return 'Error: id is required'
        // Normalize a (re)schedule the same way create does.
        if ('scheduled_for' in updates) {
          const sched = normalizeSchedule(updates.scheduled_for, updates.is_all_day)
          updates.scheduled_for = sched.scheduled_for
          if (sched.scheduled_for) {
            updates.is_all_day = sched.is_all_day
            updates.bucket = 'timed'
          } else {
            updates.bucket = (updates.bucket as string) ?? 'inbox'
          }
        }
        const { data, error } = await db.from('tasks')
          .update({ ...updates, updated_at: now() }).eq('id', id).select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_complete_task': {
        const completed = input.completed === undefined ? true : !!input.completed
        const { data, error } = await db.from('tasks')
          .update({ completed, updated_at: now() }).eq('id', input.id).select().single()
        if (error) throw error
        return `Task "${data.title}" ${completed ? 'completed' : 'uncompleted'}`
      }
      case 'symphony_list_projects': {
        let q = db.from('projects').select('*').order('updated_at', { ascending: false })
        if (input.status) q = q.eq('status', input.status)
        if (input.context) q = q.eq('context', input.context)
        if (input.search) q = q.ilike('name', `%${input.search}%`)
        const { data, error } = await q
        if (error) throw error
        return `${(data || []).length} projects:\n${JSON.stringify(data, null, 2)}`
      }
      case 'symphony_create_project': {
        const { data, error } = await db.from('projects')
          .insert({ ...input, user_id: userId }).select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_list_contacts': {
        let q = db.from('contacts').select('*').order('name')
        if (input.category) q = q.eq('category', input.category)
        if (input.search) q = q.ilike('name', `%${input.search}%`)
        const { data, error } = await q
        if (error) throw error
        return `${(data || []).length} contacts:\n${JSON.stringify(data, null, 2)}`
      }
      case 'symphony_list_household_members': {
        const { data, error } = await db.from('household_members')
          .select('id, name, role, avatar_url').order('name')
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_daily_summary': {
        const today = new Date().toISOString().split('T')[0]
        const start = `${today}T00:00:00`, end = `${today}T23:59:59`
        const [todayT, inboxT, waitingT, overdueT] = await Promise.all([
          db.from('tasks').select('id, title, completed, scheduled_for, context, category, is_waiting')
            .eq('bucket', 'timed').gte('scheduled_for', start).lte('scheduled_for', end).order('scheduled_for'),
          db.from('tasks').select('id, title, context, created_at').eq('bucket', 'inbox').eq('completed', false),
          db.from('tasks').select('id, title, context').eq('is_waiting', true).eq('completed', false),
          db.from('tasks').select('id, title, scheduled_for, context')
            .eq('bucket', 'timed').eq('completed', false).lt('scheduled_for', start),
        ])
        return JSON.stringify({
          date: today,
          today: { total: todayT.data?.length ?? 0, remaining: todayT.data?.filter((t) => !t.completed).length ?? 0, tasks: todayT.data ?? [] },
          inbox: { count: inboxT.data?.length ?? 0, tasks: inboxT.data ?? [] },
          waiting: { count: waitingT.data?.length ?? 0, tasks: waitingT.data ?? [] },
          overdue: { count: overdueT.data?.length ?? 0, tasks: overdueT.data ?? [] },
        }, null, 2)
      }
      case 'symphony_create_routine': {
        const { recurrence_pattern, ...rest } = input as Record<string, unknown>
        const { data, error } = await db.from('routines')
          .insert({
            ...rest,
            recurrence_pattern: recurrence_pattern ?? { type: 'daily' },
            visibility: 'active',
            show_on_timeline: true,
            user_id: userId,
          })
          .select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      default:
        return `Error: unknown tool ${name}`
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ── Anthropic helpers ──────────────────────────────────────────────
interface AnthropicBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

async function callAnthropic(
  apiKey: string,
  messages: Array<{ role: string; content: unknown }>,
): Promise<{ content: AnthropicBlock[]; stop_reason: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS.map((t, i) =>
        i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t,
      ),
      messages,
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`)
  }
  const json = await res.json()
  return { content: json.content ?? [], stop_reason: json.stop_reason ?? 'end_turn' }
}

// ── HTTP handler ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !anon || !serviceKey) return json({ error: 'Server not configured' }, 500)

  // Verify the user, then build an RLS-scoped client that acts AS them.
  const token = authHeader.replace('Bearer ', '')
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
  const db = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })

  const { messages: incoming } = await req.json().catch(() => ({ messages: null }))
  if (!Array.isArray(incoming) || incoming.length === 0) return json({ error: 'messages is required' }, 400)

  const today = new Date().toISOString().split('T')[0]
  const datePrefix = `(Today is ${today}.)`
  const convo: Array<{ role: string; content: unknown }> = incoming.map(
    (m: { role: string; content: unknown }, i: number) => {
      if (i !== 0) return { role: m.role, content: m.content }
      if (typeof m.content === 'string') return { role: m.role, content: `${datePrefix}\n\n${m.content}` }
      // array content: prepend the date as its own text block
      return { role: m.role, content: [{ type: 'text', text: datePrefix }, ...(m.content as unknown[])] }
    },
  )

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (ev: Record<string, unknown>) => controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`))
      let finalText = ''
      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const { content, stop_reason } = await callAnthropic(apiKey, convo)
          const toolResults: Array<Record<string, unknown>> = []
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              finalText = block.text
              send({ type: 'text', text: block.text })
            } else if (block.type === 'tool_use' && block.name) {
              send({ type: 'tool', name: block.name })
              const result = await runTool(db, user.id, block.name, block.input ?? {})
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
            }
          }
          convo.push({ role: 'assistant', content })
          if (stop_reason === 'tool_use' && toolResults.length > 0) {
            convo.push({ role: 'user', content: toolResults })
            continue
          }
          break
        }
        send({ type: 'done', reply: finalText, sessionId: null })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Agent failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
  })
})
