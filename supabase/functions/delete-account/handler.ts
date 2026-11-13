// DELETE-ACCOUNT — handler. No Deno or URL imports here so vitest can load it;
// the real dependencies are wired in index.ts.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export interface DeleteAccountDeps {
  userFor(authorization: string): Promise<{ id: string; isAnonymous: boolean } | null>
  removeFiles(userId: string): Promise<void>
  deleteData(userId: string): Promise<{ display_user_ids: string[] }>
  deleteAuthUser(userId: string): Promise<void>
}

const CONFIRM_PHRASE = 'delete my account'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

const failed = (step: 'files' | 'data' | 'auth') =>
  json({ error: 'We could not delete your account. Nothing further was changed; please try again.', code: 'delete_failed', step }, 500)

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only', code: 'method_not_allowed' }, 405)

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Sign in to delete your account.', code: 'unauthorized' }, 401)

  let user: { id: string; isAnonymous: boolean } | null
  try {
    user = await deps.userFor(authorization)
  } catch {
    user = null
  }
  if (!user) return json({ error: 'Sign in to delete your account.', code: 'unauthorized' }, 401)
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
