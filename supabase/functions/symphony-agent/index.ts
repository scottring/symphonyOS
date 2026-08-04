import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assembleContext } from '../_shared/context-graph/assemble.ts'
import { renderBundleForPrompt } from '../_shared/context-graph/build.ts'

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
const MAX_TURNS = 14

const SYSTEM_PROMPT = `You are the assistant inside Symphony, Scott's task, project, and routine manager. You help manage tasks, projects, and contacts using the tools available to you.

Rules:
- You operate within Symphony. You have no access to email or the web, and you cannot edit the vault. But you CAN search Scott's knowledge base — his notes synced from his vault (people, projects, job search, meetings, daily logs, research, context) — with symphony_search_notes. If asked to do something none of your tools cover, say so plainly and stop.
- No em dashes. No AI cliches. No sycophancy. Be direct and action-oriented.
- Just do it; don't narrate what you are about to do. After acting, confirm briefly.

Grounding and verification (important):
- Only state facts you have actually read from a tool result. Never assert a prior value, schedule, date, or history you have not looked up. If you are not sure, look it up or say you don't know. Do not invent.
- Scott has a large knowledge base of notes synced from his vault. When he asks what he knows about a topic, wants background or prep on something (an interview, a person, a project, a decision), or asks you to gather relevant material, call symphony_search_notes BEFORE concluding there is nothing. Do not say "nothing exists" or "I have no information on X" about any topic without searching notes first. When you use a note, name its title so he can find it. The notes you find are shown to the user as clickable chips they can open in-app, so you do not need to print file paths, ".md" filenames, or links.
- The user's data spans tasks, routines, projects, contacts, lists, notes, and calendar events. Before acting on "X", check the right entity type: a recurring item like "Feed Jax dinner" is a routine (symphony_list_routines), not a task. Look it up before assuming it doesn't exist.
- A dated occasion someone ATTENDS (a show, appointment, party, pickup, reservation) belongs on the real calendar: use symphony_create_calendar_event, never symphony_create_task, for it. Tasks are to-dos someone DOES. Family occasions go on the family calendar (domain "family").
- After ANY write (create / update / complete / delete / add / check), VERIFY before you claim success: read the affected item back with the matching list_/get_ tool and confirm the fields you intended actually changed. If the change did not take or a value looks wrong, say so and retry or ask. Never report a change you have not verified.
- When updating an item, change only the fields the user asked about. Do not modify unrelated fields (schedule, time, name, context) as a side effect.

Symphony domain model:
- Tasks have a context: work, family, or personal. An unscheduled task (bucket "inbox") needs triage; a scheduled task has bucket "timed" and a scheduled_for date.
- contact_id = who the task is ABOUT. assigned_to = who should DO it (a household member id). They are different.
- To schedule a task, set scheduled_for; the system files it as "timed" automatically.
- When unsure which context or date the user means, ask one short question rather than guessing.
- Dates are ISO (YYYY-MM-DD). Today's date is provided in the first user message.

Routines vs tasks:
- A routine is a recurring item (e.g. "Feed Jax dinner", "Walk Jax", "Kids morning routine"). Routines are NOT tasks. To find a routine, use symphony_list_routines, never symphony_list_tasks.
- Routines can be grouped into collections. A "step" is just a routine whose parent_routine_id points at a parent routine; step_order sets its order within the parent.
- To GROUP existing routines into a collection (e.g. "group Feed Jax dinner and Walk Jax into Jax Evening Routine"): (1) symphony_list_routines to find each one and get its id; (2) symphony_create_routine to make the parent collection; (3) symphony_update_routine on each existing routine, setting parent_routine_id to the parent's id and step_order (0, 1, 2...). Do NOT recreate routines that already exist; fold the existing ones in.
- When folding a routine in, change ONLY parent_routine_id and step_order. Do NOT modify its recurrence_pattern, time_of_day, name, context, or any other field. Preserve each routine's existing schedule exactly. Never assert or "restore" a schedule the data does not show, and never invent one. Report only the changes you actually made.

Keep replies tight. Summary first, offer to expand.

When the user attaches a document describing a recurring protocol (e.g. a physical-therapy home exercise program):
- Read it. Extract each distinct item, its instructions, and how many times per day it is done.
- Before creating anything, list what you found (item -> frequency) and ask the user to confirm. Only write after they confirm.
- If a frequency is unclear, ask rather than guessing. Never invent a cadence the document does not state.
- After the user confirms: (1) create a project with symphony_create_project (context "personal"); (2) if the user attached a document, call symphony_attach_source with the project id to register the source PDF on the project; (3) create one routine per item with symphony_create_routine, setting project_id to the program's project id and times_per_day when an item is done more than once a day.`

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
        scheduled_for: { type: 'string', description: "YYYY-MM-DD, or ISO8601 with a time. A time without a UTC offset (e.g. 2026-07-10T15:00:00) is read as the user's LOCAL time (US Eastern)." },
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
        parent_task_id: {
          type: 'string',
          description:
            'id of the parent task to make this a subtask of. A subtask is a STEP, not a day commitment: it is always created undated, and any scheduled_for passed alongside this is ignored. If a step genuinely happens on its own separate day, create it as a normal task and link it afterwards.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'symphony_delete_task',
    description: 'Delete a task by id. Permanent. Prefer symphony_complete_task to mark done; only delete when the user wants it removed.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
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
        needs_discussion: { type: 'boolean', description: 'Flag that the real next step is a conversation with someone, not solo work' },
        discussion_note: { type: ['string', 'null'], description: 'Who to talk to and what to decide, e.g. "Ask Iris which clothes and where to donate"' },
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
    name: 'symphony_update_project',
    description: 'Update a project by id: name, status, notes, context, or phone_number. Set status to "completed" to finish it.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string', enum: ['not_started', 'in_progress', 'on_hold', 'completed'] },
        notes: { type: ['string', 'null'] },
        context: { type: ['string', 'null'], enum: [...CONTEXT_ENUM, null] },
        phone_number: { type: ['string', 'null'] },
      },
      required: ['id'],
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
        project_id: { type: 'string', description: 'id of the program/project this exercise belongs to' },
      },
      required: ['name'],
    },
  },
  {
    name: 'symphony_list_routines',
    description: 'List recurring routines (NOT tasks). Filter by context or search (name substring). Returns id, name, context, parent_routine_id, step_order, recurrence_pattern, and timing. Use this to find existing routines before grouping them.',
    input_schema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: CONTEXT_ENUM },
        search: { type: 'string', description: 'name substring' },
      },
    },
  },
  {
    name: 'symphony_update_routine',
    description: 'Update a routine by id. Set parent_routine_id (plus step_order) to fold this routine into a parent routine as a step, or null to detach it. Also rename, change context, time_of_day, etc.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        context: { type: ['string', 'null'], enum: [...CONTEXT_ENUM, null] },
        recurrence_pattern: { type: 'object' },
        time_of_day: { type: ['string', 'null'], description: 'HH:MM' },
        times_per_day: { type: 'array', items: { type: 'string' } },
        parent_routine_id: { type: ['string', 'null'], description: 'id of the parent routine collection this is a step of' },
        step_order: { type: ['number', 'null'], description: 'order within the parent collection' },
      },
      required: ['id'],
    },
  },
  {
    name: 'symphony_create_contact',
    description: 'Create a contact (a person or service provider). category is one of family/friend/service_provider/professional/school/medical/other.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        category: { type: 'string' },
        notes: { type: 'string' },
        relationship: { type: 'string' },
        birthday: { type: 'string', description: 'YYYY-MM-DD' },
        context: { type: 'string', enum: CONTEXT_ENUM },
      },
      required: ['name'],
    },
  },
  {
    name: 'symphony_update_contact',
    description: 'Update a contact by id: name, phone, email, category, notes, relationship, birthday, or context.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        phone: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        category: { type: 'string' },
        notes: { type: ['string', 'null'] },
        relationship: { type: ['string', 'null'] },
        birthday: { type: ['string', 'null'] },
        context: { type: ['string', 'null'], enum: [...CONTEXT_ENUM, null] },
      },
      required: ['id'],
    },
  },
  {
    name: 'symphony_list_lists',
    description: "List the user's lists (e.g. grocery, packing, watchlist). Filter by category or search (title). Use symphony_get_list_items to see what is on a list.",
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        search: { type: 'string' },
      },
    },
  },
  {
    name: 'symphony_get_list_items',
    description: 'Get the items on a list by list_id (from symphony_list_lists).',
    input_schema: {
      type: 'object',
      properties: { list_id: { type: 'string' } },
      required: ['list_id'],
    },
  },
  {
    name: 'symphony_create_list',
    description: 'Create a new list. visibility is "self" (private) or "family" (shared).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        category: { type: 'string' },
        visibility: { type: 'string', enum: ['self', 'family'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'symphony_add_list_item',
    description: 'Add an item to a list (e.g. "add milk to the grocery list"). Look up the list with symphony_list_lists first to get its id.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string' },
        text: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['list_id', 'text'],
    },
  },
  {
    name: 'symphony_check_list_item',
    description: 'Mark a list item done or not done by id.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        completed: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'symphony_delete_list_item',
    description: 'Remove an item from a list by id. Permanent.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'symphony_create_note',
    description: 'Capture a note (a thought, meeting note, or reference). type defaults to quick_capture.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        type: { type: 'string', enum: ['quick_capture', 'meeting_note', 'general', 'task_note'] },
        context: { type: 'string', enum: CONTEXT_ENUM },
      },
      required: ['content'],
    },
  },
  {
    name: 'symphony_search_notes',
    description:
      "Semantic search over Scott's knowledge base (notes synced from his vault: people, projects, job search, meetings, daily logs, research, background). Use this whenever he asks what he knows about a topic, wants background or prep on something, or asks you to gather relevant material. Returns the most relevant notes with a content snippet and their vault path. Pass a natural-language query describing the topic, not just a keyword.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language description of what to find, e.g. "background and prep for the NYSRA executive director interview"' },
        limit: { type: 'number', description: 'Max notes to return (default 6, max 12)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'symphony_list_events',
    description:
      'Search calendar events. Read-only. No arguments = today. Pass start_date/end_date to cover a range (a week, a whole month). Pass query to find an event by name — for "when is X?" call with just query and it searches a year in each direction. Multi-day events that overlap the range are included.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD; defaults to today' },
        end_date: { type: 'string', description: 'YYYY-MM-DD inclusive; defaults to start_date' },
        query: { type: 'string', description: 'case-insensitive match on event title, e.g. "catskills"' },
      },
    },
  },
  {
    name: 'symphony_create_calendar_event',
    description:
      "Create a REAL Google Calendar event on the user's calendar. Use this — NOT symphony_create_task — for anything that belongs on a calendar: a show, appointment, party, reservation, or any occasion with a fixed date and time. Times without a UTC offset are read as the user's LOCAL time (US Eastern).",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        start_time: { type: 'string', description: 'ISO8601, e.g. 2026-07-10T15:00:00 (local time when no offset)' },
        end_time: { type: 'string', description: 'ISO8601; defaults to one hour after start_time' },
        all_day: { type: 'boolean' },
        domain: { type: 'string', enum: ['family', 'personal', 'work'], description: 'which calendar to write to — family occasions go on the shared family calendar' },
        location: { type: 'string' },
        description: { type: 'string', description: 'details worth keeping on the event (phone numbers, pickup instructions)' },
      },
      required: ['title', 'start_time', 'domain'],
    },
  },
  {
    name: 'symphony_delete_routine',
    description: 'Delete a routine by id. Permanent. (Pausing a routine is not yet supported via the assistant.)',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'symphony_attach_source',
    description: 'Attach the document the user shared in this message to a project as its source document. Call this once, after creating the project, when the user attached a file.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
      },
      required: ['project_id'],
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
  } else if (hasTime && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(scheduledFor)) {
    // A timed value WITHOUT an explicit offset ("2026-07-10T15:00:00") means
    // local wall-clock time to the model ("3pm"). Stored raw, Postgres reads
    // it as UTC and it lands hours off (the camp-show-at-11am bug) — convert
    // from APP_TZ to UTC instead.
    const dateStr = scheduledFor.slice(0, 10)
    const offMin = etOffsetMinutes(dateStr)
    const utcMs = Date.parse(`${scheduledFor}Z`) - offMin * 60000
    if (!Number.isNaN(utcMs)) sf = new Date(utcMs).toISOString()
  }
  return { scheduled_for: sf, is_all_day: allDay, bucket: 'timed' }
}

