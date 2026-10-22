#!/usr/bin/env npx tsx
/**
 * Symphony OS MCP Server
 *
 * Exposes Symphony task/project/contact management as MCP tools
 * so external Claude Code projects (like Scott EA) can interact
 * with Symphony data natively.
 *
 * Usage:
 *   npx tsx tools/symphony-mcp-server.ts
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_USER_EMAIL, SUPABASE_USER_PASSWORD
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { normalizeScheduledFor } from '../src/lib/scheduledFor'

// --- Config ---

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!
const SUPABASE_USER_EMAIL = process.env.SUPABASE_USER_EMAIL!
const SUPABASE_USER_PASSWORD = process.env.SUPABASE_USER_PASSWORD!

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_USER_EMAIL || !SUPABASE_USER_PASSWORD) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_USER_EMAIL, SUPABASE_USER_PASSWORD')
  process.exit(1)
}

// --- Supabase client with auth ---

let supabase: SupabaseClient
let userId: string

async function initSupabase() {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: SUPABASE_USER_EMAIL,
    password: SUPABASE_USER_PASSWORD,
  })
  if (error) {
    console.error('Supabase auth failed:', error.message)
    process.exit(1)
  }
  userId = data.user.id
}

// --- DB field mapping (camelCase ↔ snake_case) ---

function toDbTask(input: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    scheduledFor: 'scheduled_for',
    isAllDay: 'is_all_day',
    isWaiting: 'is_waiting',
    contactId: 'contact_id',
    assignedTo: 'assigned_to',
    projectId: 'project_id',
    parentTaskId: 'parent_task_id',
    phoneNumber: 'phone_number',
    estimatedDuration: 'estimated_duration',
    locationPlaceId: 'location_place_id',
    deferCount: 'defer_count',
    linkType: 'link_type',
  }
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    const dbKey = map[k] ?? k
    // Date-only strings must become local midnight (the app's convention) —
    // raw "YYYY-MM-DD" stores UTC midnight, rendering a day early in US zones.
    result[dbKey] = dbKey === 'scheduled_for' ? normalizeScheduledFor(v) : v
  }
  return result
}

function fromDbTask(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    bucket: row.bucket,
    scheduledFor: row.scheduled_for,
    isAllDay: row.is_all_day,
    context: row.context,
    category: row.category,
    notes: row.notes,
    links: row.links,
    phoneNumber: row.phone_number,
    contactId: row.contact_id,
    assignedTo: row.assigned_to,
    projectId: row.project_id,
    parentTaskId: row.parent_task_id,
    isWaiting: row.is_waiting,
    estimatedDuration: row.estimated_duration,
    location: row.location,
    deferCount: row.defer_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// --- MCP Server ---

const server = new McpServer({
  name: 'symphony',
  version: '1.0.0',
})

// ── Tasks ────────────────────────────────────────────────

server.tool(
  'symphony_create_task',
  `Create a task in Symphony OS.

Buckets:
  - "inbox" (default): unscheduled, needs triage
  - "timed": scheduled for a specific date (requires scheduled_for)
  - "week": deferred to this week's planning
  - "month": deferred to monthly review
  - "quarter": deferred to quarterly review

Context (life domain):
  - "work": professional tasks
  - "family": household/family tasks
  - "personal": personal tasks
  - null: untagged

Category:
  - "task" (default), "chore", "errand", "event", "activity"`,
  {
    title: z.string().describe('Task title'),
    bucket: z.enum(['inbox', 'timed', 'week', 'month', 'quarter']).default('inbox').describe('Planning bucket'),
    scheduled_for: z.string().optional().describe('ISO date for timed tasks (YYYY-MM-DD or ISO8601)'),
    is_all_day: z.boolean().default(true).describe('All-day task (true) or specific time (false)'),
    context: z.enum(['work', 'family', 'personal']).optional().describe('Life domain'),
    category: z.enum(['task', 'chore', 'errand', 'event', 'activity']).default('task'),
    notes: z.string().optional().describe('Task notes / details'),
    project_id: z.string().optional().describe('UUID of parent project'),
    contact_id: z.string().optional().describe('UUID of related contact (who task is ABOUT)'),
    assigned_to: z.string().optional().describe('UUID of family member who should DO this'),
    phone_number: z.string().optional().describe('Phone number for calls'),
    location: z.string().optional().describe('Address or place name'),
    estimated_duration: z.number().optional().describe('Duration in minutes'),
    links: z.array(z.object({ url: z.string(), title: z.string().optional() })).optional().describe('Related URLs'),
  },
  async (params) => {
    const bucket = params.scheduled_for ? 'timed' : params.bucket
    const dbData = toDbTask({
      ...params,
      bucket,
      user_id: userId,
      completed: false,
    })
    // Remove non-DB fields
    delete dbData.title
    const { data, error } = await supabase
      .from('tasks')
      .insert({ title: params.title, ...dbData })
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(fromDbTask(data), null, 2) }] }
  }
)

server.tool(
  'symphony_list_tasks',
  `List tasks from Symphony OS. Returns up to 50 tasks matching filters.

Common queries:
  - Today's tasks: bucket="timed", scheduled_for="2026-03-17"
  - Inbox (untriaged): bucket="inbox"
  - Incomplete work tasks: completed=false, context="work"
  - Waiting on someone: is_waiting=true`,
  {
    bucket: z.enum(['inbox', 'timed', 'week', 'month', 'quarter']).optional(),
    context: z.enum(['work', 'family', 'personal']).optional(),
    completed: z.boolean().optional().describe('Filter by completion status'),
    is_waiting: z.boolean().optional(),
    project_id: z.string().optional(),
    scheduled_for: z.string().optional().describe('Filter timed tasks by date (YYYY-MM-DD)'),
    search: z.string().optional().describe('Search task titles (case-insensitive)'),
    limit: z.number().default(50).describe('Max results (default 50)'),
  },
  async (params) => {
    let query = supabase.from('tasks').select('*').order('scheduled_for', { ascending: true, nullsFirst: false })

    if (params.bucket) query = query.eq('bucket', params.bucket)
    if (params.context) query = query.eq('context', params.context)
    if (params.completed !== undefined) query = query.eq('completed', params.completed)
    if (params.is_waiting !== undefined) query = query.eq('is_waiting', params.is_waiting)
    if (params.project_id) query = query.eq('project_id', params.project_id)
    if (params.search) query = query.ilike('title', `%${params.search}%`)
    if (params.scheduled_for) {
      const start = `${params.scheduled_for}T00:00:00`
      const end = `${params.scheduled_for}T23:59:59`
      query = query.gte('scheduled_for', start).lte('scheduled_for', end)
    }

    query = query.limit(params.limit)

    const { data, error } = await query
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }

    const tasks = (data || []).map(fromDbTask)
    return { content: [{ type: 'text' as const, text: `${tasks.length} tasks:\n${JSON.stringify(tasks, null, 2)}` }] }
  }
)

server.tool(
  'symphony_update_task',
  `Update a task in Symphony. Use this to reschedule, change context, add notes, mark complete, etc.

To schedule a task: set bucket="timed" and scheduled_for to the date.
To move to inbox: set bucket="inbox" and clear scheduled_for.
To mark waiting: set is_waiting=true.`,
  {
    id: z.string().describe('Task UUID'),
    title: z.string().optional(),
    completed: z.boolean().optional(),
    bucket: z.enum(['inbox', 'timed', 'week', 'month', 'quarter']).optional(),
    scheduled_for: z.string().optional().nullable().describe('ISO date or null to clear'),
    is_all_day: z.boolean().optional(),
    context: z.enum(['work', 'family', 'personal']).optional().nullable(),
    category: z.enum(['task', 'chore', 'errand', 'event', 'activity']).optional(),
    notes: z.string().optional().nullable(),
    project_id: z.string().optional().nullable(),
    contact_id: z.string().optional().nullable(),
    assigned_to: z.string().optional().nullable(),
    phone_number: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    estimated_duration: z.number().optional().nullable(),
    is_waiting: z.boolean().optional(),
    links: z.array(z.object({ url: z.string(), title: z.string().optional() })).optional().nullable(),
  },
  async (params) => {
    const { id, ...updates } = params
    const dbUpdates = toDbTask(updates as Record<string, unknown>)
    dbUpdates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(fromDbTask(data), null, 2) }] }
  }
)

server.tool(
  'symphony_complete_task',
  'Mark a task as completed or uncompleted.',
  {
    id: z.string().describe('Task UUID'),
    completed: z.boolean().default(true).describe('true to complete, false to uncomplete'),
  },
  async (params) => {
    const { data, error } = await supabase
      .from('tasks')
      .update({ completed: params.completed, completed_at: params.completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: `Task "${data.title}" ${params.completed ? 'completed' : 'uncompleted'}` }] }
  }
)

server.tool(
  'symphony_delete_task',
  'Permanently delete a task.',
  { id: z.string().describe('Task UUID') },
  async (params) => {
    const { error } = await supabase.from('tasks').delete().eq('id', params.id)
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: 'Task deleted.' }] }
  }
)

// ── Projects ────────────────────────────────────────────

server.tool(
  'symphony_list_projects',
  `List projects in Symphony. Projects are containers for related tasks.
Status: not_started, in_progress, on_hold, completed.
Context: work, family, personal.`,
  {
    status: z.enum(['not_started', 'in_progress', 'on_hold', 'completed']).optional(),
    context: z.enum(['work', 'family', 'personal']).optional(),
    search: z.string().optional().describe('Search project names'),
  },
  async (params) => {
    let query = supabase.from('projects').select('*').order('updated_at', { ascending: false })

    if (params.status) query = query.eq('status', params.status)
    if (params.context) query = query.eq('context', params.context)
    if (params.search) query = query.ilike('name', `%${params.search}%`)

    const { data, error } = await query
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: `${(data || []).length} projects:\n${JSON.stringify(data, null, 2)}` }] }
  }
)

server.tool(
  'symphony_create_project',
  'Create a new project in Symphony.',
  {
    name: z.string().describe('Project name'),
    status: z.enum(['not_started', 'in_progress', 'on_hold', 'completed']).default('not_started'),
    context: z.enum(['work', 'family', 'personal']).optional(),
    notes: z.string().optional(),
    links: z.array(z.object({ url: z.string(), title: z.string().optional() })).optional(),
    phone_number: z.string().optional(),
  },
  async (params) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ ...params, user_id: userId })
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
)

// ── Choices ─────────────────────────────────────────────

const toolText = (text: string) => ({ content: [{ type: 'text' as const, text }] })
const toolError = (text: string) => toolText(`Error: ${text}`)

server.tool(
  'symphony_list_choices',
  `List choices (options being compared: contractors, schools, camps) with each option's status, contact,
values by column, priced lines, price for the selected work and for all the work, who is waiting since when,
and follow-up dates. With goal_id: that goal's choices (month/season goal task id or year goal id), decided ones too.
Without it: every open choice. Facts only; nothing is ranked.`,
  { goal_id: z.string().optional().describe('Goal id (task id for month/season goals, goals id for year goals)') },
  async (params) => {
    try {
      return toolText(await readChoicesLocal(params.goal_id))
    } catch (e) {
      return toolError(e instanceof Error ? e.message : String(e))
    }
  }
)

server.tool(
  'symphony_add_option',
  'Add an option to a choice. With phone, creates a contact and links it to the option.',
  {
    choice_id: z.string().describe('Choice UUID (from symphony_list_choices)'),
    name: z.string().describe('Option name, e.g. "Martinez Tile & Bath"'),
    phone: z.string().optional().describe('Phone number; creates and links a new contact'),
  },
  async (params) => {
    const name = params.name.trim()
    if (!name) return toolError('name is required')
    const { data: choice, error: cErr } = await supabase
      .from('choices').select('id, goal_task_id, goal_id').eq('id', params.choice_id).maybeSingle()
    if (cErr) return toolError(cErr.message)
    if (!choice) return toolError('No such choice')

    let contactId: string | null = null
    const phone = params.phone?.trim()
    if (phone) {
      const context = await goalContext(choice as { goal_task_id: string | null; goal_id: string | null })
      const row: Record<string, unknown> = { user_id: userId, name, phone }
      if (context === 'family') { row.context = 'family'; row.scope = 'compound' } // scopeForDomain: family → compound
      const { data: contact, error } = await supabase.from('contacts').insert(row).select('id').single()
      if (error) return toolError(`Could not create the contact: ${error.message}`)
      contactId = contact.id as string
    }
    const row: Record<string, unknown> = { user_id: userId, choice_id: params.choice_id, name }
    if (contactId) row.contact_id = contactId
    const { data, error } = await supabase.from('choice_options').insert(row).select('id, name, status, contact_id').single()
    if (error) return toolError(error.message)
    return toolText(JSON.stringify(data, null, 2))
  }
)

server.tool(
  'symphony_set_price_line',
  `Add a price line to an option: one amount covering one or more pieces of the choice's work.
work_labels are matched (case-insensitive) against the choice's work list. amount is in dollars (e.g. 19750 or 18400.50).`,
  {
    option_id: z.string().describe('Option UUID (from symphony_list_choices)'),
    work_labels: z.array(z.string()).min(1).describe("Labels of the work this price covers"),
    amount: z.number().describe('Dollars'),
    note: z.string().optional().describe('e.g. "excludes fixtures"'),
  },
  async (params) => {
    if (!Number.isFinite(params.amount) || params.amount < 0 || params.amount > 1_000_000_000 || !Number.isSafeInteger(Math.round(params.amount * 100))) {
      return toolError('amount must be a number of dollars, 0 to 1,000,000,000')
    }
    const { data: option, error: oErr } = await supabase
      .from('choice_options').select('id, choice_id').eq('id', params.option_id).maybeSingle()
    if (oErr) return toolError(oErr.message)
    if (!option) return toolError('No such option')
    const { data: choice, error: cErr } = await supabase
      .from('choices').select('work').eq('id', option.choice_id).single()
    if (cErr) return toolError(cErr.message)
    const work = ((choice.work ?? []) as WorkPiece[])
    if (work.length === 0) return toolError('This choice has no work list yet; add work pieces on the page first.')

    const ids: string[] = []
    for (const label of params.work_labels) {
      const piece = work.find((w) => w.label.trim().toLowerCase() === label.trim().toLowerCase())
      if (!piece) return toolError(`Unknown work label "${label}". This choice's work: ${work.map((w) => w.label).join(', ')}`)
      if (!ids.includes(piece.id)) ids.push(piece.id)
    }
    const row: Record<string, unknown> = {
      user_id: userId, option_id: params.option_id, work_ids: ids, amount_cents: Math.round(params.amount * 100),
    }
    const note = params.note?.trim()
    if (note) row.note = note
    const { error } = await supabase.from('choice_price_lines').insert(row)
    if (error) return toolError(error.message)
    return toolText(`Added: ${workLabel(ids, work)} ${formatCents(Math.round(params.amount * 100))}${note ? ` (${note})` : ''}`)
  }
)

server.tool(
  'symphony_update_option',
  `Update an option: status (considering, contacted, heard_back, ruled_out), a column value, and/or notes.
status chosen is refused: choosing an option decides the choice, which is done in the app (Choose this) or in Symphony's chat.
value is read by the column's kind: money "$19,750", yes/no, date YYYY-MM-DD, or text. An empty value clears it.`,
  {
    option_id: z.string().describe('Option UUID (from symphony_list_choices)'),
    status: z.enum(['considering', 'contacted', 'heard_back', 'ruled_out', 'chosen']).optional(),
    column_label: z.string().optional().describe("An existing column's label (needs value)"),
    value: z.string().optional().describe('The value for column_label'),
    notes: z.string().optional(),
  },
  async (params) => {
    if (params.status === 'chosen') {
      return toolError("An option becomes Chosen only by deciding the choice: choose it in the app (Choose this on the comparison page) or ask in Symphony's chat. Nothing was changed.")
    }
    if ((params.column_label === undefined) !== (params.value === undefined)) {
      return toolError('column_label and value go together')
    }
    const { data: option, error: oErr } = await supabase
      .from('choice_options').select('id, choice_id, values').eq('id', params.option_id).maybeSingle()
    if (oErr) return toolError(oErr.message)
    if (!option) return toolError('No such option')

    const patch: Record<string, unknown> = {}
    if (params.status) {
      patch.status = params.status
      patch.status_changed_at = new Date().toISOString()
    }
    if (params.notes !== undefined) patch.notes = params.notes.trim() === '' ? null : params.notes
    if (params.column_label !== undefined && params.value !== undefined) {
      const { data: choice, error: cErr } = await supabase
        .from('choices').select('columns').eq('id', option.choice_id).single()
      if (cErr) return toolError(cErr.message)
      const columns = ((choice.columns ?? []) as { id: string; label: string; kind: 'text' | 'money' | 'date' | 'yesno' }[])
      const col = columns.find((c) => c.label.trim().toLowerCase() === params.column_label!.trim().toLowerCase())
      if (!col) return toolError(`Unknown column "${params.column_label}". Columns: ${columns.map((c) => c.label).join(', ') || '(none)'}`)
      const parsed = parseCellLocal(col.kind, params.value)
      if (parsed === undefined) return toolError(`"${params.value}" is not a valid ${col.kind} value for "${col.label}"`)
      const values = { ...((option.values ?? {}) as Record<string, unknown>) }
      if (parsed === null) delete values[col.id]
      else values[col.id] = parsed
      patch.values = values
    }
    if (Object.keys(patch).length === 0) return toolError('Nothing to update: give status, column_label + value, or notes')
    const { data, error } = await supabase
      .from('choice_options').update(patch).eq('id', params.option_id).select('id, name, status, values, notes')
    if (error) return toolError(error.message)
    if (!data || data.length === 0) return toolError('Option not updated (not found or not allowed)')
    return toolText(JSON.stringify(data[0], null, 2))
  }
)

// ── Contacts ────────────────────────────────────────────

server.tool(
  'symphony_list_contacts',
  `List contacts in Symphony. Contacts are people linked to tasks.
Categories: family, friend, service_provider, professional, school, medical, other.

contact_id = who the task is ABOUT (e.g., "Call Dr. Smith" → Dr. Smith)
assigned_to = who should DO the task (family member)`,
  {
    category: z.enum(['family', 'friend', 'service_provider', 'professional', 'school', 'medical', 'other']).optional(),
    search: z.string().optional().describe('Search contact names'),
  },
  async (params) => {
    let query = supabase.from('contacts').select('*').order('name')

    if (params.category) query = query.eq('category', params.category)
    if (params.search) query = query.ilike('name', `%${params.search}%`)

    const { data, error } = await query
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: `${(data || []).length} contacts:\n${JSON.stringify(data, null, 2)}` }] }
  }
)

// ── Household Members ───────────────────────────────────

server.tool(
  'symphony_list_household_members',
  'List household/family members. Use their IDs for the assigned_to field when creating tasks.',
  {},
  async () => {
    const { data, error } = await supabase
      .from('family_members')
      .select('id, name, initials, color, member_type, role_label')
      .order('display_order')

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
)

// ── Dashboard / Summary ─────────────────────────────────

server.tool(
  'symphony_daily_summary',
  'Get a summary of today\'s tasks, inbox count, and waiting items. Great for morning briefings.',
  {},
  async () => {
    const today = new Date().toISOString().split('T')[0]
    const todayStart = `${today}T00:00:00`
    const todayEnd = `${today}T23:59:59`

    const [todayTasks, inboxTasks, waitingTasks, overdueTasks] = await Promise.all([
      supabase.from('tasks').select('id, title, completed, scheduled_for, context, category, is_all_day, project_id, is_waiting')
        .eq('bucket', 'timed').gte('scheduled_for', todayStart).lte('scheduled_for', todayEnd)
        .order('scheduled_for'),
      supabase.from('tasks').select('id, title, context, created_at')
        .eq('bucket', 'inbox').eq('completed', false)
        .order('created_at', { ascending: false }),
      supabase.from('tasks').select('id, title, context, waiting_since')
        .eq('is_waiting', true).eq('completed', false),
      supabase.from('tasks').select('id, title, scheduled_for, context')
        .eq('bucket', 'timed').eq('completed', false).lt('scheduled_for', todayStart)
        .order('scheduled_for'),
    ])

    const summary = {
      date: today,
      today: {
        total: todayTasks.data?.length ?? 0,
        completed: todayTasks.data?.filter(t => t.completed).length ?? 0,
        remaining: todayTasks.data?.filter(t => !t.completed).length ?? 0,
        tasks: todayTasks.data ?? [],
      },
      inbox: {
        count: inboxTasks.data?.length ?? 0,
        tasks: inboxTasks.data ?? [],
      },
      waiting: {
        count: waitingTasks.data?.length ?? 0,
        tasks: waitingTasks.data ?? [],
      },
      overdue: {
        count: overdueTasks.data?.length ?? 0,
        tasks: overdueTasks.data ?? [],
      },
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] }
  }
)

// ── Meals: recipes, week plans, lists, notes ──

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] })
const fail = (error: { message: string }) => ({ content: [{ type: 'text' as const, text: `Error: ${error.message}` }] })

/** Get or create the household's meal plan for a week (week_start = Sunday).
 *  Looks across the household (RLS scopes visibility), not just the signed-in
 *  user — both partners' sessions must land on the SAME plan row, matching the
 *  first-by-created_at convention the edge functions use. */
