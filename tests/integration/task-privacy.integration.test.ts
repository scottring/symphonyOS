/**
 * Two accounts in one household — what one of them may NOT read.
 *
 * This is the gate the placement spec puts in front of §1 (stamps) and §4
 * (All tasks): `tasks/2026-09-13-placement-is-additive-spec.md`, §3.
 *
 * WHY IT CANNOT BE A UNIT TEST. `PeriodPlanPage.test.tsx` already has a case
 * called "Iris's rows stay out" — but it feeds a MOCKED hook a list that never
 * contained her private rows and then asserts the component's assignee filter.
 * It establishes exactly nothing about what the DATABASE hands Scott. The only
 * thing standing between Iris's private Work and Personal tasks and every
 * surface Scott opens is RLS, because `loadTasks` (useSupabaseTasks.ts:319-322)
 * is a bare `select('*')` with no user filter at all:
 *
 *     // RLS policies handle household sharing - no need to filter by user_id.
 *     supabase.from('tasks').select('*').order('created_at', ...)
 *
 * Month, Week, Today, the pools, All tasks and every count are pure client-side
 * derivations of that one array. So the whole privacy question reduces to: does
 * that query, run as Scott, return Iris's private rows? This asks the real
 * database, as two real people.
 *
 * It matters NOW because §1 rewrites the membership queries — the 33 sites that
 * decide "does this row belong to September / to this week" — and §4 adds a
 * surface that reads every open task there is. Both are exactly the shape of
 * change that turns a private row into a visible one.
 *
 * WHAT IT COSTS. There is no staging project, so this runs against prod. It
 * creates two throwaway auth users (emails matching the `symphony%@gmail.com`
 * allowlist pattern in `signup_allowed`), one throwaway household, and a
 * handful of rows owned by those users. Teardown deletes the users, and
 * `tasks_user_id_fkey ... ON DELETE CASCADE` takes their rows with them. A
 * crashed run leaves orphans behind; `sweepStaleAccounts` clears them on the
 * next one. It never touches Scott's or Iris's real accounts.
 *
 * Run it on purpose: `npm run test:integration`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localYmd } from '@/lib/cadence/config'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

/** Without the service key there is no way to provision or clean up. Skip loudly. */
const canRun = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY)

/** Every account this suite makes starts here, so a crashed run is sweepable. */
const EMAIL_PREFIX = 'symphony-rlstest-'
const PASSWORD = 'rls-test-only-not-a-real-account'

interface Person {
  label: string
  email: string
  userId: string
  /** Signed in with the ANON key — the same client the browser app uses. */
  client: SupabaseClient
}

/** Row ids by the name this test knows them by, so assertions read as prose. */
const rowId: Record<string, string> = {}

let admin: SupabaseClient
let scott: Person
let iris: Person
let householdId: string

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Delete anything a previous crashed run left behind. Scoped to this suite's
 * own email prefix — it cannot reach a real account.
 */
async function sweepStaleAccounts(): Promise<void> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  const stale = data.users.filter((u) => (u.email ?? '').startsWith(EMAIL_PREFIX))
  for (const u of stale) {
    await admin.from('household_members').delete().eq('user_id', u.id)
    await admin.from('households').delete().eq('owner_id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
}

async function createPerson(label: string, runId: string): Promise<Person> {
  const email = `${EMAIL_PREFIX}${label}-${runId}@gmail.com`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) throw new Error(`could not create ${label}: ${error.message}`)
  const userId = data.user!.id

  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signIn.error) throw new Error(`could not sign in ${label}: ${signIn.error.message}`)

  return { label, email, userId, client }
}

/**
 * Insert as the PERSON, not as the admin — so the insert goes through the same
 * WITH CHECK policy the app's writes do, and a row this test creates is a row
 * the app could have created.
 */
async function insertTask(
  person: Person,
  name: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await person.client
    .from('tasks')
    .insert({ user_id: person.userId, title: `[rls-test] ${name}`, ...fields })
    .select('id')
    .single()
  if (error) throw new Error(`${person.label} could not insert ${name}: ${error.message}`)
  rowId[name] = data.id as string
}

