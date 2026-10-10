// src/components/wall-v2/WallV2PhoneScreen.tsx
//
// kidsPhone (named 2026-10-04): the wall's phone book, laid out as the
// approved Kiosk-Call board — the household's contacts as big photo cards on
// the left, the confirm panel on the right. Tap a face → the panel names
// them → "Call <name>" parks the callee for the in-house handset (placeCall
// with source:'kiosk'). If the receiver is already up, the warmline connects
// it within ~2s; if not, pick up the phone and it connects. Numbers never
// reach the browser; we dial by contactId.
//
// Honest about what the wall can do (conversational canvas, 2026-10-10):
//  - The panel names the actual recipient (photo + name) and which line
//    rings — the kidsPhone handset in the house, never someone's cell.
//  - Contacts the allowlist has disabled are not shown and can't be dialed.
//  - "Cancel" exists only BEFORE dialing. Once placeCall has been sent the
//    wall cannot hang up (place-call has no hang-up), so the button says
//    "Close this screen" and the text says the call carries on at the handset.
//  - Nothing here closes on a timer: an active call screen stays until
//    someone closes it.
//
// `embedded` renders inside the kiosk frame's stage (the frame supplies
// Home/Back and the "Calling" place); standalone adds its own header + X.
// `fixture` shows fixed contacts for design previews and never dials.

import { useRef, useState } from 'react'
import { Phone, X, PhoneCall } from 'lucide-react'
import { useKidPhoneContacts, callableContacts, partitionContacts } from '@/hooks/useKidPhoneContacts'
import { useHandsetState } from '@/hooks/useHandsetState'
import { placeCall } from '@/lib/telephony/placeCall'
import type { KidPhoneContact } from '@/lib/telephony/listContacts'

type Pending = { state: 'confirm' | 'dialing' | 'dialed' | 'error'; contact: KidPhoneContact; message?: string }

/** Which line rings when the wall places a call (source:'kiosk'). */
export const KIOSK_LINE = 'the kidsPhone handset in the house'

export interface PhoneFixture {
  contacts: KidPhoneContact[]
  /** Open the confirm panel on this contact. */
  selectedId?: string
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

function Avatar({ c, size }: { c: KidPhoneContact; size: 'card' | 'big' }) {
  return (
    <span className={`kc-call-av is-${size}`} aria-hidden="true">
      {c.photoURL ? <img src={c.photoURL} alt="" /> : initials(c.name)}
    </span>
  )
}

export function WallV2PhoneScreen({ onClose, embedded = false, fixture }: { onClose: () => void; embedded?: boolean; fixture?: PhoneFixture }) {
  const live = useKidPhoneContacts(!fixture)
  const book = fixture ? partitionContacts(fixture.contacts) : live
  // Belt and braces: whatever the hook hands over, a disabled contact is
  // never offered.
  const favorites = callableContacts(book.favorites)
  const others = callableContacts(book.others)
  const all = [...favorites, ...others]
  const loading = !fixture && live.loading
  const error = fixture ? undefined : live.error
  const { offHook } = useHandsetState()
  const [pending, setPending] = useState<Pending | null>(() => {
    const c = fixture?.selectedId ? callableContacts(fixture.contacts).find((x) => x.contactId === fixture.selectedId) : null
    return c ? { state: 'confirm', contact: c } : null
  })
  // Bumped when the screen moves on so a placeCall() that resolves late can't
  // repaint a panel nobody is looking at.
  const requestId = useRef(0)

  const confirm = async () => {
    if (!pending || pending.state === 'dialing' || pending.state === 'dialed') return
    const contact = pending.contact
    if (contact.enabled === false || fixture) return
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

  const dialed = pending?.state === 'dialing' || pending?.state === 'dialed'
  const pick = (x: KidPhoneContact) => { if (!dialed) setPending({ state: 'confirm', contact: x }) }
  // Inside the kiosk frame the frame's place ("Calling") is the page heading.
  const Heading = embedded ? 'h2' : 'h1'

  const body = (
    <div className="kc-call">
      <section className="kc-call-book" aria-label="Household contacts">
        <Heading className={embedded ? 'sr-only' : 'kc-call-title'}>
          <Phone aria-hidden="true" /> kidsPhone · call someone
        </Heading>
        {offHook && <p className="kc-call-hint">You’re holding the phone — pick someone.</p>}
        {loading && all.length === 0 && <p className="kc-muted kc-quiet-line">Loading the phone book…</p>}
        {!loading && all.length === 0 && <p className="kc-muted kc-quiet-line">No one to call yet.</p>}
        {error && all.length > 0 && <p className="kc-muted kc-small">Showing the last saved list.</p>}
        <div className="kc-call-grid">
          {all.map((c) => (
            <button key={c.contactId} type="button" aria-label={c.name} aria-pressed={pending?.contact.contactId === c.contactId}
              className={`kc-call-card ${pending?.contact.contactId === c.contactId ? 'is-selected' : ''}`} onClick={() => pick(c)} disabled={dialed && pending?.contact.contactId !== c.contactId}>
              <Avatar c={c} size="card" />
              <span>{c.name}</span>
              {c.favorite && <small>Favorite</small>}
            </button>
          ))}
        </div>
      </section>

      <section className="kc-call-confirm" aria-label="Confirm call">
        {!pending && (
          <div className="kc-call-empty">
            <PhoneCall aria-hidden="true" />
            <p>Pick someone to call.</p>
            <p className="kc-muted">Rings {KIOSK_LINE}. Nothing dials until you tap Call.</p>
          </div>
        )}
        {pending && (
          <>
            <Avatar c={pending.contact} size="big" />
            {dialed ? (
              <>
                <h2>{pending.state === 'dialing'
                  ? `Starting the call to ${pending.contact.name}…`
                  : offHook ? `Connecting to ${pending.contact.name}…` : `Calling ${pending.contact.name}…`}</h2>
                <p className="kc-call-line">{offHook ? 'Hold the phone to your ear.' : 'Now pick up the phone.'}</p>
                <p className="kc-muted">The call continues on the handset. Closing this screen won’t hang up — put the phone down to end it.</p>
                <div className="kc-call-actions is-one">
                  <button type="button" className="kc-btn kc-big" onClick={closeAfterDial}>Close this screen</button>
                </div>
              </>
            ) : (
              <>
                <h2>Call {pending.contact.name}?</h2>
                <p className="kc-call-line">Rings {KIOSK_LINE}.</p>
                {pending.state === 'error'
                  ? <p role="alert" className="kc-call-error">{pending.message}</p>
                  : <p className="kc-muted">Nothing dials until you tap Call. {offHook ? 'Hold the phone to your ear.' : 'Then pick up the phone to talk.'}</p>}
                {fixture && <p className="kc-muted kc-small">Preview — this screen never dials.</p>}
                <div className="kc-call-actions">
                  <button type="button" className="kc-btn kc-big is-accent" onClick={confirm}>Call {pending.contact.name}</button>
                  <button type="button" className="kc-btn kc-big" onClick={() => setPending(null)}>Cancel</button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )

  if (embedded) return body
  return (
    <div className="kiosk-canvas is-standalone">
      <div className="kc-standalone-head">
        <button type="button" onClick={onClose} aria-label="Close" className="kc-btn kc-icon-btn"><X aria-hidden="true" /></button>
      </div>
      {body}
    </div>
  )
}