async function ensureWeekPlan(weekStart: string): Promise<string> {
  const { data: existing } = await supabase
    .from('meal_plans')
    .select('id')
    .eq('week_start', weekStart)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id as string
  const { data, error } = await supabase
    .from('meal_plans')
    .insert({ user_id: userId, week_start: weekStart })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

server.tool(
  'symphony_list_recipes',
  'List recipes on the household recipe shelf. Filter by search text or tag.',
  {
    search: z.string().optional().describe('Case-insensitive title search'),
    tag: z.string().optional().describe('Filter by tag, e.g. "pasta"'),
    limit: z.number().default(50),
  },
  async (params) => {
    let query = supabase
      .from('recipes')
      .select('id, title, prep_minutes, tags, is_prep_friendly, times_cooked, last_cooked_at')
      .order('title')
      .limit(params.limit)
    if (params.search) query = query.ilike('title', `%${params.search}%`)
    if (params.tag) query = query.contains('tags', [params.tag])
    const { data, error } = await query
    if (error) return fail(error)
    return ok(data)
  }
)

server.tool(
  'symphony_get_recipe',
  'Get one recipe with full ingredients and instructions.',
  { id: z.string().describe('Recipe UUID') },
  async (params) => {
    const { data, error } = await supabase.from('recipes').select('*').eq('id', params.id).single()
    if (error) return fail(error)
    return ok(data)
  }
)

server.tool(
  'symphony_create_recipe',
  'Add a recipe to the household shelf. Ingredients and instructions are arrays of plain strings (one ingredient / one step per string) — the wall recipe viewer renders them line by line.',
  {
    title: z.string(),
    prep_minutes: z.number().optional().describe('Total minutes, prep + cook'),
    ingredients: z.array(z.string()).describe('One ingredient per string, e.g. "3 oz bucatini"'),
    instructions: z.array(z.string()).describe('One step per string'),
    tags: z.array(z.string()).default([]),
    source_label: z.string().optional(),
    is_prep_friendly: z.boolean().default(false).describe('Batch-cooks well / leftovers-friendly'),
  },
  async (params) => {
    const { data, error } = await supabase
      .from('recipes')
      .insert({ ...params, user_id: userId })
      .select('id, title')
      .single()
    if (error) return fail(error)
    return ok(data)
  }
)

server.tool(
  'symphony_get_week_plan',
  'Get the meal plan for a week, creating an empty one if missing. week_start must be the Sunday of the week, YYYY-MM-DD. day_of_week in entries: 0=Sunday .. 6=Saturday.',
  { week_start: z.string().describe('Sunday of the week, YYYY-MM-DD') },
  async (params) => {
    try {
      const planId = await ensureWeekPlan(params.week_start)
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .select('id, day_of_week, slot, recipe_id, ad_hoc_title, notes, leftover_from, for_member_id, recipes(title)')
        .eq('meal_plan_id', planId)
        .order('day_of_week')
        .order('slot')
      if (error) return fail(error)
      return ok({ meal_plan_id: planId, week_start: params.week_start, entries: data })
    } catch (err) {
      return fail(err as { message: string })
    }
  }
)

server.tool(
  'symphony_add_meal_entry',
  'Add an entry to a week plan. Provide recipe_id OR ad_hoc_title. day_of_week: 0=Sunday .. 6=Saturday. Use leftover_from to mark a reheat of an earlier entry, and for_member_id for a meal that belongs to one person (e.g. their lunch).',
  {
    week_start: z.string().describe('Sunday of the week, YYYY-MM-DD'),
    day_of_week: z.number().min(0).max(6),
    slot: z.enum(['breakfast', 'lunch', 'dinner']),
    recipe_id: z.string().optional().describe('Recipe UUID'),
    ad_hoc_title: z.string().optional().describe('Free-text meal when there is no recipe'),
    notes: z.string().optional(),
    leftover_from: z.string().optional().describe('Entry UUID this reheats leftovers from'),
    for_member_id: z.string().optional().describe('Household member UUID this meal is for (from symphony_list_household_members); omit for the whole family'),
  },
  async (params) => {
    try {
      const { week_start, ...entry } = params
      const planId = await ensureWeekPlan(week_start)
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .insert({ ...entry, meal_plan_id: planId })
        .select('id, day_of_week, slot, recipe_id, ad_hoc_title, for_member_id')
        .single()
      if (error) return fail(error)
      return ok(data)
    } catch (err) {
      return fail(err as { message: string })
    }
  }
)

server.tool(
  'symphony_remove_meal_entry',
  'Remove a meal plan entry by id.',
  { id: z.string().describe('Entry UUID') },
  async (params) => {
    const { error } = await supabase.from('meal_plan_entries').delete().eq('id', params.id)
    if (error) return fail(error)
    return ok({ deleted: params.id })
  }
)

server.tool(
  'symphony_list_lists',
  'List lists (grocery, food, etc.) with their items.',
  { category: z.string().optional().describe('e.g. food_drink, shopping, home') },
  async (params) => {
    let query = supabase
      .from('lists')
      .select('id, title, category, visibility, list_items(id, text, note, completed)')
    if (params.category) query = query.eq('category', params.category)
    const { data, error } = await query
    if (error) return fail(error)
    return ok(data)
  }
)

server.tool(
  'symphony_add_list_item',
  'Add an item to a list (e.g. a grocery list).',
  {
    list_id: z.string().describe('List UUID'),
    text: z.string().describe('Item text, e.g. "2 lb chicken thighs"'),
    note: z.string().optional(),
  },
  async (params) => {
    const { data, error } = await supabase
      .from('list_items')
      .insert({ ...params, user_id: userId })
      .select('id, text')
      .single()
    if (error) return fail(error)
    return ok(data)
  }
)

server.tool(
  'symphony_get_note_by_title',
  'Fetch the newest note with an exact title. The household meal preferences live in the note titled "Household Meal Preferences".',
  { title: z.string().describe('Exact note title') },
  async (params) => {
    const { data, error } = await supabase
      .from('notes')
      .select('id, title, content, updated_at')
      .eq('title', params.title)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return fail(error)
    return ok(data ?? { found: false, title: params.title })
  }
)

server.tool(
  'symphony_upsert_note',
  'Create or update (matched by exact title) a household-shared note.',
  {
    title: z.string(),
    content: z.string(),
  },
  async (params) => {
    const { data: existing } = await supabase
      .from('notes')
      .select('id')
      .eq('title', params.title)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      const { data, error } = await supabase
        .from('notes')
        .update({ content: params.content, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id, title')
        .single()
      if (error) return fail(error)
      return ok({ ...data, action: 'updated' })
    }
    const { data, error } = await supabase
      .from('notes')
      .insert({ title: params.title, content: params.content, type: 'general', user_id: userId })
      .select('id, title')
      .single()
    if (error) return fail(error)
    return ok({ ...data, action: 'created' })
  }
)

// --- Start ---

async function main() {
  await initSupabase()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('Failed to start Symphony MCP server:', err)
  process.exit(1)
})

// --- Choices helpers (local copies; this server imports nothing from src/) ---
// Mirrors: supabase/functions/symphony-agent/choices.ts (readChoices),
// choicePrice.ts (priceFor, workLabel, formatCents), src/lib/choices/db.ts (parseCell).

interface WorkPiece { id: string; label: string; description?: string }
interface PriceLine { id: string; workIds: string[]; amountCents: number; note?: string; sortOrder?: number }
type CellValue = string | number | boolean | null
type ColumnKind = 'text' | 'money' | 'date' | 'yesno'
type OptionStatus = 'considering' | 'contacted' | 'heard_back' | 'ruled_out' | 'chosen'

function formatCents(cents: number): string {
  const whole = cents % 100 === 0
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
  })
}

