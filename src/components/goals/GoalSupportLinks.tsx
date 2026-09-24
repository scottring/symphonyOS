import { Target } from 'lucide-react'
import type { SupportLink } from '@/lib/planning/goalSupport'

/**
 * One end of the goal-supports-goal relationship, as a titled block.
 *
 * The same section serves both directions and every rung — "Supported by" on a
 * parent (the seasons that took a year goal on, the months serving a season
 * goal) and "Supports" on a child. One component so the relationship reads
 * identically wherever it appears: the year goal's page, and a month or season
 * goal's detail page.
 *
 * Distinct from Chapters, which sits beside it on the year goal's page: a
 * chapter is a PICK that served the goal, stamped with `picked_at`. A goal
 * written in a guided session has no pick stamp, so Chapters could never show
 * one (S3-02).
 */
export function GoalSupportLinks({ heading, links, onOpen }: {
  heading: string
  links: readonly SupportLink[]
  onOpen?: (link: SupportLink) => void
}) {
  if (links.length === 0) return null
  return (
    <section className="mt-6">
      <h3 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-2">{heading}</h3>
      <ul className="space-y-1.5">
        {links.map((link) => (
          <li key={link.id} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 text-[11px] text-neutral-400">{link.period}</span>
            <Target className="w-3.5 h-3.5 shrink-0 text-accent-600" aria-hidden="true" />
            {onOpen ? (
              <button type="button" onClick={() => onOpen(link)} className="min-w-0 flex-1 truncate text-left text-neutral-700 hover:underline">{link.title}</button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-neutral-700">{link.title}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
