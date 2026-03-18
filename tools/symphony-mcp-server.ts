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
    result[map[k] ?? k] = v
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
      .update({ completed: params.completed, updated_at: new Date().toISOString() })
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
      .from('household_members')
      .select('id, name, role, avatar_url')
      .order('name')

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
