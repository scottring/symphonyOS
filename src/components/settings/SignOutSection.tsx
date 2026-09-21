import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

/**
 * Sign out, at the foot of Settings, behind one confirm.
 *
 * It used to be an unlabelled door icon in the phone header of Today, with no
 * confirm — one stray tap signed a new user out of the page they live in
 * (walkthrough 2026-09-21, C-P1). Settings is the one place it lives on phones.
 */
export function SignOutSection() {
  const { signOut } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <section className="mt-12 border-t border-neutral-200 pt-6">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px] text-neutral-700">Sign out of Symphony on this device?</span>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await signOut() } finally { setBusy(false) } }}
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-[15px] font-medium text-white hover:bg-neutral-900 disabled:opacity-60"
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="px-2 py-1.5 text-[15px] font-medium text-neutral-500 hover:text-neutral-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 text-[15px] font-medium text-neutral-600 hover:text-neutral-900"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
        </button>
      )}
    </section>
  )
}