interface AttachmentMeta {
  storagePath: string
  fileName: string
  fileType: string
  fileSize: number
}

/** family_members accumulates duplicate rows per name across household shares;
 *  keep the first (display_order) row per case-insensitive name. */
function dedupeMembersByName<T extends { name: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    const key = (r.name ?? '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

// Embed a query with the SAME model vault-sync used for notes
// (text-embedding-3-small, 1536-dim) so cosine search is meaningful.
async function embedQuery(text: string): Promise<number[] | null> {
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiKey) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
    })
    if (!res.ok) { console.error('embedQuery error:', await res.text()); return null }
    const json = await res.json()
    return json.data?.[0]?.embedding ?? null
  } catch (err) {
    console.error('embedQuery failed:', err)
    return null
  }
}

// ── Tool executor (RLS-scoped via userSupabase) ────────────────────
async function runTool(
  db: SupabaseClient,
  userId: string,
  name: string,
  input: Record<string, unknown>,
  attachment: AttachmentMeta | null,
  currentMemberId: string | null,
  authHeader: string,
  // Structured side-channel: search_notes pushes the notes it found here so the
  // handler can surface them to the client as clickable source chips.
  sourceSink: Array<{ id: string; title: string; vaultPath?: string }>,
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
        // A subtask is a STEP, not a day commitment, so it is born undated —
        // matching the in-app addSubtask. Passing the parent's scheduled_for
        // down to every child is what produced five permanent Today rows from
        // one decomposed task ("Brainstorm vacation ideas", 2026-07-31): each
        // step independently qualified as overdue, forever.
        const isSubtask = !!rest.parent_task_id
        const sched = isSubtask
          ? { scheduled_for: null, is_all_day: null }
          : normalizeSchedule(scheduled_for, is_all_day)
        const bucket = sched.scheduled_for ? 'timed' : (isSubtask ? 'inbox' : ((rawBucket as string) ?? 'inbox'))
        const row: Record<string, unknown> = {
          ...rest,
          scheduled_for: sched.scheduled_for,
          is_all_day: sched.is_all_day,
          bucket,
          user_id: userId,
          completed: false,
        }
        // Assign the caller by default (mirrors QuickCapture and the routine
        // tool below): Today's "my tasks" filter hides unassigned items, so
        // an agent-created task/event would otherwise silently never render.
        if (row.assigned_to == null && currentMemberId) {
          row.assigned_to = currentMemberId
          row.assigned_to_all = [currentMemberId]
        }
        // Scope defaults from the life domain (defaultScopeForArea in the app):
        // family items are household-visible, everything else stays private.
        if (row.scope == null) {
          row.scope = row.context === 'family' ? 'compound' : 'individual'
        }
        const { data, error } = await db.from('tasks')
          .insert(row)
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
      case 'symphony_create_calendar_event': {
        // Convert offsetless local times to UTC (same convention as tasks).
        const toUtcIso = (v: string): string => {
          if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(v) || !/T\d{2}:\d{2}/.test(v)) return v
          const offMin = etOffsetMinutes(v.slice(0, 10))
          const ms = Date.parse(`${v}Z`) - offMin * 60000
          return Number.isNaN(ms) ? v : new Date(ms).toISOString()
        }
        const start = toUtcIso(String(input.start_time))
        const end = input.end_time
          ? toUtcIso(String(input.end_time))
          : new Date(Date.parse(start) + 60 * 60000).toISOString()
        // The user's default WRITABLE calendar for the requested domain.
        const { data: mappings, error: mapErr } = await db
          .from('calendar_domain_mappings')
          .select('calendar_id, calendar_name, access_role, is_default')
          .eq('user_id', userId)
          .eq('domain', input.domain)
          .in('access_role', ['owner', 'writer'])
        if (mapErr) throw mapErr
        const writable = mappings ?? []
        const target = writable.find((m) => m.is_default) ?? writable[0]
        if (!target) {
          return `Error: no writable ${input.domain} calendar is connected. The user needs to connect Google Calendar (Settings) or pick a different domain.`
        }
        // Reuse the app's create-event edge fn (token refresh, idempotency)
        // by forwarding the caller's JWT.
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-create-event`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: input.title,
            description: input.description,
            startTime: start,
            endTime: end,
            allDay: input.all_day === true,
            timeZone: APP_TZ,
            location: input.location,
            calendarId: target.calendar_id,
            requestId: crypto.randomUUID(),
          }),
        })
        const body = await res.text()
        if (!res.ok) return `Error creating calendar event (${res.status}): ${body.slice(0, 300)}`
        return `Created Google Calendar event on "${target.calendar_name}" (${start} to ${end} UTC): ${body.slice(0, 400)}`
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
        // NOTE: the names/roles live in family_members (household_members is
        // an invite/membership table with no name column).
        const { data, error } = await db.from('family_members')
          .select('id, name, role_label, member_type, is_full_user')
          .order('display_order')
        if (error) throw error
        return JSON.stringify(dedupeMembersByName(data ?? []), null, 2)
      }
      case 'symphony_daily_summary': {
        const today = new Date().toISOString().split('T')[0]
        const start = `${today}T00:00:00`, end = `${today}T23:59:59`
        const [todayT, inboxT, waitingT, overdueT, eventsT] = await Promise.all([
          db.from('tasks').select('id, title, completed, scheduled_for, context, category, is_waiting')
            .eq('bucket', 'timed').gte('scheduled_for', start).lte('scheduled_for', end).order('scheduled_for'),
          db.from('tasks').select('id, title, context, created_at').eq('bucket', 'inbox').eq('completed', false),
          db.from('tasks').select('id, title, context').eq('is_waiting', true).eq('completed', false),
          db.from('tasks').select('id, title, scheduled_for, context')
            .eq('bucket', 'timed').eq('completed', false).lt('scheduled_for', start),
          db.from('calendar_events').select('id, title, start_time, end_time, all_day, location, meeting_url')
            .gte('start_time', start).lte('start_time', end).order('start_time'),
        ])
        return JSON.stringify({
          date: today,
          today: { total: todayT.data?.length ?? 0, remaining: todayT.data?.filter((t) => !t.completed).length ?? 0, tasks: todayT.data ?? [] },
          events: { count: eventsT.data?.length ?? 0, events: eventsT.data ?? [] },
          inbox: { count: inboxT.data?.length ?? 0, tasks: inboxT.data ?? [] },
          waiting: { count: waitingT.data?.length ?? 0, tasks: waitingT.data ?? [] },
          overdue: { count: overdueT.data?.length ?? 0, tasks: overdueT.data ?? [] },
        }, null, 2)
      }
      case 'symphony_create_routine': {
        const { recurrence_pattern, ...rest } = input as Record<string, unknown>
        const row: Record<string, unknown> = {
          ...rest,
          recurrence_pattern: recurrence_pattern ?? { type: 'daily' },
          visibility: 'active',
          show_on_timeline: true,
          user_id: userId,
        }
        // Assign a personal routine to the caller so it passes the Today
        // "my tasks" filter (otherwise unassigned routines are hidden). Family
        // routines stay unassigned/shared. Only fills when not explicitly set.
        const ctx = row.context
        if (row.assigned_to == null && currentMemberId && (ctx === 'personal' || ctx == null)) {
          row.assigned_to = currentMemberId
          row.assigned_to_all = [currentMemberId]
        }
        // Pin dosed routines (an N-times-per-day protocol like PT) so the
        // "hide daily" toggle can't sweep them off Today.
        if (row.pin_to_timeline == null && Array.isArray(row.times_per_day) && row.times_per_day.length > 0) {
          row.pin_to_timeline = true
        }
        const { data, error } = await db.from('routines').insert(row).select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_list_routines': {
        let q = db.from('routines')
          .select('id, name, context, parent_routine_id, step_order, recurrence_pattern, time_of_day, times_per_day, visibility')
          .order('name')
        if (input.context) q = q.eq('context', input.context)
        if (input.search) q = q.ilike('name', `%${input.search}%`)
        const { data, error } = await q
        if (error) throw error
        return `${(data || []).length} routines:\n${JSON.stringify(data, null, 2)}`
      }
      case 'symphony_update_routine': {
        const { id, ...updates } = input as Record<string, unknown>
        if (!id) return 'Error: id is required'
        const { data, error } = await db.from('routines')
          .update(updates).eq('id', id).select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_delete_task': {
        if (!input.id) return 'Error: id is required'
        const { error } = await db.from('tasks').delete().eq('id', input.id)
        if (error) throw error
        return `Task ${input.id} deleted.`
      }
      case 'symphony_update_project': {
        const { id, ...updates } = input as Record<string, unknown>
        if (!id) return 'Error: id is required'
        const { data, error } = await db.from('projects')
          .update({ ...updates, updated_at: now() }).eq('id', id).select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_create_contact': {
        const { data, error } = await db.from('contacts')
          .insert({ ...input, user_id: userId }).select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_update_contact': {
        const { id, ...updates } = input as Record<string, unknown>
        if (!id) return 'Error: id is required'
        const { data, error } = await db.from('contacts')
          .update({ ...updates, updated_at: now() }).eq('id', id).select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_list_lists': {
        let q = db.from('lists').select('id, title, category, visibility, icon')
          .order('sort_order', { ascending: true, nullsFirst: false })
        if (input.category) q = q.eq('category', input.category)
        if (input.search) q = q.ilike('title', `%${input.search}%`)
        const { data, error } = await q
        if (error) throw error
        return `${(data || []).length} lists:\n${JSON.stringify(data, null, 2)}`
      }
      case 'symphony_get_list_items': {
        if (!input.list_id) return 'Error: list_id is required'
        const { data, error } = await db.from('list_items')
          .select('id, text, note, completed, sort_order, parent_item_id')
          .eq('list_id', input.list_id)
          .order('sort_order', { ascending: true, nullsFirst: false })
        if (error) throw error
        return `${(data || []).length} items:\n${JSON.stringify(data, null, 2)}`
      }
      case 'symphony_create_list': {
        const { data, error } = await db.from('lists')
          .insert({ title: input.title, category: input.category, visibility: input.visibility ?? 'self', user_id: userId })
          .select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_add_list_item': {
        if (!input.list_id || !input.text) return 'Error: list_id and text are required'
        const { data, error } = await db.from('list_items')
          .insert({ list_id: input.list_id, text: input.text, note: input.note, user_id: userId, completed: false })
          .select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_check_list_item': {
        if (!input.id) return 'Error: id is required'
        const completed = input.completed === undefined ? true : !!input.completed
        const { data, error } = await db.from('list_items')
          .update({ completed, completed_at: completed ? now() : null, updated_at: now() })
          .eq('id', input.id).select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_delete_list_item': {
        if (!input.id) return 'Error: id is required'
        const { error } = await db.from('list_items').delete().eq('id', input.id)
        if (error) throw error
        return `Item ${input.id} deleted.`
      }
      case 'symphony_create_note': {
        // Never SELECT * on notes (embedding column would time out) — pick columns.
        const { data, error } = await db.from('notes')
          .insert({
            title: input.title ?? null,
            content: input.content,
            type: input.type ?? 'quick_capture',
            context: input.context ?? null,
            // Same coupling the task path already applies below: notes RLS
            // shares on scope, so a family note without this stays private.
            scope: input.context === 'family' ? 'compound' : 'individual',
            source: 'assistant',
            user_id: userId,
          })
          .select('id, title, type, context, created_at').single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
      case 'symphony_search_notes': {
        const query = typeof input.query === 'string' ? input.query.trim() : ''
        if (!query) return 'Error: query is required'
        const limit = Math.min(typeof input.limit === 'number' ? input.limit : 6, 12)
        const embedding = await embedQuery(query)

        type NoteHit = { id: string; title: string | null; content: string | null; vault_path: string | null; context: string | null; similarity?: number }
        let hits: NoteHit[] = []
        if (embedding) {
          // Semantic search via the existing pgvector RPC (auth.uid()-scoped).
          const { data, error } = await db.rpc('search_notes_semantic', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit,
          })
          if (error) throw error
          hits = (data as NoteHit[]) ?? []
        }
        // Fallback: no embedding (missing key) or nothing cleared the threshold —
        // keyword search so the assistant still finds obviously-relevant notes.
        if (hits.length === 0) {
          const { data, error } = await db.from('notes')
            .select('id, title, content, vault_path, context')
            .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
            .limit(limit)
          if (error) throw error
          hits = (data as NoteHit[]) ?? []
        }
        if (hits.length === 0) return `No notes found for "${query}".`

        // Surface each hit to the client as a clickable chip (opens in-app).
        for (const n of hits) {
          sourceSink.push({
            id: n.id,
            title: n.title || (n.vault_path ? n.vault_path.split('/').pop()! : 'Untitled'),
            vaultPath: n.vault_path ?? undefined,
          })
        }

        // Snippet the content — never dump full notes into the context window.
        const results = hits.map((n) => ({
          title: n.title || (n.vault_path ? n.vault_path.split('/').pop() : 'Untitled'),
          vault_path: n.vault_path,
          context: n.context,
          similarity: typeof n.similarity === 'number' ? Number(n.similarity.toFixed(3)) : undefined,
          snippet: (n.content || '').replace(/\s+/g, ' ').slice(0, 500),
        }))
        return `${results.length} notes for "${query}":\n${JSON.stringify(results, null, 2)}`
      }
      case 'symphony_list_events': {
        const shiftDate = (iso: string, days: number) => {
          const d = new Date(`${iso}T00:00:00Z`)
          d.setUTCDate(d.getUTCDate() + days)
          return d.toISOString().split('T')[0]
        }
        const today = new Date().toISOString().split('T')[0]
        const search = typeof input.query === 'string' && input.query.trim() ? input.query.trim() : null
        let start = typeof input.start_date === 'string' ? input.start_date : null
        let end = typeof input.end_date === 'string' ? input.end_date : start
        if (!start) {
          // Bare title search sweeps a year in each direction; a plain listing means today.
          start = search ? shiftDate(today, -365) : today
          end = search ? shiftDate(today, 365) : today
        }
        // Overlap semantics so multi-day events mid-range still match.
        let q = db.from('calendar_events')
          .select('id, title, start_time, end_time, all_day, location, meeting_url, calendar_name')
          .lte('start_time', `${end}T23:59:59`)
          .gte('end_time', `${start}T00:00:00`)
        if (search) q = q.ilike('title', `%${search}%`)
        const { data, error } = await q.order('start_time').limit(100)
        if (error) throw error
        const range = start === end ? `on ${start}` : `from ${start} to ${end}`
        return `${(data || []).length} events ${range}${search ? ` matching "${search}"` : ''}:\n${JSON.stringify(data, null, 2)}`
      }
      case 'symphony_delete_routine': {
        if (!input.id) return 'Error: id is required'
        const { error } = await db.from('routines').delete().eq('id', input.id)
        if (error) throw error
        return `Routine ${input.id} deleted.`
      }
      case 'symphony_attach_source': {
        if (!attachment) return 'Error: No document was attached to this message.'
        if (!input.project_id) return 'Error: project_id is required'
        const { data, error } = await db.from('attachments')
          .insert({
            user_id: userId,
            entity_type: 'project',
            entity_id: input.project_id,
            file_name: attachment.fileName,
            file_type: attachment.fileType,
            file_size: attachment.fileSize,
            storage_path: attachment.storagePath,
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

  const body = await req.json().catch(() => ({}))
  const incoming = body.messages
  const attachment: AttachmentMeta | null = body.attachment ?? null
  const currentMemberId: string | null = typeof body.currentMemberId === 'string' ? body.currentMemberId : null
  // Optional item scoping: the client says which task/routine this conversation
  // is about, so the agent can help make it doable without the user re-typing it.
  const rawTaskContext = body.taskContext
  const taskContext: { id: string; title: string; kind?: string; notes?: string | null; projectName?: string | null } | null =
    rawTaskContext && typeof rawTaskContext.id === 'string' && typeof rawTaskContext.title === 'string'
      ? rawTaskContext
      : null
  // Optional planning-session scoping: the client says which guided session +
  // step the user is inside, with the live lists, so the agent can coach the
  // moment without any re-describing. Titles only; lists are capped client-side.
  const rawSessionContext = body.sessionContext
  const sessionContext: {
    horizon: string; periodLabel: string; stepId: string; stepTitle: string
    bucket?: string; listTitles?: string[]; aboveTitles?: string[]; goalNames?: string[]
  } | null =
    rawSessionContext && typeof rawSessionContext.horizon === 'string' && typeof rawSessionContext.stepTitle === 'string'
      ? rawSessionContext
      : null
  if (!Array.isArray(incoming) || incoming.length === 0) return json({ error: 'messages is required' }, 400)

  // Who's who: inject the household roster so names like "Iris" or "Kaleb"
  // resolve without a lookup, and assigned_to gets real member ids.
  let familyLine = ''
  try {
    const { data: fam } = await db.from('family_members')
      .select('id, name, role_label, member_type')
      .order('display_order')
    const unique = dedupeMembersByName(fam ?? [])
    if (unique.length > 0) {
      const roster = unique.map((m) => {
        const me = currentMemberId && m.id === currentMemberId ? ', THE USER you are talking to' : ''
        return `${m.name} (${m.role_label || m.member_type || 'member'}${me}) [id ${m.id}]`
      }).join('; ')
      familyLine = `\n(Household members: ${roster}. Use these ids for assigned_to. When one of these names comes up, you already know who they are — don't ask.)`
    }
  } catch (_e) {
    // Roster is a nice-to-have; never fail the request over it.
  }

  const today = new Date().toISOString().split('T')[0]
  let datePrefix = `(Today is ${today}.)${familyLine}`
  if (taskContext) {
    const isRoutine = taskContext.kind === 'routine'
    if (isRoutine) {
      // routine-kind taskContext.id is a routines row, not a task — assembleContext only
      // knows tasks/calendar_events/projects, so routines always get the thin rendering.
      const notesPart = taskContext.notes ? ` Notes: ${taskContext.notes}.` : ''
      datePrefix += `\n(This conversation is about the recurring routine "${taskContext.title}" (id ${taskContext.id}).${notesPart}` +
        ' The user wants help making this routine work. You can adjust it via symphony_update_routine' +
        ' (time_of_day, recurrence), create supporting tasks with symphony_create_task, or talk through' +
        ' how to structure it. Look the routine up by id before writing to it.)'
    } else {
      let taskContextBlock = ''
      try {
        const bundle = await assembleContext(
          { client: service, openAiKey: Deno.env.get('OPENAI_API_KEY') ?? undefined },
          { entityType: 'task', entityId: taskContext.id, userId: user.id },
        )
        taskContextBlock = `\nThe user is asking about this item — full assembled context:\n${renderBundleForPrompt(bundle)}`
        if (bundle.degraded.length) taskContextBlock += `\n(context parts unavailable: ${bundle.degraded.join(', ')})`
      } catch (_e) {
        // Fall back to the thin client-provided fields — never fail the chat over context.
        const notesPart = taskContext.notes ? ` Notes: ${taskContext.notes}.` : ''
        const projectPart = taskContext.projectName ? ` Project: ${taskContext.projectName}.` : ''
        taskContextBlock = `\nThe user is asking about the task "${taskContext.title}" (id ${taskContext.id}).${notesPart}${projectPart}`
      }
      datePrefix += taskContextBlock +
        '\nThe user wants help making this task doable. You can: break it into subtasks' +
        ' (symphony_create_task with parent_task_id), enrich its notes with what you find out,' +
        ' or — when the real next step is a conversation with someone — set needs_discussion true' +
        ' with a discussion_note via symphony_update_task. Look the task up by id before writing to it.'
    }
  }
  if (sessionContext) {
    const strList = (label: string, items?: string[]) =>
      items && items.length > 0 ? ` ${label}: ${items.map((t) => `"${t}"`).join(', ')}.` : ''
    datePrefix +=
      `\n(The user is INSIDE their ${sessionContext.horizon} planning session — period ${sessionContext.periodLabel},` +
      ` step "${sessionContext.stepTitle}".` +
      strList('Their current list', sessionContext.listTitles) +
      strList('The level above', sessionContext.aboveTitles) +
      strList('Their year goals', sessionContext.goalNames) +
      ' You are their planning guide for this moment: be warm and brief, help break big items into' +
      ' moves sized to this horizon, name what the lists reveal, and keep plans honest about time and energy.' +
      ' Never restate the lists back at them. Suggest — do not write. Only create or change tasks when' +
      ' the user explicitly asks; then use the right bucket for this horizon' +
      (sessionContext.bucket ? ` (bucket "${sessionContext.bucket}")` : '') + '.' +
      ' When asked for moves/suggestions in JSON, return ONLY the JSON array.)'
  }
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
      // Notes surfaced by search_notes across the turn → clickable source chips.
      const sourceNotes: Array<{ id: string; title: string; vaultPath?: string }> = []
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
              const result = await runTool(db, user.id, block.name, block.input ?? {}, attachment, currentMemberId, authHeader, sourceNotes)
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
        const seen = new Set<string>()
        const sources = sourceNotes.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
        send({ type: 'done', reply: finalText, sessionId: null, sources })
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
