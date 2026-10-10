// src/components/wall-v2/WallV2PhoneScreen.tsx
//
// kidsPhone (named 2026-10-04): its full-screen phone book on the wall. Big photo buttons (favorites first,
// then all allowed contacts). Tap a face → confirm → the callee is parked for
// the in-house handset (placeCall with source:'kiosk'). If the receiver is
// already up, the warmline connects it within ~2s; if not, pick up the phone
// and it connects. Numbers never reach the browser; we dial by contactId.
//
// Honest about what the wall can do (conversational canvas, 2026-10-10):
//  - The confirm names the actual recipient (photo + name) and which line
//    rings — the kidsPhone handset in the house, never someone's cell.
//  - Contacts the allowlist has disabled are not shown and can't be dialed.
//  - "Cancel" exists only BEFORE dialing. Once placeCall has been sent the
//    wall cannot hang up (place-call has no hang-up), so the button says
//    "Close this screen" and the text says the call carries on at the handset.
//  - Nothing here closes on a timer: an active call screen stays until
//    someone closes it.
//
// `embedded` renders inside the kiosk frame's stage (the frame supplies
// Home/Back and the "Calling" place); standalone keeps its own header + X.

import { useRef, useState } from 'react'
import { Phone, X, PhoneCall } from 'lucide-react'
import { useKidPhoneContacts, callableContacts } from '@/hooks/useKidPhoneContacts'
import { useHandsetState } from '@/hooks/useHandsetState'
import { placeCall } from '@/lib/telephony/placeCall'
import { WALL } from './wallTheme'
import type { KidPhoneContact } from '@/lib/telephony/listContacts'

type Pending = { state: 'confirm' | 'dialing' | 'dialed' | 'error'; contact: KidPhoneContact; message?: string }

/** Which line rings when the wall places a call (source:'kiosk'). */
export const KIOSK_LINE = 'the kidsPhone handset in the house'

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

export function WallV2PhoneScreen({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const { favorites: allFavorites, others: allOthers, loading, error } = useKidPhoneContacts(true)
  // Belt and braces: whatever the hook hands over, a disabled contact is
  // never offered.
  const favorites = callableContacts(allFavorites)
  const others = callableContacts(allOthers)
  const { offHook } = useHandsetState()
  const [pending, setPending] = useState<Pending | null>(null)
  // Bumped when the screen moves on so a placeCall() that resolves late can't
  // repaint a dialog nobody is looking at.
  const requestId = useRef(0)

  const confirm = async () => {
    if (!pending || pending.state === 'dialing' || pending.state === 'dialed') return
    const contact = pending.contact
    if (contact.enabled === false) return
    const id = ++requestId.current
    setPending({ state: 'dialing', contact })
    const r = await placeCall({ contactId: contact.contactId, source: 'kiosk' })
    if (id !== requestId.current) return
    if (r.ok) {
      setPending({ state: 'dialed', contact })
    } else {
      const message = r.reason === 'quiet_hours'
        ? "It's quiet hours — calls are off right now."
        : "Couldn't start the call — try again."
      setPending({ state: 'error', contact, message })
    }
  }

  /** After dialing: closes the wall's screen only. The call is not touched. */
  const closeAfterDial = () => {
    requestId.current++
    setPending(null)
    onClose()
  }

  const empty = !loading && favorites.length === 0 && others.length === 0
  // Inside the kiosk frame the frame's place ("Calling") is the page heading.
  const Heading = embedded ? 'h2' : 'h1'
  const pick = (x: KidPhoneContact) => setPending({ state: 'confirm', contact: x })

  return (
    <div className={`${embedded ? 'absolute inset-0 z-10' : `fixed inset-0 z-40 ${WALL.root}`} overflow-auto`}>
      <div className={`${embedded ? '' : 'sticky top-0 bg-inherit'} flex items-center justify-between px-8 py-6`}>
        <Heading className={`flex items-center gap-3 text-3xl font-extrabold ${WALL.inkStrong}`}>
          <Phone className="w-8 h-8" /> kidsPhone · call someone
        </Heading>
        {offHook && (
          <p className={`text-xl font-bold ${WALL.muted}`}>You&rsquo;re holding the phone — pick someone.</p>
        )}
        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`grid place-items-center w-14 h-14 ${WALL.card}`}
          >
            <X className="w-7 h-7" />
          </button>
        )}
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
            {favorites.map((c) => <ContactButton key={c.contactId} c={c} large onTap={pick} />)}
          </div>
        )}

        {others.length > 0 && (
          <>
            <h2 className={`text-lg font-bold uppercase tracking-wide mb-4 ${WALL.muted}`}>All contacts</h2>
            <div className="flex flex-wrap gap-4 justify-center">
              {others.map((c) => <ContactButton key={c.contactId} c={c} onTap={pick} />)}
            </div>
          </>
        )}
      </div>

      {pending && (
        <div
          role="dialog"
          aria-label={pending.state === 'confirm' || pending.state === 'error' ? `Call ${pending.contact.name}?` : `Calling ${pending.contact.name}`}
          className={`${embedded ? 'absolute' : 'fixed'} inset-0 z-50 grid place-items-center bg-stone-900/60 backdrop-blur-sm p-8`}
        >
          <div className={`w-full max-w-md p-8 text-center ${WALL.card}`}>
            <div className="grid place-items-center w-32 h-32 mx-auto rounded-full overflow-hidden bg-amber-100 text-amber-900 text-4xl font-bold border-4 border-white shadow-lg mb-5">
              {pending.contact.photoURL
                ? <img src={pending.contact.photoURL} alt="" className="w-full h-full object-cover" />
                : initials(pending.contact.name)}
            </div>
            {pending.state === 'dialing' || pending.state === 'dialed' ? (
              <>
                <p className={`flex items-center justify-center gap-2 text-2xl font-bold ${WALL.inkStrong}`}>
                  <PhoneCall className="w-6 h-6 motion-safe:animate-pulse" aria-hidden="true" />
                  {pending.state === 'dialing'
                    ? `Starting the call to ${pending.contact.name}…`
                    : offHook ? `Connecting to ${pending.contact.name}…` : `Calling ${pending.contact.name}…`}
                </p>
                <p className={`mt-2 text-lg ${WALL.inkStrong}`}>
                  {offHook ? 'Hold the phone to your ear.' : 'Now pick up the phone.'}
                </p>
                <p className={`mt-2 text-base ${WALL.muted}`}>
                  The call continues on the handset. Closing this screen won’t hang up — put the phone down to end it.
                </p>
                <button
                  type="button"
                  onClick={closeAfterDial}
                  className={`mt-6 w-full min-h-[80px] text-xl font-bold ${WALL.cardInset} ${WALL.inkStrong}`}
                >
                  Close this screen
                </button>
              </>
            ) : (
              <>
                <p className={`text-2xl font-extrabold mb-1 ${WALL.inkStrong}`}>Call {pending.contact.name}?</p>
                <p className={`text-base mb-1 ${WALL.muted}`}>Rings {KIOSK_LINE}.</p>
                {pending.state === 'error'
                  ? <p role="alert" className="text-base text-red-600 font-semibold mb-6">{pending.message}</p>
                  : <p className={`text-base mb-6 ${WALL.muted}`}>
                      {offHook ? 'Hold the phone to your ear.' : 'Then pick up the phone to talk.'}
                    </p>}
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className={`flex-1 min-h-[80px] text-xl font-bold ${WALL.cardInset} ${WALL.inkStrong}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    className="flex-1 min-h-[80px] rounded-2xl bg-emerald-600 text-white text-xl font-bold shadow-lg"
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
