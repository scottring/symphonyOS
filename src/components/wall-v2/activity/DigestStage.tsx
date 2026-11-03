// The school digest on the kitchen wall (Scott, 2026-11-03: "I keep losing
// the daily school digest"): More → School digest. The newest day opens; the
// earlier days are pills across the top. Each source is a block — what to do
// (when, and the line of detail), what to know, the chatter — flowing in two
// columns that scroll inside the stage. Nothing is cut off: the point of the
// page is the whole sentence.
//
// Presentation only: the Shell reads the digests (useSchoolDigests).

import { useState } from 'react'
import { dayLabel, toDoLabel, type SchoolDigest } from '@/lib/schoolDigest/schoolDigests'

export function DigestStage({ digests, todayYmd }: { digests: SchoolDigest[]; todayYmd: string }) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const shown = digests.find((d) => d.id === pickedId) ?? digests[0]
  if (!shown) {
    return (
      <div className="kd-stage">
        <p className="kw-quiet kd-empty">No school digest kept yet. Each day’s 5pm digest shows here once it’s emailed.</p>
      </div>
    )
  }
  return (
    <div className="kd-stage">
      <div className="kd-head">
        <p className="kw-eyebrow">{dayLabel(shown, todayYmd) === shown.label ? shown.label : `${dayLabel(shown, todayYmd)} · ${shown.label}`} · {toDoLabel(shown.toDoCount)}</p>
        {digests.length > 1 && (
          <div className="kd-days" role="group" aria-label="Day">
            {digests.slice(0, 10).map((d) => (
              <button key={d.id} type="button" aria-pressed={d.id === shown.id} onClick={() => setPickedId(d.id)}>
                {dayLabel(d, todayYmd)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="kd-body">
        {shown.sections.length === 0 && <p className="kw-quiet">Nothing new that day.</p>}
        {shown.sections.map((s, i) => (
          <section key={`${s.source}-${i}`} className="kd-source" aria-label={s.source}>
            <h3>{s.source}</h3>
            {s.toDo.length ? (
              <ul className="kd-todo">
                {s.toDo.map((t, j) => (
                  <li key={j}>
                    <p className="kd-t"><b>{t.title}</b>{t.when && <span className="kd-when"> — {t.when}</span>}</p>
                    {t.details && <p className="kd-d">{t.details}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="kd-none">Nothing to do.</p>}
            {s.goodToKnow.length > 0 && (
              <>
                <p className="kw-eyebrow kd-lab">Good to know</p>
                <ul className="kd-know">{s.goodToKnow.map((g, j) => <li key={j}>{g}</li>)}</ul>
              </>
            )}
            {s.chatter && s.chatter !== 'Nothing else.' && <p className="kd-chatter">{s.chatter}</p>}
          </section>
        ))}
      </div>
    </div>
  )
}