function workLabel(ids: readonly string[], work: readonly WorkPiece[]): string {
  const numberWords = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
  const picked = work.filter((w) => ids.includes(w.id))
  if (picked.length === 0) return ''
  if (picked.length >= 3 && picked.length === work.length) return `All ${numberWords[picked.length] ?? picked.length}`
  return picked.map((w) => w.label).join(' + ')
}

function liveLines(lines: readonly PriceLine[], work: readonly WorkPiece[]): PriceLine[] {
  const ids = new Set(work.map((w) => w.id))
  return lines.filter((l) => l.workIds.length > 0 && l.workIds.every((id) => ids.has(id)))
}

function orderLines(lines: readonly PriceLine[], work: readonly WorkPiece[]): PriceLine[] {
  const idx = (line: PriceLine) => Math.min(...line.workIds.map((id) => work.findIndex((w) => w.id === id)))
  return [...lines].sort((a, b) => idx(a) - idx(b) || a.workIds.length - b.workIds.length)
}

function priceFor(
  lines: readonly PriceLine[], selected: readonly string[], work: readonly WorkPiece[],
): { totalCents: number; lines: PriceLine[] } | null {
  if (work.length === 0) {
    if (lines.length === 0) return null
    return { totalCents: lines.reduce((s, l) => s + l.amountCents, 0), lines: [...lines] }
  }
  const target = new Set(work.filter((w) => selected.includes(w.id)).map((w) => w.id))
  if (target.size === 0) return null
  const usable = liveLines(lines, work).filter((l) => l.workIds.every((id) => target.has(id)))
  let best: { totalCents: number; lines: PriceLine[] } | null = null
  const search = (start: number, covered: Set<string>, chosen: PriceLine[], total: number) => {
    if (covered.size === target.size) {
      if (!best || total < best.totalCents || (total === best.totalCents && chosen.length < best.lines.length)) {
        best = { totalCents: total, lines: [...chosen] }
      }
      return
    }
    for (let i = start; i < usable.length; i++) {
      const l = usable[i]
      if (l.workIds.some((id) => covered.has(id))) continue
      const next = new Set(covered)
      l.workIds.forEach((id) => next.add(id))
      search(i + 1, next, [...chosen, l], total + l.amountCents)
    }
  }
  search(0, new Set(), [], 0)
  if (!best) return null
  const r: { totalCents: number; lines: PriceLine[] } = best
  return { totalCents: r.totalCents, lines: orderLines(r.lines, work) }
}

