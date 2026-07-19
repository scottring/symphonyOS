// src/components/wall-v2/WallV2PhoneScreen.tsx
//
// Full-screen kid phone book on the wall. Big photo buttons (favorites first,
// then all allowed contacts). Tap a face → confirm → the in-house handset rings;
// pick it up to bridge to the callee (placeCall with source:'kiosk'). Numbers
// never reach the browser; we dial by contactId.

import { useRef, useState } from 'react'
import { Phone, X, PhoneCall } from 'lucide-react'
import { useKidPhoneContacts } from '@/hooks/useKidPhoneContacts'
import { placeCall } from '@/lib/telephony/placeCall'
import { WALL } from './wallTheme'
import type { KidPhoneContact } from '@/lib/telephony/listContacts'

type Pending = { state: 'confirm' | 'calling' | 'error'; contact: KidPhoneContact; message?: string }

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

function ContactButton({ c, large, onTap }: { c: KidPhoneContact; large?: boolean; onTap: (c: KidPhoneContact) => void }) {
  const size = large ? 'w-40 h-40 text-5xl' : 'w-28 h-28 text-3xl'
  const label = large ? 'text-2xl' : 'text-lg'
  return (
    <button
      type="button"
      onClick={() => onTap(c)}
      aria-label={`Call ${c.name}`}
      className="flex flex-col items-center gap-3 p-3 rounded-3xl hover:bg-white/60 dark:hover:bg-stone-800/60 transition-colors"
    >
      <span className={`grid place-items-center ${size} rounded-full overflow-hidden bg-amber-100 text-amber-900 border-4 border-white shadow-lg`}>
        {c.photoURL
          ? <img src={c.photoURL} alt="" className="w-full h-full object-cover" />
          : <span className="font-bold">{initials(c.name)}</span>}
      </span>
      <span className={`font-bold ${WALL.inkStrong} ${label} leading-tight text-center`}>{c.name}</span>
    </button>
  )
}

export function WallV2PhoneScreen({ onClose }: { onClose: () => void }) {
  const { favorites, others, loading, error } = useKidPhoneContacts(true)
  const [pending, setPending] = useState<Pending | null>(null)
  // Bumped on cancel so a placeCall() that resolves after the user has
  // already backed out can't resurrect the "calling" modal.
  const requestId = useRef(0)

  const confirm = async () => {
    if (!pending) return
    const contact = pending.contact
    const id = ++requestId.current
    setPending({ state: 'calling', contact })
    const r = await placeCall({ contactId: contact.contactId, source: 'kiosk' })
    if (id !== requestId.current) return
    if (r.ok) {
      // Call is armed and waiting for the handset. The CallerIdTakeover paints
      // "Calling …" once it connects; close the book after a beat.
      setTimeout(onClose, 1200)
    } else {
      const message = r.reason === 'quiet_hours'
        ? "It's quiet hours — calls are off right now."
        : "Couldn't start the call — try again."
      setPending({ state: 'error', contact, message })
    }
  }

  const cancelCalling = () => {
    requestId.current++
    setPending(null)
  }

  const empty = !loading && favorites.length === 0 && others.length === 0

  return (
    <div className={`fixed inset-0 z-40 overflow-auto ${WALL.root}`}>
      <div className="sticky top-0 flex items-center justify-between px-8 py-6 bg-inherit">
        <h1 className={`flex items-center gap-3 text-3xl font-extrabold ${WALL.inkStrong}`}>
          <Phone className="w-8 h-8" /> Call someone
        </h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`grid place-items-center w-14 h-14 ${WALL.card}`}
        >
          <X className="w-7 h-7" />
        </button>
      </div>

      <div className="px-8 pb-16">
        {loading && favorites.length === 0 && others.length === 0 && (
          <p className={`mt-10 text-xl ${WALL.muted}`}>Loading the phone book…</p>
        )}
        {empty && <p className={`mt-10 text-xl ${WALL.muted}`}>No one to call yet.</p>}
        {error && (favorites.length > 0 || others.length > 0) && (
          <p className="mb-4 text-sm text-amber-700">Showing the last saved list.</p>
        )}

        {favorites.length > 0 && (
          <div className="flex flex-wrap gap-6 justify-center mb-12">
            {favorites.map((c) => <ContactButton key={c.contactId} c={c} large onTap={(x) => setPending({ state: 'confirm', contact: x })} />)}
          </div>
        )}

        {others.length > 0 && (
          <>
            <h2 className={`text-lg font-bold uppercase tracking-wide mb-4 ${WALL.muted}`}>All contacts</h2>
            <div className="flex flex-wrap gap-4 justify-center">
              {others.map((c) => <ContactButton key={c.contactId} c={c} onTap={(x) => setPending({ state: 'confirm', contact: x })} />)}
            </div>
          </>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-900/60 backdrop-blur-sm p-8">
          <div className={`w-full max-w-md p-8 text-center ${WALL.card}`}>
            <div className="grid place-items-center w-32 h-32 mx-auto rounded-full overflow-hidden bg-amber-100 text-amber-900 text-4xl font-bold border-4 border-white shadow-lg mb-5">
              {pending.contact.photoURL
                ? <img src={pending.contact.photoURL} alt="" className="w-full h-full object-cover" />
                : initials(pending.contact.name)}
            </div>
            {pending.state === 'calling' ? (
              <>
                <p className={`flex items-center justify-center gap-2 text-2xl font-bold ${WALL.inkStrong}`}>
                  <PhoneCall className="w-6 h-6 animate-pulse" /> Calling {pending.contact.name}…
                </p>
                <p className={`mt-1 text-base ${WALL.muted}`}>Pick up the phone when it rings.</p>
                <button
                  type="button"
                  onClick={cancelCalling}
                  className={`mt-6 w-full py-4 text-xl font-bold ${WALL.cardInset} ${WALL.inkStrong}`}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <p className={`text-2xl font-extrabold mb-1 ${WALL.inkStrong}`}>Call {pending.contact.name}?</p>
                {pending.state === 'error'
                  ? <p className="text-base text-red-600 font-semibold mb-6">{pending.message}</p>
                  : <p className={`text-base mb-6 ${WALL.muted}`}>The phone will ring — pick it up to talk.</p>}
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className={`flex-1 py-4 text-xl font-bold ${WALL.cardInset} ${WALL.inkStrong}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    className="flex-1 py-4 rounded-2xl bg-emerald-500 text-white text-xl font-bold shadow-lg"
                  >
                    Call
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
