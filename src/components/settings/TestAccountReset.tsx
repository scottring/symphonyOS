import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Start a test account over, from Settings (Scott, 2026-10-11: testing an
 * empty account shouldn't need a trip to the terminal).
 *
 * Shows only for accounts listed in `test_accounts` — the table lets a user
 * read only their own row — and `reset_test_account()` checks the list again
 * on the server, clearing only the caller's own plans, tasks, routines, lists,
 * notes and meals. Family, household, profile and calendars stay.
 */
export function TestAccountReset() {
  const { user } = useAuth()
  const [isTest, setIsTest] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')

  const userId = user?.id ?? null
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void supabase.from('test_accounts').select('user_id').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsTest(!!data) })
    return () => { cancelled = true }
  }, [userId])

  if (!isTest || !userId) return null

  const reset = async () => {
    setState('busy')
    const { error } = await supabase.rpc('reset_test_account')
    if (error) { setState('failed'); return }
    // Every page holds its own copy of the data; start them all fresh.
    window.location.assign('/today')
  }

  return (
    <section className="mt-12 border-t border-neutral-200 pt-6" aria-labelledby="test-account-heading">
      <h2 id="test-account-heading" className="text-[15px] font-semibold text-neutral-800">Test account</h2>
      <p className="mt-1 text-[14px] text-neutral-500">
        Clears this account's plans, tasks, routines, lists, notes and meals. Family, household and calendars stay.
      </p>
      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[15px] text-neutral-700">Empty {user?.email ?? 'this account'}? This can't be undone.</span>
          <button
            type="button"
            disabled={state === 'busy'}
            onClick={() => { void reset() }}
            className="rounded-lg bg-red-700 px-3 py-1.5 text-[15px] font-medium text-white hover:bg-red-800 disabled:opacity-60"
          >
            {state === 'busy' ? 'Emptying…' : 'Empty it'}
          </button>
          <button
            type="button"
            disabled={state === 'busy'}
            onClick={() => { setConfirming(false); setState('idle') }}
            className="px-2 py-1.5 text-[15px] font-medium text-neutral-500 hover:text-neutral-700"
          >
            Cancel
          </button>
          {state === 'failed' && <span role="alert" className="text-[14px] text-red-700">Didn't reset. Nothing was changed; try again.</span>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 inline-flex items-center gap-2 text-[15px] font-medium text-neutral-600 hover:text-neutral-900"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Start this test account over
        </button>
      )}
    </section>
  )
}
