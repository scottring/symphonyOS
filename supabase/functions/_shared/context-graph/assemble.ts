import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { BundleAction, BundleFact, BundleLineage, BundleNote, BundlePerson, ContextBundle, EntityRef } from './types.ts'
import { HISTORY_N, KNOWLEDGE_K, SIMILARITY_FLOOR, SNIPPET_LEN } from './types.ts'
import { facetsToFacts, boundKnowledge, buildTime } from './build.ts'
import { applyScopeVisibility, resolveVisibleOwners } from './visibility.ts'

export interface AssembleDeps {
  client: SupabaseClient        // service-role client
  openAiKey?: string            // enables semantic knowledge; absent → linked notes only
  now?: Date                    // injectable for tests; defaults to new Date()
  /** Owner set from `resolveVisibleOwners`. Optional: assembly resolves it itself when absent.
   *  Callers assembling many bundles for one user (proactive-engine) should resolve once and
   *  pass it, so the two household_members reads aren't paid per task. */
  visibleOwnerIds?: string[]
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

async function loadEntity(client: SupabaseClient, ref: EntityRef, owners: string[]): Promise<EntityRow> {
  if (ref.entityType === 'task') {
    const { data, error } = await applyScopeVisibility(
      client.from('tasks').select(TASK_ENTITY_COLUMNS).eq('id', ref.entityId),
      ref.userId,
      owners
    ).maybeSingle()
    if (error || !data) throw new Error(`context-graph: ${ref.entityType} ${ref.entityId} not found`)
    return data as EntityRow
  }

  if (ref.entityType === 'calendar_event') {
    // calendar_events RLS is owner-only (001_calendar_connections.sql:57-58) — the scope axis
    // deliberately skipped it (2026-06-07_scope_axis.sql:91). Stays a plain user_id filter.
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
  const { data, error } = await applyScopeVisibility(
    client.from('projects').select(PROJECT_COLUMNS).eq('id', ref.entityId),
    ref.userId,
    owners
  ).maybeSingle()
  if (error || !data) throw new Error(`context-graph: ${ref.entityType} ${ref.entityId} not found`)
  const project = data as { id: string; name: string; status: string; notes: string | null; created_at: string }
  return { id: project.id, title: project.name, created_at: project.created_at, ...nullRow(), notes: project.notes, completed: project.status === 'completed' }
}

async function loadPeople(client: SupabaseClient, row: EntityRow, ref: EntityRef, owners: string[]): Promise<BundlePerson[]> {
  const ids = [...new Set([row.contact_id, row.assigned_to].filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return []
  const { data } = throwIfErrored(
    await applyScopeVisibility(
      client.from('contacts').select('id, name, phone, email, relationship, category').in('id', ids),
      ref.userId,
      owners
    )
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

async function loadLineage(client: SupabaseClient, row: EntityRow, ref: EntityRef, owners: string[]): Promise<BundleLineage> {
  const [projectResult, goalResult] = await Promise.all([
    row.project_id
      ? applyScopeVisibility(
          client.from('projects').select('id, name, status').eq('id', row.project_id),
          ref.userId,
          owners
        ).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // goals RLS is owner-only (046_goals.sql:59-61) and goals never got a scope column, so a
    // shared task hanging off a peer's goal resolves to no goal rather than leaking its title.
    row.goal_id
      ? client.from('goals').select('id, title').eq('id', row.goal_id).eq('user_id', ref.userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const lineage: BundleLineage = {}
  const project = throwIfErrored(projectResult).data as { id: string; name: string; status: string } | null
  if (project) {
    lineage.projectId = project.id
    lineage.projectName = project.name
    lineage.projectStatus = project.status
  }
  const goal = throwIfErrored(goalResult).data as { id: string; title: string } | null
  if (goal) {
    lineage.goalId = goal.id
    lineage.goalTitle = goal.title
  }
  return lineage
}

// attachments RLS is owner-only (023_attachments.sql:33-35) with no scope column, so facts
// stay owner-scoped: a peer's shared task contributes its fields but not its attachments.
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

// note_entity_links predates the context-graph's entity-type vocabulary and only ever
// stores 'event' for calendar events (022_notes.sql CHECK constraint; written as 'event'
// in useMeetingNotes.ts) — never 'calendar_event'. Map at the lookup only; the public
// ContextEntityType ('calendar_event') stays the vocabulary everywhere else.
function noteLinkEntityType(entityType: string): string {
  return entityType === 'calendar_event' ? 'event' : entityType
}

async function loadLinkedNotes(client: SupabaseClient, entityType: string, entityId: string, userId: string, owners: string[]): Promise<BundleNote[]> {
  const { data: links } = throwIfErrored(
    await client.from('note_entity_links').select('note_id').eq('entity_type', noteLinkEntityType(entityType)).eq('entity_id', entityId)
  )
  const noteIds = ((links ?? []) as { note_id: string }[]).map(l => l.note_id)
  if (noteIds.length === 0) return []
  const { data } = throwIfErrored(
    await applyScopeVisibility(
      client.from('notes').select('id, title, content, vault_path').in('id', noteIds),
      userId,
      owners
    )
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

  // Restates the RLS the service-role client bypasses. Resolved before loadEntity because the
  // entity read itself is scope-gated; pass deps.visibleOwnerIds to skip the two extra reads.
  const owners = deps.visibleOwnerIds ?? await resolveVisibleOwners(client, ref.userId)

  const row = await loadEntity(client, ref, owners)
  const openAiKey = deps.openAiKey

  // Semantic lookup only needs row.title (already loaded above), so it runs alongside
  // the other parts instead of serially after them — the 3s embed timeout was otherwise
  // pure added latency on every assembly.
  const [people, lineage, facts, linkedNotes, history, semanticNotes] = await Promise.all([
    part<BundlePerson[]>('people', degraded, () => loadPeople(client, row, ref, owners), []),
    part<BundleLineage>('lineage', degraded, () => ref.entityType === 'task' ? loadLineage(client, row, ref, owners) : Promise.resolve({}), {}),
    part<BundleFact[]>('facts', degraded, () => loadFacts(client, ref.entityType, ref.entityId, ref.userId), []),
    part<BundleNote[]>('knowledge', degraded, () => loadLinkedNotes(client, ref.entityType, ref.entityId, ref.userId, owners), []),
    // action_history is the CALLER's own record of what they did to this entity, so it stays
    // keyed to ref.userId regardless of who owns the entity.
    part<BundleAction[]>('history', degraded, () => loadHistory(client, ref.entityType, ref.entityId, ref.userId), []),
    // Semantic knowledge goes through search_notes_semantic_for_user, a SECURITY DEFINER fn
    // whose only gate is `n.user_id = p_user_id` (2026-07-29_semantic_search_service.sql:27).
    // Widening it is a migration, not a client change — left owner-only deliberately.
    openAiKey
      ? part<BundleNote[]>('knowledge', degraded, () => loadSemanticNotes(client, openAiKey, row.title, ref.userId), [])
      : Promise.resolve([] as BundleNote[]),
  ])

  const knowledge = boundKnowledge([...linkedNotes, ...semanticNotes])

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
