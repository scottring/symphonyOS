/**
 * Account deletion, against the real project, as real accounts.
 *
 * A and B share a household (A owner); C is alone. A has a shared task, a
 * private task and an uploaded file. A deletes the account through the
 * `delete-account` edge function: A can no longer sign in, B keeps the shared
 * task and inherits the household, A's file is gone, and the private task is
 * gone with A. C deleting takes C's household with it.
 *
 * Needs migration 20261113160000_delete_account_data.sql applied and the
 * function deployed; written ahead of that. Run it on purpose:
 * `npm run test:integration`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ANON_KEY,
  PASSWORD,
  SUPABASE_URL,
  adminClient,
  callFunction,
  canRun,
  createPerson,
  householdOf,
  joinHousehold,
  removePerson,
  sweepStaleAccounts,
  type Person,
} from './helpers'

let admin: SupabaseClient
let A: Person
let B: Person
let C: Person
let aHousehold: string
let cHousehold: string
let sharedTaskId: string
let privateTaskId: string
let uploaded = false
const filePath = () => `${A.userId}/integration/delete-account.txt`

const describeIf = canRun ? describe : describe.skip

async function insertTask(person: Person, title: string, fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await person.client
    .from('tasks')
    .insert({ user_id: person.userId, title: `[rls-test] ${title}`, ...fields })
    .select('id')
    .single()
  if (error) throw new Error(`${person.label} could not insert ${title}: ${error.message}`)
  return data.id as string
}

describeIf('account deletion', () => {
  beforeAll(async () => {
    admin = adminClient()
    await sweepStaleAccounts(admin)

    const runId = Date.now().toString(36)
    A = await createPerson(admin, 'delete-a', runId)
    B = await createPerson(admin, 'delete-b', runId)
    C = await createPerson(admin, 'delete-c', runId)

    aHousehold = await householdOf(admin, A)
    await joinHousehold(A, B, aHousehold)
    cHousehold = await householdOf(admin, C)

    sharedTaskId = await insertTask(A, 'shared', { context: 'family', scope: 'compound', bucket: 'inbox' })
    privateTaskId = await insertTask(A, 'private', { context: 'personal', scope: 'individual', bucket: 'inbox' })

    const upload = await A.client.storage
      .from('attachments')
      .upload(filePath(), new Blob(['integration test file'], { type: 'text/plain' }), { contentType: 'text/plain' })
    if (upload.error) throw new Error(`A could not upload: ${upload.error.message}`)
    uploaded = true
  })

  afterAll(async () => {
    if (!admin) return
    // A failed run must not leave A's object behind (removing a missing one is harmless).
    if (uploaded) await admin.storage.from('attachments').remove([filePath()])
    // Deleted users are already gone; removePerson tolerates "not found".
    for (const p of [A, B, C]) await removePerson(admin, p)
    for (const id of [aHousehold, cHousehold]) if (id) await admin.from('households').delete().eq('id', id)
  })

  it('puts A and B in one household, A the owner', async () => {
    const { data, error } = await admin
      .from('household_members')
      .select('user_id, role')
      .eq('household_id', aHousehold)
      .eq('status', 'active')
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.user_id).sort()).toEqual([A.userId, B.userId].sort())
    const { data: h } = await admin.from('households').select('owner_id').eq('id', aHousehold).single()
    expect(h?.owner_id).toBe(A.userId)
  })

  it('refuses without the confirm phrase and changes nothing', async () => {
    const { status, json } = await callFunction(A, 'delete-account', {})
    expect(status).toBe(400)
    expect(json.code).toBe('confirm_required')

    const wrong = await callFunction(A, 'delete-account', { confirm: 'yes' })
    expect(wrong.status).toBe(400)
    expect(wrong.json.code).toBe('confirm_required')

    const { data: user } = await admin.auth.admin.getUserById(A.userId)
    expect(user.user).not.toBeNull()
    const { data: task } = await admin.from('tasks').select('id').eq('id', sharedTaskId)
    expect(task).toHaveLength(1)
    const { data: files } = await admin.storage.from('attachments').list(`${A.userId}/integration`)
    expect(files?.map((f) => f.name)).toContain('delete-account.txt')
  })

  it('refuses a call with no valid token', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-token', apikey: ANON_KEY! },
      body: JSON.stringify({ confirm: 'delete my account' }),
    })
    expect(res.status).toBe(401)
  })

  it('deletes A: 200, no sign-in, B keeps the shared task and the household, the file is gone', async () => {
    try {
      const { status, json } = await callFunction(A, 'delete-account', { confirm: 'delete my account' })
      expect(status).toBe(200)
      expect(json.ok).toBe(true)

      // A can no longer sign in.
      const fresh = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
      const signIn = await fresh.auth.signInWithPassword({ email: A.email, password: PASSWORD })
      expect(signIn.error).not.toBeNull()
      expect(signIn.data.session).toBeNull()

      // B (anon-key client) still sees the shared task, never the private one.
      const { data: tasks, error } = await B.client.from('tasks').select('id').in('id', [sharedTaskId, privateTaskId])
      expect(error).toBeNull()
      expect((tasks ?? []).map((t) => t.id)).toEqual([sharedTaskId])

      // The private task is gone, not merely hidden from B.
      const { data: privateRows, error: privateError } = await admin.from('tasks').select('id').eq('id', privateTaskId)
      expect(privateError).toBeNull()
      expect(privateRows).toEqual([])

      // A's old access token no longer reads A's rows.
      const stale = await A.client.from('tasks').select('id').eq('id', sharedTaskId)
      expect((stale.data ?? []).map((t) => t.id)).not.toContain(sharedTaskId)

      // The household passed to B.
      const { data: h } = await admin.from('households').select('owner_id').eq('id', aHousehold).single()
      expect(h?.owner_id).toBe(B.userId)

      // A's file is gone from storage.
      const { data: files, error: listError } = await admin.storage.from('attachments').list(`${A.userId}/integration`)
      expect(listError).toBeNull()
      expect(files ?? []).toEqual([])
    } finally {
      await admin.storage.from('attachments').remove([filePath()])
    }
  })

  it('deletes C: its household goes with it', async () => {
    const { status, json } = await callFunction(C, 'delete-account', { confirm: 'delete my account' })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)

    const { data } = await admin.from('households').select('id').eq('id', cHousehold)
    expect(data).toEqual([])
  })
})

// A run without the service key must say so rather than pass silently.
if (!canRun) {
  describe('account deletion', () => {
    it.skip('needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY', () => {})
  })
}
