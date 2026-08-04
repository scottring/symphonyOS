import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useThreadData } from '@/hooks/useThreadData'
import { MomentCard, type MomentSize } from './MomentCard'
import type { Moment } from '@/lib/thread/types'

function Band({
  label,
  moments,
  size,
  projectsMap,
  onComplete,
  onPush,
  empty,
}: {
  label: string
  moments: Moment[]
  size: MomentSize
  projectsMap: Map<string, { id: string; name: string; notes?: string }>
  onComplete: (m: Moment) => void
  onPush: (m: Moment) => void
  empty?: string
}) {
  if (moments.length === 0 && !empty) return null

  return (
    <section className="mb-12">
      <h2 className="mb-4 text-[12px] font-medium uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </h2>
      {moments.length === 0 ? (
        <p className="text-[16px] text-neutral-400">{empty}</p>
      ) : (
        <div className={size === 'now' ? 'space-y-4' : 'space-y-2'}>
          {moments.map((moment) => (
            <MomentCard
              key={moment.id}
              moment={moment}
              size={size}
              project={
                moment.item.projectId
                  ? (projectsMap.get(moment.item.projectId) as never)
                  : undefined
              }
              onComplete={onComplete}
              onPush={onPush}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * The thread: one column, three bands, no destinations.
 *
 * There is deliberately no navigation here. If something needs to be reachable
 * and isn't, that is the finding the mock exists to produce — write it down
 * rather than adding a link.
 */
export function ThreadView() {
  const { composition, projectsMap, loading, now, complete, push, capture } = useThreadData()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!draft.trim() || saving) return
      setSaving(true)
      try {
        await capture(draft)
        setDraft('')
      } finally {
        setSaving(false)
      }
    },
    [draft, saving, capture],
  )

  const onComplete = useCallback((m: Moment) => void complete(m), [complete])
  const onPush = useCallback((m: Moment) => void push(m), [push])

  const { now: live, next, loose, nowOverflow } = composition

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <div className="mx-auto w-full max-w-[780px] px-6 py-10">
        <header className="mb-8 flex items-baseline justify-between gap-4">
          <div>
            <p className="font-display text-[30px] leading-none text-neutral-900">
              {now.toLocaleDateString(undefined, { weekday: 'long' })}
            </p>
            <p className="mt-1 text-[15px] text-neutral-500">
              {now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
              {' · '}
              {now
                .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                .toLowerCase()}
            </p>
          </div>
          {/* The only navigation in the thread, and only because the mock has
              to be escapable. It is not part of the design. */}
          <Link to="/today" className="text-[13px] text-neutral-400 underline hover:text-neutral-600">
            back to the old app
          </Link>
        </header>

        <form onSubmit={onSubmit} className="mb-10">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What's on your mind"
            aria-label="Capture"
            className="w-full rounded-2xl border border-neutral-200 bg-[var(--color-bg-elevated)] px-5 py-4 font-display text-[20px] text-neutral-900 placeholder:text-neutral-300 focus:border-primary-300 focus:outline-none"
          />
        </form>

        {loading && live.length === 0 && next.length === 0 && loose.length === 0 ? (
          <p className="text-[16px] text-neutral-400">Reading the day…</p>
        ) : (
          <>
            <Band
              label="Now"
              moments={live}
              size="now"
              projectsMap={projectsMap}
              onComplete={onComplete}
              onPush={onPush}
              empty="Nothing live right now."
            />
            {nowOverflow > 0 && (
              <p className="-mt-8 mb-12 text-[13px] text-neutral-400">
                {nowOverflow} more {nowOverflow === 1 ? 'moment was' : 'moments were'} live at once
                — moved to Next so this stays scannable.
              </p>
            )}

            <Band
              label="Next"
              moments={next}
              size="next"
              projectsMap={projectsMap}
              onComplete={onComplete}
              onPush={onPush}
            />

            <Band
              label="Loose"
              moments={loose}
              size="loose"
              projectsMap={projectsMap}
              onComplete={onComplete}
              onPush={onPush}
            />
          </>
        )}
      </div>
    </div>
  )
}
