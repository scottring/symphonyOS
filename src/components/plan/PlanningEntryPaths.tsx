// src/components/plan/PlanningEntryPaths.tsx
//
// Three optional ways in — "Somewhere to start". Not onboarding: there is no
// order, no progress, nothing to complete, and skipping all three leaves the
// reader exactly where they were. Each door does one thing the app already
// does, and offers the matching sheet from the planning guide beside it.
//
// It can be hidden for good, and it can always be brought back, so a reader
// who has found their footing is not shown it forever.
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { requestQuickAdd } from '@/lib/quickAddSignal'

const HIDDEN_KEY = 'symphony.planningEntryPaths.hidden'

function readHidden(): boolean {
  try { return localStorage.getItem(HIDDEN_KEY) === '1' } catch { return false }
}
function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY, '1')
    else localStorage.removeItem(HIDDEN_KEY)
  } catch { /* private window, or storage disabled */ }
}

export interface PlanningEntryPathsProps {
  /**
   * The door the reader is already standing in, if any. It says so plainly and
   * offers nothing — neither a link to where they are, nor a second copy of
   * the control this page already has above its own list.
   */
  here?: 'weeks' | 'season' | null
  /**
   * Can it be put away? True where it is an ASIDE beside other content.
   *
   * False on the Getting Started page, where the doors are the page's whole
   * point: a reader who hid them once as an aside must not arrive at the page
   * they chose and find it empty (seen live, 2026-09-24).
   */
  dismissible?: boolean
}

/** Marks the door the reader is already in. */
function Here() {
  return <span className="entry-path-here">You’re on this page</span>
}

export function PlanningEntryPaths({ here = null, dismissible = true }: PlanningEntryPathsProps) {
  const [hidden, setHidden] = useState(() => dismissible && readHidden())
  const hide = useCallback(() => { setHidden(true); writeHidden(true) }, [])
  const show = useCallback(() => { setHidden(false); writeHidden(false) }, [])

  if (hidden && dismissible) {
    return (
      <p className="entry-paths-back">
        <button type="button" onClick={show} className="entry-paths-link">Show where to start</button>
      </p>
    )
  }

  return (
    <section aria-label="Somewhere to start" className="entry-paths">
      <div className="entry-paths-head">
        <div className="min-w-0">
          <p className="entry-paths-eyebrow">Somewhere to start</p>
          <p className="entry-paths-lead">
            Pick one, or none. Nothing here has to be done in order, and skipping all three leaves
            you exactly where you are.
          </p>
        </div>
        {dismissible && (
          <button type="button" onClick={hide} className="entry-paths-link shrink-0">Hide this</button>
        )}
      </div>

      <div className="entry-paths-doors">
        <div className="entry-path">
          <h3 className="entry-path-title">Capture something now</h3>
          <p className="entry-path-body">
            One line, no decisions. It waits in the Inbox until you want to deal with it.
            Start the line with “event:” to put it on the calendar, or say how often
            (“every Tuesday”) and it offers a routine instead.
          </p>
          <div className="entry-path-foot">
            <button type="button" onClick={() => requestQuickAdd()} className="entry-path-action">
              Write one line
            </button>
            <Link to="/inbox" className="entry-path-aside">Open the Inbox</Link>
          </div>
        </div>

        <div className="entry-path">
          <h3 className="entry-path-title">Plan the next few weeks</h3>
          <p className="entry-path-body">
            Work with what the month already holds — existing goals and work stay visible and
            editable, and you choose what changes.
          </p>
          <div className="entry-path-foot">
            {here === 'weeks' ? <Here /> : <Link to="/month" className="entry-path-action">Go to the month</Link>}
            <Link to="/guide#month" className="entry-path-aside">
              Print the month sheet <ArrowUpRight className="mb-0.5 inline h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="entry-path">
          <h3 className="entry-path-title">Set a season or a year</h3>
          <p className="entry-path-body">
            Decide what the longer stretch is for. Months can point at it later, or never — nothing
            below has to wait for this.
          </p>
          <div className="entry-path-foot">
            {here === 'season' ? <Here /> : <Link to="/season" className="entry-path-action">Go to the season</Link>}
            <Link to="/guide#season" className="entry-path-aside">
              Print the season sheet <ArrowUpRight className="mb-0.5 inline h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      <p className="entry-paths-foot">
        The <Link to="/guide" className="entry-paths-link">planning guide</Link> has a printable
        sheet for the week, the month, the season and the year. Each one works on its own.
      </p>
    </section>
  )
}
