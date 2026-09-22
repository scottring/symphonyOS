import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { FirstWeekStep } from '@/lib/firstWeek'

/** Optional entry paths, never a checklist of prerequisites. */
export function FirstWeekCard({ onHide, onClearSample }: {
  steps: FirstWeekStep[]; onHide: () => void; onSamplePage: () => void; onClearSample?: () => void
}) {
  const [path, setPath] = useState<'today' | 'goal' | null>(null)
  return <section aria-labelledby="first-week" className="mx-3 mb-4 border-b border-neutral-200 py-4 md:mx-0">
    <h2 id="first-week" className="font-display text-lg text-neutral-800">Where would you like to start?</h2>
    <p className="mt-1 text-sm text-neutral-500">Start with what needs doing, or what you want to work toward. You can plan at any level.</p>
    <div className="mt-3 flex flex-wrap gap-3 text-sm text-primary-700">
      <button type="button" onClick={() => { setPath('today'); window.dispatchEvent(new Event('symphony:add-today')) }}>Add something for today</button>
      <button type="button" onClick={() => setPath('goal')}>Start with a goal</button>
      <button type="button" onClick={onHide} className="text-neutral-500">Explore on my own</button>
    </div>
    {path === 'today' && <p className="mt-3 text-sm text-neutral-600">Add a task in For today. For later work, use <Link to="/week" className="text-primary-700 underline">Week</Link>; Shelves lets you choose it for a day. Completing a task updates it wherever it appears.</p>}
    {path === 'goal' && <div className="mt-3 text-sm text-neutral-600"><p>What would you like to make progress on? Choose a horizon; add a supporting task when you're ready.</p><div className="mt-2 flex gap-4">{['month', 'season', 'year'].map(level => <Link className="text-primary-700 underline" key={level} to={`/${level}`}>{level[0].toUpperCase() + level.slice(1)}</Link>)}</div></div>}
    {onClearSample && <button type="button" className="mt-3 text-xs text-neutral-500 underline" onClick={onClearSample}>Clear sample</button>}
  </section>
}