/** The app's own read, verbatim (useSupabaseTasks.ts:319-322). */
async function readAllTasks(person: Person) {
  const { data, error } = await person.client
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`${person.label} could not read tasks: ${error.message}`)
  return data as Array<Record<string, unknown>>
}

const thisWeek = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // Sunday, the default week start
  return localYmd(d)
})()

const thisMonth = (() => {
  const d = new Date()
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1))
})()

const describeIf = canRun ? describe : describe.skip

describeIf('task privacy across two accounts in one household', () => {
  beforeAll(async () => {
    admin = adminClient()
    await sweepStaleAccounts()

    const runId = Date.now().toString(36)
    scott = await createPerson('scott', runId)
    iris = await createPerson('iris', runId)

    // Scott founds the household the way first-run setup does.
    const { data: hid, error: setupError } = await scott.client.rpc('setup_household', {
      p_name: `RLS test ${runId}`,
    })
    if (setupError) throw new Error(`setup_household failed: ${setupError.message}`)
    householdId = hid as string

    // Iris joins it. There is no self-serve join RPC yet, so the admin does
    // what an accepted invite would do.
    const { error: joinError } = await admin.from('household_members').insert({
      household_id: householdId,
      user_id: iris.userId,
      role: 'member',
      status: 'active',
      joined_at: new Date().toISOString(),
    })
    if (joinError) throw new Error(`Iris could not join the household: ${joinError.message}`)

    // Iris's PRIVATE work and personal items — stamped at every grain, so a
    // membership query that leaked would have somewhere to print them.
    await insertTask(iris, 'iris-private-work', {
      context: 'work',
      scope: 'individual',
      bucket: 'week',
      month_start: thisMonth,
      week_start: thisWeek,
    })
    await insertTask(iris, 'iris-private-personal', {
      context: 'personal',
      scope: 'individual',
      bucket: 'timed',
      month_start: thisMonth,
      week_start: thisWeek,
      scheduled_for: new Date().toISOString(),
    })
    await insertTask(iris, 'iris-private-goal', {
      context: 'personal',
      scope: 'individual',
      bucket: 'quarter',
      is_goal: true,
      season_start: thisMonth,
    })

    // Iris's SHARED items — the control. If these don't come through, the test
    // is measuring a broken household, not a working policy.
    await insertTask(iris, 'iris-family', {
      context: 'family',
      scope: 'compound',
      bucket: 'month',
      month_start: thisMonth,
    })
    await insertTask(iris, 'iris-handed-to-scott', {
      context: 'work',
      scope: 'couple',
      bucket: 'week',
      week_start: thisWeek,
    })

    await insertTask(scott, 'scott-private-work', {
      context: 'work',
      scope: 'individual',
      bucket: 'inbox',
    })
  })

  afterAll(async () => {
    if (!admin) return
    // ON DELETE CASCADE on tasks_user_id_fkey takes the rows with the user.
    for (const p of [scott, iris]) {
      if (!p) continue
      await admin.from('household_members').delete().eq('user_id', p.userId)
      await admin.auth.admin.deleteUser(p.userId)
    }
    if (householdId) await admin.from('households').delete().eq('id', householdId)
  })

  it('puts the two accounts in the same household', async () => {
    const { data, error } = await admin
      .from('household_members')
      .select('user_id')
      .eq('household_id', householdId)
      .eq('status', 'active')
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.user_id).sort()).toEqual([scott.userId, iris.userId].sort())
  })

  it("keeps Iris's private work and personal tasks out of Scott's read", async () => {
    const rows = await readAllTasks(scott)
    const ids = rows.map((r) => r.id)
    expect(ids).not.toContain(rowId['iris-private-work'])
    expect(ids).not.toContain(rowId['iris-private-personal'])
    expect(ids).not.toContain(rowId['iris-private-goal'])
  })

  it("still hands Scott the shared rows — the policy narrows, it doesn't blind", async () => {
    const rows = await readAllTasks(scott)
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(rowId['iris-family'])
    expect(ids).toContain(rowId['iris-handed-to-scott'])
    expect(ids).toContain(rowId['scott-private-work'])
  })

  it('is the row that is invisible, not the page of results', async () => {
    // Asking for the private row BY ID rules out ordering, paging or a default
    // limit as the reason it was missing above.
    for (const name of ['iris-private-work', 'iris-private-personal', 'iris-private-goal']) {
      const { data, error } = await scott.client.from('tasks').select('id').eq('id', rowId[name])
      expect(error).toBeNull()
      expect(data, `${name} reachable by id`).toEqual([])
    }
  })

  it('excludes them from the stamp queries §1 is about to rewrite', async () => {
    const month = await scott.client.from('tasks').select('id').eq('month_start', thisMonth)
    expect(month.error).toBeNull()
    expect(month.data!.map((r) => r.id)).not.toContain(rowId['iris-private-work'])
    expect(month.data!.map((r) => r.id)).toContain(rowId['iris-family'])

    const week = await scott.client.from('tasks').select('id').eq('week_start', thisWeek)
    expect(week.error).toBeNull()
    expect(week.data!.map((r) => r.id)).not.toContain(rowId['iris-private-work'])
    expect(week.data!.map((r) => r.id)).not.toContain(rowId['iris-private-personal'])
    expect(week.data!.map((r) => r.id)).toContain(rowId['iris-handed-to-scott'])
  })

  it('excludes them from counts, which are computed by the database here', async () => {
    // "Counts are computed after the filter, never before" — the spec's rule,
    // asserted at the one place a count can be computed without a row.
    const { count, error } = await scott.client
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('week_start', thisWeek)
    expect(error).toBeNull()
    // Scott sees exactly the one shared week row; her two private week rows
    // are not in the count.
    expect(count).toBe(1)
  })

  it('will not let Scott write to her private rows either', async () => {
    const update = await scott.client
      .from('tasks')
      .update({ completed: true })
      .eq('id', rowId['iris-private-work'])
      .select('id')
    expect(update.error).toBeNull()
    expect(update.data).toEqual([]) // no row matched the USING clause

    const del = await scott.client
      .from('tasks')
      .delete()
      .eq('id', rowId['iris-private-personal'])
      .select('id')
    expect(del.error).toBeNull()
    expect(del.data).toEqual([])

    // And it is still there, untouched, when its owner looks.
    const { data } = await iris.client
      .from('tasks')
      .select('id, completed')
      .eq('id', rowId['iris-private-work'])
      .single()
    expect(data).toMatchObject({ completed: false })
  })

  it('is symmetric — Scott has private rows too', async () => {
    const rows = await readAllTasks(iris)
    const ids = rows.map((r) => r.id)
    expect(ids).not.toContain(rowId['scott-private-work'])
    expect(ids).toContain(rowId['iris-private-work'])
  })

  /**
   * LAST, and the reason to trust the seven above. A privacy test that has
   * never been observed to fail proves only that the query returned something
   * small. This flips ONE row's scope and nothing else: the same id, the same
   * stamps, the same owner. If it appears, Scott's read really is looking at
   * her rows and the policy is what withholds them — so an absence above is
   * evidence, not an accident of the fixture.
   */
  it('sees the leak when there is one — scope is what withholds the row', async () => {
    const leaky = rowId['iris-private-work']
    await admin.from('tasks').update({ scope: 'compound' }).eq('id', leaky)
    try {
      const rows = await readAllTasks(scott)
      expect(rows.map((r) => r.id)).toContain(leaky)
    } finally {
      await admin.from('tasks').update({ scope: 'individual' }).eq('id', leaky)
    }

    const after = await readAllTasks(scott)
    expect(after.map((r) => r.id)).not.toContain(leaky)
  })
})

// A run without the service key must say so rather than pass silently.
if (!canRun) {
  describe('task privacy across two accounts', () => {
    it.skip('needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY', () => {})
  })
}
