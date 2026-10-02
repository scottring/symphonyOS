import { useId, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Compass, PenLine, Target } from 'lucide-react'
import type { FirstWeekStep } from '@/lib/firstWeek'

/** One way in: a tappable tile with an icon, a short title and a one-line
 *  promise (walkthrough 2026-10-02, #2: "this part could stand to be more
 *  graphical / push-buttony / inviting"). The title alone is its name. */
function Tile({ icon: Icon, title, promise, primary = false, pressed, onClick }: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  title: string
  promise: string
  primary?: boolean
  pressed?: boolean
  onClick: () => void
}) {
  const id = useId()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-p`}
      {...(pressed !== undefined ? { 'aria-expanded': pressed } : {})}
      className={`first-week-tile flex min-h-[4.5rem] w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${
        primary
          ? 'border-primary-600 bg-primary-600 text-white hover:bg-primary-700'
          : `border-neutral-200 bg-bg-elevated text-neutral-800 hover:border-primary-300 hover:bg-primary-50 ${pressed ? 'border-primary-300 bg-primary-50' : ''}`
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${primary ? 'text-white' : 'text-primary-600'}`} aria-hidden="true" />
      <span className="min-w-0">
        <span id={`${id}-t`} className="block text-[15px] font-medium leading-snug">{title}</span>
        <span id={`${id}-p`} className={`mt-0.5 block text-[13px] leading-snug ${primary ? 'text-white/85' : 'text-neutral-500'}`}>{promise}</span>
      </span>
    </button>
  )
}

/** Optional entry paths, never a checklist of prerequisites. */
export function FirstWeekCard({ onHide, onClearSample }: {
  steps: FirstWeekStep[]; onHide: () => void; onSamplePage: () => void; onClearSample?: () => void
}) {
  const [path, setPath] = useState<'today' | 'goal' | null>(null)
  return <section aria-labelledby="first-week" className="mx-3 mb-4 border-b border-neutral-200 py-4 md:mx-0">
    <h2 id="first-week" className="font-display text-lg text-neutral-800">Where would you like to start?</h2>
    <p className="mt-1 text-sm text-neutral-500">Start with what needs doing, or what you want to work toward. You can plan at any level.</p>
    {/* Three tiles in a row on a wide screen, stacked on a phone. */}
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile icon={PenLine} primary title="Add something for today" promise="Write it down and do it today."
        onClick={() => { setPath('today'); window.dispatchEvent(new Event('symphony:add-today')) }} />
      <Tile icon={Target} title="Start with a goal" promise="Name what you want this year or season to hold."
        pressed={path === 'goal'} onClick={() => setPath('goal')} />
      <Tile icon={Compass} title="Explore on my own" promise="Hide this and look around." onClick={onHide} />
    </div>
    {/* S1-01: two doors, and neither said a calendar event, a capture or a
        routine was possible. Getting Started holds all three ways in and the
        guide — a link, not another step. */}
    <p className="mt-3 text-sm"><Link to="/start" className="text-primary-700 underline">Plan with guidance →</Link></p>
    {path === 'today' && <p className="mt-3 text-sm text-neutral-600">Add a task in For today. For later work, use <Link to="/week" className="text-primary-700 underline">Week</Link>; Shelves lets you choose it for a day. Completing a task updates it wherever it appears.</p>}
    {path === 'goal' && <div className="mt-3 text-sm text-neutral-600"><p>What would you like to make progress on? Choose a horizon; add a supporting task when you're ready.</p><div className="mt-2 flex gap-4">{['month', 'season', 'year'].map(level => <Link className="text-primary-700 underline" key={level} to={`/${level}`}>{level[0].toUpperCase() + level.slice(1)}</Link>)}</div></div>}
    {onClearSample && <button type="button" className="mt-3 text-xs text-neutral-500 underline" onClick={onClearSample}>Clear sample</button>}
  </section>
}
