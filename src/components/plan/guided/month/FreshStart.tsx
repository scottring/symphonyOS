// Planning the month, step 1 (spec 2026-11-01): fresh start. Pick the month's
// scenery: the places from Settings, compact. A tap changes Symphony's look
// for this person (usePlace, as Settings does) and keeps the choice as the
// month's on their own planning row. The wall keeps its own look.

import { useState } from 'react'
import { PLACES, isPlaceId, type PlaceId } from '@/config/places'
import { PlacePicker } from '@/components/settings/PlacePicker'

export function FreshStart({ monthWord, value, patch }: {
  monthWord: string
  /** The scenery already picked for this month, if any (notes.scenery). */
  value?: string
  /** This person's notes for the month (usePlanningNotes' patch). */
  patch: (p: { scenery: PlaceId }) => Promise<boolean>
}) {
  const [status, setStatus] = useState<'saving' | 'failed' | null>(null)
  const pick = async (place: PlaceId) => {
    setStatus('saving')
    const ok = await patch({ scenery: place }).catch(() => false)
    setStatus(ok ? null : 'failed')
  }
  const picked = isPlaceId(value) ? PLACES.find((p) => p.id === value)?.name : undefined
  return <div className="gw-body gm-fresh">
    {picked && <p className="choose-was">Picked for {monthWord}: <b>{picked}</b></p>}
    <PlacePicker compact onPick={(p) => { void pick(p) }} />
    <p className="gw-row-note">This changes how Symphony looks for you. The wall keeps its own.</p>
    {status === 'saving' && <p className="choose-status" role="status">Saving…</p>}
    {status === 'failed' && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </div>
}