/** undefined = not valid for that kind; null = cleared. */
function parseCellLocal(kind: ColumnKind, raw: string): CellValue | undefined {
  const s = raw.trim()
  if (s === '') return null
  switch (kind) {
    case 'text':
      return s
    case 'money': {
      const n = s.replace(/^\$/, '').replace(/,/g, '')
      if (!/^\d+(\.\d{1,2})?$/.test(n)) return undefined
      return Math.round(parseFloat(n) * 100)
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
      if (!m) return undefined
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
      return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? s : undefined
    }
    case 'yesno': {
      const v = s.toLowerCase()
      if (v === 'yes' || v === 'y' || v === 'true') return true
      if (v === 'no' || v === 'n' || v === 'false') return false
      return undefined
    }
  }
}

/** The goal's life-area context ('work' | 'family' | 'personal' | null), via the choice's goal reference. */
async function goalContext(choice: { goal_task_id: string | null; goal_id: string | null }): Promise<string | null> {
  if (choice.goal_task_id) {
    const { data } = await supabase.from('tasks').select('context').eq('id', choice.goal_task_id).maybeSingle()
    return (data?.context as string | null) ?? null
  }
  if (choice.goal_id) {
    const { data } = await supabase.from('goals').select('context').eq('id', choice.goal_id).maybeSingle()
    return (data?.context as string | null) ?? null
  }
  return null
}

