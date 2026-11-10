// The school digest on the kitchen wall (Scott, 2026-11-03: "I keep losing
// the daily school digest"): School in the wall's bar. The newest day opens;
// the earlier days are pills across the top. Pages, not scrolling (Scott,
// 2026-11-10: "scrolling is well nigh impossible"): each thing to do or know
// is a card, four to a page, with Previous and Next.
//
// Presentation only: the Shell reads the digests (useSchoolDigests).

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dayLabel, toDoLabel, type SchoolDigest } from '@/lib/schoolDigest/schoolDigests'
import { digestCards, pageOf } from '@/lib/wall/activity/wallBoard'

const PER_PAGE = 4

export function DigestStage({ digests, todayYmd }: { digests: SchoolDigest[]; todayYmd: string }) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const shown = digests.find((d) => d.id === pickedId) ?? digests[0]
  if (!shown) {
    return (
      <div className="kd-stage">
        <p className="kw-quiet kd-empty">No school digest kept yet. Each day’s 5pm digest shows here once it’s emailed.</p>
      </div>
    )
  }
  const cards = pageOf(digestCards(shown), PER_PAGE, page)
  return (
    <div className="kd-stage">
      <div className="kd-head">
        <p className="kw-eyebrow">{dayLabel(shown, todayYmd) === shown.label ? shown.label : `${dayLabel(shown, todayYmd)} · ${shown.label}`} · {toDoLabel(shown.toDoCount)}</p>
        {digests.length > 1 && (
          <div className="kd-days" role="group" aria-label="Day">
            {digests.slice(0, 5).map((d) => (
              <button key={d.id} type="button" aria-pressed={d.id === shown.id} onClick={() => { setPickedId(d.id); setPage(0) }}>
                {dayLabel(d, todayYmd)}
              </button>
            ))}
          </div>
        )}
      </div>
      {cards.items.length === 0
        ? <p className="kw-quiet">Nothing new that day.</p>
        : (
          <ul className="kd-cards" aria-label={`Page ${cards.page + 1} of ${cards.pages}`}>
            {cards.items.map((c, i) => (
              <li key={`${cards.page}-${i}`} className="kd-card">
                <p className="kd-card-src">{c.source}</p>
                {c.when && <span className="kd-card-when">{c.when}</span>}
                <h3>{c.title}</h3>
                {c.details && <p className="kd-card-d">{c.details}</p>}
              </li>
            ))}
          </ul>
        )}
      {cards.pages > 1 && (
        <nav className="kd-pager" aria-label="Pages">
          <button type="button" className="kw-btn is-quiet" disabled={cards.page === 0} onClick={() => setPage(cards.page - 1)}><ChevronLeft aria-hidden="true" />Previous</button>
          <span className="kd-page">Page {cards.page + 1} of {cards.pages}</span>
          <button type="button" className="kw-btn is-quiet" disabled={cards.page === cards.pages - 1} onClick={() => setPage(cards.page + 1)}>Next<ChevronRight aria-hidden="true" /></button>
        </nav>
      )}
    </div>
  )
}
