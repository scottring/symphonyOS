// src/components/plan/GettingStartedPage.tsx
//
// Getting Started, on its own page.
//
// The three optional ways in used to sit in a large "Somewhere to start" box
// at the top of Month, Season and Year — a planning page opening with an
// onboarding panel above the plan. Scott asked for it out of the planner and
// into an independent place (Codex, 2026-09-24: "a dedicated Getting Started
// destination, reachable from More, with the three optional entries and guide
// link").
//
// Nothing here is a step, a sequence or a gate: it is a page you visit when
// you want it, and never one that opens itself.
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { PlanningEntryPaths } from './PlanningEntryPaths'

export function GettingStartedPage() {
  return (
    <div className={`${PAGE_COLUMN} getting-started-page`}>
      <MastheadCard
        variant="page"
        eyebrow={<span className="text-[12px] uppercase tracking-wider text-neutral-500">Getting started</span>}
        title="Start wherever you are"
        subline={<p className="text-[12px] text-neutral-500">Three ways in, none of them required.</p>}
      />

      <section className="getting-started-body">
        <p>
          There is no right order and no first step you owe anyone. Capture one thing, plan the
          next few weeks, or think about the season — or close this and carry on; the planner
          works either way.
        </p>

        {/* The same three doors, in the one place they belong. */}
        <PlanningEntryPaths dismissible={false} />

        <h2>The planning guide</h2>
        <p>
          Four sheets you can print — a week, a month, a season and a year. The week sheet is one
          side and is the one to start with; none of the others is a prerequisite for anything.
        </p>
        <p>
          <Link to="/guide" className="getting-started-link">
            Open the planning guide <ArrowUpRight className="mb-0.5 inline h-3 w-3" />
          </Link>
        </p>

        <h2>Coming back to this</h2>
        <p>
          This page is under <strong>More → Getting started</strong> whenever you want it. The
          first-week checklist still lives on Today, and <Link to="/today?welcome=1" className="getting-started-link">opens
          on request</Link> however full your planner is.
        </p>
      </section>
    </div>
  )
}
