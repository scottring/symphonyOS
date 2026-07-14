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

// ── Meals: recipes, week plans, lists, notes, restrictions, pantry ──

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
        .select('id, day_of_week, slot, recipe_id, ad_hoc_title, notes, leftover_from, family_member_id, prepared_by_family_member_id, recipes(title)')
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
  'Add an entry to a week plan. Provide recipe_id OR ad_hoc_title. day_of_week: 0=Sunday .. 6=Saturday. Use leftover_from to mark a reheat of an earlier entry.',
  {
    week_start: z.string().describe('Sunday of the week, YYYY-MM-DD'),
    day_of_week: z.number().min(0).max(6),
    slot: z.enum(['breakfast', 'lunch', 'snack', 'dinner', 'prep']),
    recipe_id: z.string().optional().describe('Recipe UUID'),
    ad_hoc_title: z.string().optional().describe('Free-text meal when there is no recipe'),
    notes: z.string().optional(),
    leftover_from: z.string().optional().describe('Entry UUID this reheats leftovers from'),
  },
  async (params) => {
    try {
      const { week_start, ...entry } = params
      const planId = await ensureWeekPlan(week_start)
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .insert({ ...entry, meal_plan_id: planId })
        .select('id, day_of_week, slot, recipe_id, ad_hoc_title')
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

server.tool(
  'symphony_list_dietary_restrictions',
  'List household dietary restrictions. These are HARD filters for meal planning (allergies, never-serve rules).',
  {},
  async () => {
    const { data, error } = await supabase
      .from('dietary_restrictions')
      .select('id, label, family_member_id')
    if (error) return fail(error)
    return ok(data)
  }
)

server.tool(
  'symphony_list_pantry',
  'List pantry inventory stock levels (high / medium / low / out).',
  { level: z.enum(['high', 'medium', 'low', 'out']).optional() },
  async (params) => {
    let query = supabase.from('pantry_inventory').select('id, pattern, level').order('pattern')
    if (params.level) query = query.eq('level', params.level)
    const { data, error } = await query
    if (error) return fail(error)
    return ok(data)
  }
)

server.tool(
  'symphony_set_pantry_level',
  'Set the stock level for a pantry item pattern (upserts).',
  {
    pattern: z.string().describe('Item pattern, e.g. "olive oil"'),
    level: z.enum(['high', 'medium', 'low', 'out']),
  },
  async (params) => {
    const { data, error } = await supabase
      .from('pantry_inventory')
      .upsert({ user_id: userId, pattern: params.pattern, level: params.level }, { onConflict: 'user_id,pattern' })
      .select('pattern, level')
      .single()
    if (error) return fail(error)
    return ok(data)
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
