import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { BundleAction, BundleFact, BundleLineage, BundleNote, BundlePerson, ContextBundle, EntityRef } from './types.ts'
import { HISTORY_N, KNOWLEDGE_K, SIMILARITY_FLOOR, SNIPPET_LEN } from './types.ts'
import { facetsToFacts, boundKnowledge, buildTime } from './build.ts'

export interface AssembleDeps {
  client: SupabaseClient        // service-role client
  openAiKey?: string            // enables semantic knowledge; absent → linked notes only
  now?: Date                    // injectable for tests; defaults to new Date()
}

type DegradedPart = 'people' | 'lineage' | 'facts' | 'knowledge' | 'history'

interface EntityRow {
  id: string
  title: string
  notes: string | null
  links: unknown
  phone_number: string | null
  contact_id: string | null
  assigned_to: string | null
  project_id: string | null
  goal_id: string | null
  scheduled_for: string | null
  bucket: string | null
  is_waiting: boolean | null
  waiting_since: string | null
  defer_count: number | null
  location: string | null
  created_at: string
  completed: boolean
}

const TASK_ENTITY_COLUMNS =
  'id, title, notes, links, phone_number, contact_id, assigned_to, project_id, goal_id, scheduled_for, bucket, is_waiting, waiting_since, defer_count, location, created_at, completed'

// calendar_events and projects don't carry the task-only columns (contact_id, project_id,
// bucket, waiting state, etc.) — select only what exists and normalize into EntityRow with
// the rest as null, so buildTime/entity-mapping can stay entity-type-agnostic.
const CALENDAR_EVENT_COLUMNS = 'id, title, description, location, start_time, created_at'
const PROJECT_COLUMNS = 'id, name, status, notes, created_at'

/** Wraps a part-loading promise: on failure (thrown error or `{ error }` result), pushes `name`
 *  onto `degraded` and resolves to `fallback` instead of rejecting the whole assembly. */
async function part<T>(
  name: DegradedPart,
  degraded: string[],
  loader: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await loader()
  } catch {
    if (!degraded.includes(name)) degraded.push(name)
    return fallback
  }
}

function throwIfErrored<T extends { error?: { message: string } | null }>(result: T): T {
  if (result.error) throw new Error(result.error.message)
  return result
}

function nullRow(): Omit<EntityRow, 'id' | 'title' | 'created_at'> {
  return {
    notes: null, links: null, phone_number: null, contact_id: null, assigned_to: null,
    project_id: null, goal_id: null, scheduled_for: null, bucket: null, is_waiting: null,
    waiting_since: null, defer_count: null, location: null, completed: false,
  }
}

async function loadEntity(client: SupabaseClient, ref: EntityRef): Promise<EntityRow> {
  if (ref.entityType === 'task') {
    const { data, error } = await client
      .from('tasks')
      .select(TASK_ENTITY_COLUMNS)
      .eq('id', ref.entityId)
      .eq('user_id', ref.userId)
      .maybeSingle()
    if (error || !data) throw new Error(`context-graph: ${ref.entityType} ${ref.entityId} not found`)
    return data as EntityRow
  }

  if (ref.entityType === 'calendar_event') {
    const { data, error } = await client
      .from('calendar_events')
      .select(CALENDAR_EVENT_COLUMNS)
      .eq('id', ref.entityId)
      .eq('user_id', ref.userId)
      .maybeSingle()
    if (error || !data) throw new Error(`context-graph: ${ref.entityType} ${ref.entityId} not found`)
    const event = data as { id: string; title: string; description: string | null; location: string | null; start_time: string; created_at: string }
    return { id: event.id, title: event.title, created_at: event.created_at, ...nullRow(), notes: event.description, location: event.location, scheduled_for: event.start_time }
  }

  // project
  const { data, error } = await client
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', ref.entityId)
    .eq('user_id', ref.userId)
    .maybeSingle()
  if (error || !data) throw new Error(`context-graph: ${ref.entityType} ${ref.entityId} not found`)
  const project = data as { id: string; name: string; status: string; notes: string | null; created_at: string }
  return { id: project.id, title: project.name, created_at: project.created_at, ...nullRow(), notes: project.notes, completed: project.status === 'completed' }
}

