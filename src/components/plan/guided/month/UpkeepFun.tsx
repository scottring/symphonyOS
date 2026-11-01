// Planning the month, step 6 (spec 2026-11-01): maintenance and fun. The
// month's monthly routines as the strip's Routines tab lists them (when each
// falls), then what is on the month just for fun. A fun line is only ever
// what is typed here or said in the conversation: nothing is suggested.

import { useState } from 'react'
import { StripRoutineList, type StripRoutine } from '@/components/plan/constellation/AboveStrip'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'

export function UpkeepFun({ monthWord, routines, fun, onAddFun }: {
  monthWord: string
  /** The month's monthly routines (the page's strip list); null: none at this pace. */
  routines: StripRoutine[] | null
  /** The month's open lines marked fun, as the page lists them. */
  fun: readonly { id: string; title: string }[]
  /** A month line marked fun, from the words typed. */
  onAddFun: (title: string) => Promise<boolean>
}) {
  const [adding, setAdding] = useState(false)
  return <div className="gw-body gm-upkeep">
    {routines && <>
      <h4 className="gw-h">Monthly routines</h4>
      <StripRoutineList routines={routines} empty="No monthly routines." label="Monthly routines" />
    </>}
    <h4 className="gw-h">Just for fun</h4>
    {fun.length === 0 ? <p className="choose-empty">Nothing just for fun on {monthWord} yet.</p>
      : <ul className="gw-rows" aria-label={`Fun in ${monthWord}`}>
        {fun.map((f) => <li key={f.id} className="gw-row"><span className="gw-row-title">{f.title}</span></li>)}
      </ul>}
    {adding
      ? <InlineComposer label={`Something fun in ${monthWord}`} saveLabel="Add"
        onSave={async (t) => { const ok = await onAddFun(t); if (ok) setAdding(false); return ok }} onCancel={() => setAdding(false)} />
      : <button type="button" className="canvas-link choose-add" onClick={() => setAdding(true)}>+ Add something fun</button>}
  </div>
}
