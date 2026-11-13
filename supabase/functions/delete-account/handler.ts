// DELETE-ACCOUNT — handler. No Deno or URL imports here so vitest can load it;
// the real dependencies are wired in index.ts.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Who the Authorization header belongs to: a user; a sign-in whose user no
 *  longer exists (deleted on an earlier try whose reply was lost); or null
 *  for anything else that is not a user (401). Throws when Auth itself could
 *  not answer (503). */
export type UserLookup = { kind: 'user'; id: string; isAnonymous: boolean } | { kind: 'gone' } | null

export interface DeleteAccountDeps {
  userFor(authorization: string): Promise<UserLookup>
  removeFiles(userId: string): Promise<void>
  deleteData(userId: string): Promise<{ display_user_ids: string[] }>
  deleteAuthUser(userId: string): Promise<void>
}

const CONFIRM_PHRASE = 'delete my account'

/** A Supabase user id. Storage paths start with it, so anything else (an
 *  empty id would walk the bucket root) must never reach the storage walk. */
export const isUserId = (id: unknown): id is string =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

/**
 * Reads auth-js `getUser`'s answer. auth-js does not throw when Auth is down:
 * it returns an AuthRetryableFetchError (status 0 for a network failure,
 * 5xx for a server error). Those throw here, so the handler answers 503 and
 * the phone changes nothing. Only `user_not_found` (GoTrue's answer for a
 * valid token whose user was deleted) means gone; a revoked session, a bad
 * or expired token and anything else is null.
 */
export function readUserLookup(
  user: { id: string; is_anonymous?: boolean } | null | undefined,
  error: { name?: string; status?: number; code?: string } | null | undefined,
): UserLookup {
  if (error) {
    const status = error.status
    if (error.name === 'AuthRetryableFetchError' || status === 0 || (typeof status === 'number' && status >= 500)) {
      throw new Error(`Auth unavailable (${error.name ?? 'error'} ${status ?? ''})`)
    }
    return error.code === 'user_not_found' ? { kind: 'gone' } : null
  }
  if (!user) return null
  return { kind: 'user', id: user.id, isAnonymous: user.is_anonymous === true }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

const failed = (step: 'files' | 'data' | 'auth') =>
  json({ error: 'We could not delete your account. Nothing further was changed; please try again.', code: 'delete_failed', step }, 500)

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only', code: 'method_not_allowed' }, 405)

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Sign in to delete your account.', code: 'unauthorized' }, 401)

  let user: UserLookup
  try {
    user = await deps.userFor(authorization)
  } catch (e) {
    // Auth could not be asked; the sign-in may be fine. Not a 401, which the
    // phone reads as "this account is already gone".
    console.error('delete-account: could not check the sign-in', e)
    return json({ error: 'We could not check your sign-in. Nothing was changed; please try again.', code: 'auth_unavailable' }, 503)
  }
  if (user?.kind === 'gone') return json({ error: 'This account has already been deleted.', code: 'account_gone' }, 410)
  if (!user || !isUserId(user.id)) return json({ error: 'Sign in to delete your account.', code: 'unauthorized' }, 401)
  if (user.isAnonymous) return json({ error: 'This session is a display, not a person.', code: 'not_a_person' }, 403)

  let confirm: unknown
  try {
    confirm = ((await req.json()) as { confirm?: unknown } | null)?.confirm
  } catch {
    confirm = undefined
  }
  if (confirm !== CONFIRM_PHRASE) {
    return json({ error: `Type "${CONFIRM_PHRASE}" to confirm.`, code: 'confirm_required' }, 400)
  }

  try {
    await deps.removeFiles(user.id)
  } catch (e) {
    console.error('delete-account: files step failed', e)
    return failed('files')
  }

  let displayIds: unknown[] = []
  try {
    const result = await deps.deleteData(user.id)
    displayIds = Array.isArray(result?.display_user_ids) ? result.display_user_ids : []
  } catch (e) {
    console.error('delete-account: data step failed', e)
    return failed('data')
  }

  for (const id of displayIds) {
    if (typeof id !== 'string' || id === user.id) continue
    try {
      await deps.deleteAuthUser(id)
    } catch (e) {
      console.error('delete-account: could not delete display user', id, e)
    }
  }

  try {
    await deps.deleteAuthUser(user.id)
  } catch (e) {
    console.error('delete-account: auth step failed', e)
    return failed('auth')
  }

  return json({ ok: true })
}