async function loadPeople(client: SupabaseClient, row: EntityRow, ref: EntityRef): Promise<BundlePerson[]> {
  const ids = [...new Set([row.contact_id, row.assigned_to].filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return []
  const { data } = throwIfErrored(
    await client
      .from('contacts')
      .select('id, name, phone, email, relationship, category')
      .in('id', ids)
      .eq('user_id', ref.userId)
  )
  const contacts = (data ?? []) as { id: string; name: string; phone: string | null; email: string | null; relationship: string | null }[]
  const out: BundlePerson[] = []
  for (const c of contacts) {
    if (c.id === row.contact_id) {
      out.push({ id: c.id, name: c.name, role: 'about', phone: c.phone ?? undefined, email: c.email ?? undefined, relationship: c.relationship ?? undefined })
    }
    if (c.id === row.assigned_to) {
      out.push({ id: c.id, name: c.name, role: 'owner', phone: c.phone ?? undefined, email: c.email ?? undefined, relationship: c.relationship ?? undefined })
    }
  }
  return out
}

async function loadLineage(client: SupabaseClient, row: EntityRow, ref: EntityRef): Promise<BundleLineage> {
  const lineage: BundleLineage = {}
  if (row.project_id) {
    const { data } = throwIfErrored(
      await client.from('projects').select('id, name, status').eq('id', row.project_id).eq('user_id', ref.userId).maybeSingle()
    )
    const project = data as { id: string; name: string; status: string } | null
    if (project) {
      lineage.projectId = project.id
      lineage.projectName = project.name
      lineage.projectStatus = project.status
    }
  }
  if (row.goal_id) {
    const { data } = throwIfErrored(
      await client.from('goals').select('id, title').eq('id', row.goal_id).eq('user_id', ref.userId).maybeSingle()
    )
    const goal = data as { id: string; title: string } | null
    if (goal) {
      lineage.goalId = goal.id
      lineage.goalTitle = goal.title
    }
  }
  return lineage
}

async function loadFacts(client: SupabaseClient, entityType: string, entityId: string, userId: string): Promise<BundleFact[]> {
  const { data } = throwIfErrored(
    await client
      .from('attachments')
      .select('id, facets')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('user_id', userId)
      .not('facets', 'is', null)
  )
  return facetsToFacts((data ?? []) as { id: string; facets: unknown }[])
}

async function loadLinkedNotes(client: SupabaseClient, entityType: string, entityId: string, userId: string): Promise<BundleNote[]> {
  const { data: links } = throwIfErrored(
    await client.from('note_entity_links').select('note_id').eq('entity_type', entityType).eq('entity_id', entityId)
  )
  const noteIds = ((links ?? []) as { note_id: string }[]).map(l => l.note_id)
  if (noteIds.length === 0) return []
  const { data } = throwIfErrored(
    await client.from('notes').select('id, title, content, vault_path').in('id', noteIds).eq('user_id', userId)
  )
  return ((data ?? []) as { id: string; title: string; content: string; vault_path: string | null }[]).map(n => ({
    id: n.id,
    title: n.title,
    snippet: (n.content ?? '').slice(0, SNIPPET_LEN),
    source: 'linked' as const,
    vaultPath: n.vault_path ?? undefined,
  }))
}

/** Same fetch shape as supabase/functions/semantic-search/index.ts:49-66, with a 3s timeout.
 *  Plain fetch + a passed-in key so no Deno globals leak into code paths vitest executes. */
async function embed(openAiKey: string, text: string): Promise<number[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`embedding request failed: ${response.status}`)
    const result = await response.json()
    const embedding = result.data?.[0]?.embedding
    if (!embedding) throw new Error('no embedding returned')
    return embedding as number[]
  } finally {
    clearTimeout(timeout)
  }
}

async function loadSemanticNotes(client: SupabaseClient, openAiKey: string, title: string, userId: string): Promise<BundleNote[]> {
  const embedding = await embed(openAiKey, title)
  const { data, error } = await client.rpc('search_notes_semantic_for_user', {
    p_user_id: userId,
    query_embedding: JSON.stringify(embedding),
    match_threshold: SIMILARITY_FLOOR,
    match_count: KNOWLEDGE_K,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: string; title: string; content: string; vault_path: string | null; similarity: number }[]).map(n => ({
    id: n.id,
    title: n.title,
    snippet: (n.content ?? '').slice(0, SNIPPET_LEN),
    source: 'semantic' as const,
    similarity: n.similarity,
    vaultPath: n.vault_path ?? undefined,
  }))
}

async function loadHistory(client: SupabaseClient, entityType: string, entityId: string, userId: string): Promise<BundleAction[]> {
  const { data } = throwIfErrored(
    await client
      .from('action_history')
      .select('action_type, detail, outcome, created_at')
      .eq('user_id', userId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_N)
  )
  return ((data ?? []) as { action_type: string; detail: string | null; outcome: string | null; created_at: string }[]).map(h => ({
    actionType: h.action_type,
    detail: h.detail ?? undefined,
    outcome: h.outcome ?? undefined,
    createdAt: h.created_at,
  }))
}

export async function assembleContext(deps: AssembleDeps, ref: EntityRef): Promise<ContextBundle> {
  const { client } = deps
  const now = deps.now ?? new Date()
  const degraded: string[] = []

  const row = await loadEntity(client, ref)

  const [people, lineage, facts, linkedNotes, history] = await Promise.all([
    part<BundlePerson[]>('people', degraded, () => loadPeople(client, row, ref), []),
    part<BundleLineage>('lineage', degraded, () => ref.entityType === 'task' ? loadLineage(client, row, ref) : Promise.resolve({}), {}),
    part<BundleFact[]>('facts', degraded, () => loadFacts(client, ref.entityType, ref.entityId, ref.userId), []),
    part<BundleNote[]>('knowledge', degraded, () => loadLinkedNotes(client, ref.entityType, ref.entityId, ref.userId), []),
    part<BundleAction[]>('history', degraded, () => loadHistory(client, ref.entityType, ref.entityId, ref.userId), []),
  ])

  let knowledge = linkedNotes
  if (deps.openAiKey) {
    const semanticNotes = await part<BundleNote[]>('knowledge', degraded, () => loadSemanticNotes(client, deps.openAiKey!, row.title, ref.userId), [])
    knowledge = boundKnowledge([...linkedNotes, ...semanticNotes])
  }

  return {
    ref,
    entity: {
      id: row.id,
      title: row.title,
      notes: row.notes ?? undefined,
      links: Array.isArray(row.links) ? (row.links as { url: string; title?: string }[]) : [],
      phoneNumber: row.phone_number ?? undefined,
      location: row.location ?? undefined,
    },
    people,
    lineage,
    facts,
    knowledge,
    history,
    time: buildTime(row, now),
    degraded,
  }
}
