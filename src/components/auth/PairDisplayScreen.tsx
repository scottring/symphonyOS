// src/components/auth/PairDisplayScreen.tsx
//
// The wall's front door when nobody is signed in: type the six-character
// code an owner made in Settings → Displays. The display gets its own
// restricted sign-in (src/lib/display/pairing.ts); no adult account is left
// open on the kitchen wall.

import { useState } from 'react'
import { claimPairingCode } from '@/lib/display/pairing'

export function PairDisplayScreen({ onSignInInstead }: { onSignInInstead: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const r = await claimPairingCode(code)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    // The session is now a display: reload so the auth gate opens on the wall.
    window.location.replace('/wall-v2')
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="/symphony-logo.png" alt="Symphony Logo" className="w-12 h-12" />
            <h1 className="font-display text-3xl text-neutral-900">Symphony</h1>
          </div>
          <p className="text-neutral-600">Pair this display with your household</p>
        </div>
        <div className="card p-8">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="pairing-code" className="block text-sm font-medium text-neutral-600">Pairing code</label>
              <input
                id="pairing-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="input-base text-center text-2xl tracking-[0.4em] font-mono"
                placeholder="ABC123"
                maxLength={6}
                autoComplete="off"
                autoFocus
                inputMode="text"
              />
              <p className="text-xs text-neutral-500">On a phone or computer: Settings → Displays → Pair a display. The code lasts ten minutes.</p>
            </div>
            {error && <div role="alert" className="p-3 rounded-lg text-sm bg-danger-50 text-danger-700">{error}</div>}
            <button type="submit" disabled={busy || code.trim().length !== 6} className="w-full btn-primary py-3 text-base font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? 'Pairing…' : 'Pair this display'}
            </button>
          </form>
          <button type="button" onClick={onSignInInstead} className="mt-5 w-full text-sm text-neutral-500 hover:text-neutral-700">
            Not a display? Sign in instead
          </button>
        </div>
      </div>
    </div>
  )
}