function choiceRows<T>(r: { data: T[] | null; error: { message?: string } | null }, what: string): T[] {
  if (r.error) throw new Error(`Could not read ${what}: ${r.error.message ?? 'unknown error'}`)
  return r.data ?? []
}

async function readChoicesLocal(goalId?: string): Promise<string> {
  const statusLabel: Record<OptionStatus, string> = { considering: 'Considering', contacted: 'Contacted', heard_back: 'Heard back', ruled_out: 'Ruled out', chosen: 'Chosen' }
  const cols = 'id, title, status, goal_task_id, goal_id, chosen_option_id, decided_at, decided_note, decided_work, decided_amount_cents, columns, work, selected_work'
  type ChoiceRow = {
    id: string; title: string; status: 'open' | 'decided'; goal_task_id: string | null; goal_id: string | null
    chosen_option_id: string | null; decided_at: string | null; decided_note: string | null; decided_work: string[] | null
    decided_amount_cents: number | string | null; columns: { id: string; label: string; kind: ColumnKind }[] | null
    work: WorkPiece[] | null; selected_work: string[] | null
  }
  type OptionRow = { id: string; choice_id: string; name: string; contact_id: string | null; status: OptionStatus; status_changed_at: string; values: Record<string, CellValue> | null; notes: string | null }

  let found: ChoiceRow[]
  if (goalId) {
    const [a, b] = await Promise.all([
      supabase.from('choices').select(cols).eq('goal_task_id', goalId).order('sort_order').order('created_at').limit(50),
      supabase.from('choices').select(cols).eq('goal_id', goalId).order('sort_order').order('created_at').limit(50),
    ])
    found = [...choiceRows<ChoiceRow>(a as never, 'the choices'), ...choiceRows<ChoiceRow>(b as never, 'the choices')]
  } else {
    found = choiceRows<ChoiceRow>(
      (await supabase.from('choices').select(cols).eq('status', 'open').order('created_at').limit(50)) as never, 'the choices')
  }
  if (!found.length) return JSON.stringify({ choices: [], note: 'No choices here.' })

  const options = choiceRows<OptionRow>((await supabase.from('choice_options')
    .select('id, choice_id, name, contact_id, status, status_changed_at, values, notes')
    .in('choice_id', found.map((c) => c.id)).order('sort_order').order('created_at')) as never, 'the options')
  const optionIds = options.map((o) => o.id)
  const contactIds = [...new Set(options.map((o) => o.contact_id).filter((c): c is string => !!c))]
  const taskIds = [...new Set(found.flatMap((c) => (c.goal_task_id ? [c.goal_task_id] : [])))]
  const goalIds = [...new Set(found.flatMap((c) => (c.goal_id ? [c.goal_id] : [])))]
  const empty = { data: [], error: null }
  const [linesRead, followRead, contactsRead, tasksRead, goalsRead] = await Promise.all([
    optionIds.length ? supabase.from('choice_price_lines').select('id, option_id, work_ids, amount_cents, note, sort_order').in('option_id', optionIds).order('sort_order') : empty,
    optionIds.length ? supabase.from('tasks').select('id, choice_option_id, scheduled_for, completed, waiting_since').in('choice_option_id', optionIds).order('created_at', { ascending: false }) : empty,
    contactIds.length ? supabase.from('contacts').select('id, name, phone').in('id', contactIds) : empty,
    taskIds.length ? supabase.from('tasks').select('id, title').in('id', taskIds) : empty,
    goalIds.length ? supabase.from('goals').select('id, name').in('id', goalIds) : empty,
  ])
  const lines = choiceRows<{ id: string; option_id: string; work_ids: string[] | null; amount_cents: number | string; note: string | null; sort_order: number }>(linesRead as never, 'the prices')
    .map((l): PriceLine & { optionId: string } => ({
      id: l.id, optionId: l.option_id, workIds: l.work_ids ?? [], amountCents: Number(l.amount_cents), ...(l.note ? { note: l.note } : {}), sortOrder: l.sort_order,
    }))
  const followUps = choiceRows<{ id: string; choice_option_id: string; scheduled_for: string | null; completed: boolean; waiting_since: string | null }>(followRead as never, 'the follow-ups')
  const contacts = new Map(choiceRows<{ id: string; name: string; phone: string | null }>(contactsRead as never, 'the contacts').map((c) => [c.id, c]))
  const goalTitle = new Map<string, string>([
    ...choiceRows<{ id: string; title: string }>(tasksRead as never, 'goals').map((r) => [r.id, r.title] as [string, string]),
    ...choiceRows<{ id: string; name: string }>(goalsRead as never, 'year goals').map((r) => [r.id, r.name] as [string, string]),
  ])
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA') : null)
  const priced = (ls: readonly PriceLine[], work: readonly WorkPiece[]) => ls.map((l) => {
    const label = workLabel(l.workIds, work)
    return { ...(label ? { work: label } : {}), amount: formatCents(l.amountCents), ...(l.note ? { note: l.note } : {}) }
  })
  const cellText = (kind: ColumnKind, v: CellValue): string | null => {
    if (v == null || v === '') return null
    if (kind === 'money' && typeof v === 'number') return formatCents(v)
    if (kind === 'yesno' && typeof v === 'boolean') return v ? 'Yes' : 'No'
    return String(v)
  }

  const choices = found.map((c) => {
    const columns = c.columns ?? []
    const work = c.work ?? []
    const selected = c.selected_work ?? []
    const goalRef = (c.goal_task_id ?? c.goal_id)!
    const opts = options.filter((o) => o.choice_id === c.id).map((o) => {
      const own = lines.filter((l) => l.optionId === o.id)
      const shown = work.length === 0 ? own : orderLines(liveLines(own, work), work)
      const forSelected = priceFor(own, selected, work)
      const forAll = priceFor(own, work.map((w) => w.id), work)
      const follow = followUps.find((f) => f.choice_option_id === o.id && !f.completed)
      const contact = o.contact_id ? contacts.get(o.contact_id) : undefined
      const values: Record<string, string> = {}
      for (const col of columns) {
        const v = cellText(col.kind, (o.values ?? {})[col.id] ?? null)
        if (v !== null) values[col.label] = v
      }
      return {
        id: o.id,
        name: o.name,
        status: o.status,
        status_label: statusLabel[o.status] ?? o.status,
        status_since: day(o.status_changed_at),
        ...(contact ? { contact: { name: contact.name, ...(contact.phone ? { phone: contact.phone } : {}) } } : {}),
        values,
        priced: priced(shown, work),
        price_for_selected: forSelected ? formatCents(forSelected.totalCents) : null,
        ...(forSelected ? { selected_adds_up: priced(forSelected.lines, work) } : {}),
        price_for_all_work: forAll ? formatCents(forAll.totalCents) : null,
        ...(forAll ? { all_work_adds_up: priced(forAll.lines, work) } : {}),
        // Waiting is a Contacted option's fact (the app's "N waiting").
        waiting_since: o.status === 'contacted' ? day(follow?.waiting_since ?? o.status_changed_at) : null,
        follow_up: day(follow?.scheduled_for ?? null),
        ...(o.notes ? { notes: o.notes } : {}),
      }
    })
    const chosen = c.chosen_option_id ? options.find((o) => o.id === c.chosen_option_id) : undefined
    return {
      id: c.id,
      title: c.title,
      goal: { title: goalTitle.get(goalRef) ?? '', id: goalRef },
      status: c.status,
      work: work.map((w) => ({ label: w.label, ...(w.description ? { description: w.description } : {}) })),
      selected_work: work.filter((w) => selected.includes(w.id)).map((w) => w.label),
      columns: columns.map((col) => ({ label: col.label, kind: col.kind })),
      options: opts,
      ...(c.status === 'decided' ? {
        decided: {
          option: chosen?.name ?? null,
          on: day(c.decided_at),
          work: workLabel(c.decided_work ?? [], work) || null,
          amount: c.decided_amount_cents == null ? null : formatCents(Number(c.decided_amount_cents)),
          ...(c.decided_note ? { note: c.decided_note } : {}),
        },
      } : {}),
    }
  })
  return JSON.stringify({ choices })
}
