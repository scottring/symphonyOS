// FULL-HOUSEHOLD GATE — for functions that act on something only a full
// household has (the kid-phone bridge, Google Places). No Deno or URL imports
// so vitest can load it; each function passes its own lookup.
//
// `edition` must call the `my_edition` RPC with a client that carries the
// caller's Authorization header (anon key + the caller's JWT), never the
// service role: my_edition answers for auth.uid(). A paired wall display is an
// anonymous user with an active 'display' membership, so it reads 'full' in a
// full household.
//
// Rules: 'full' allows; 'light' refuses; my_edition not existing yet
// (PostgREST PGRST202, or HTTP 404) allows, so the function behaves as it did
// before the edition migration; any other error, a throw, or an unexpected
// value refuses.

export type EditionAnswer = {
  data: unknown
  error: { code?: string } | null
  status?: number
}

export const FULL_HOUSEHOLD_ONLY = { error: 'This comes with Symphony Plus.', code: 'full_household_only' } as const

export async function fullHouseholdGate(deps: { edition(): PromiseLike<EditionAnswer> }): Promise<'allow' | 'refuse'> {
  let answer: EditionAnswer
  try {
    answer = await deps.edition()
  } catch {
    return 'refuse'
  }
  if (answer.error) {
    return answer.error.code === 'PGRST202' || answer.status === 404 ? 'allow' : 'refuse'
  }
  return answer.data === 'full' ? 'allow' : 'refuse'
}
