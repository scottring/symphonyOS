import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'

/**
 * A REVIEW PREVIEW of the "daily edition" — a short, finite read on how things
 * are going and what is planned. It shows only SAMPLE text, labelled as such:
 * nothing here is generated from, or claims anything about, the signed-in
 * household. There is no narrative engine behind it.
 *
 * Off by default. `?edition=sample` turns it on (and remembers that in this
 * browser); "Hide preview" turns it off again. It sits below the day's tasks
 * and schedule so it never competes with the work itself.
 */
const STORAGE_KEY = 'symphony-edition-preview'

// Names and events are invented (a fictional family, not the demo household's
// Liam and Mia), so the sample can never be read as a claim about real people.
const SAMPLE = {
  progress:
    'Theo finished his science poster two days early, and Ada dropped the donations off on Saturday. Three of the five things on this week’s list are done.',
  today:
    'A light morning, then pickup at 3:30. The field-trip form is the one thing with a deadline.',
  ahead:
    'Thursday is busy — two meetings and swim practice. Friday is open, which makes it the natural day to call the piano tuner.',
}

export function useEditionPreview(): [boolean, () => void] {
  const [params, setParams] = useSearchParams()
  const requested = params.get('edition') === 'sample'
  const [on, setOn] = useState(() => {
    if (requested) return true
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    if (!requested) return
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* shown for this visit */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL asked for it
    setOn(true)
  }, [requested])
  const hide = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* nothing to clear */ }
    setOn(false)
    if (requested) setParams((p) => { p.delete('edition'); return p }, { replace: true })
  }
  return [on, hide]
}

export function DailyEditionPreview({ onHide }: { onHide: () => void }) {
  return (
    <section aria-labelledby="daily-edition-heading" className="daily-edition">
      <header className="daily-edition-head">
        <div>
          <p className="daily-edition-flag">Sample · design preview</p>
          <h2 id="daily-edition-heading">The daily edition</h2>
        </div>
        <button type="button" onClick={onHide} aria-label="Hide preview" className="daily-edition-hide">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <p className="daily-edition-note">
        Placeholder text to review placement and tone. It is not about your household.
      </p>
      <dl className="daily-edition-body">
        <div><dt>Progress</dt><dd>{SAMPLE.progress}</dd></div>
        <div><dt>Today</dt><dd>{SAMPLE.today}</dd></div>
        <div><dt>Ahead</dt><dd>{SAMPLE.ahead}</dd></div>
      </dl>
    </section>
  )
}
