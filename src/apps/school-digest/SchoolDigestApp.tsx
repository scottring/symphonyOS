// More → School digest (Scott, 2026-11-03: "I keep losing the daily school
// digest and can't find the information"). The 5pm email, kept: the newest
// day open, the earlier days a tap away. The kids' work from the same
// digest is already on Today as homework and papers; this is the rest —
// what a parent has to do and know.
//
// ?date=YYYY-MM-DD opens that day's digest (a link that stays put).

import { useSearchParams } from 'react-router-dom'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { EmptyState } from '@/components/layout/EmptyState'
import { LoadFailedNotice } from '@/components/common/LoadFailedNotice'
import { useSchoolDigests } from '@/hooks/useSchoolDigests'
import { localYmd } from '@/lib/cadence/config'
import { dayLabel, toDoLabel, type SchoolDigest } from '@/lib/schoolDigest/schoolDigests'
import { SchoolDigestBody } from './SchoolDigestBody'

export function SchoolDigestApp() {
  const { digests, loading, failed, refresh } = useSchoolDigests()
  const [params, setParams] = useSearchParams()
  const today = localYmd(new Date())
  const shown: SchoolDigest | undefined = digests.find((d) => d.date === params.get('date')) ?? digests[0]
  const pick = (d: SchoolDigest) => setParams(d === digests[0] ? {} : { date: d.date }, { replace: true })

  const subline = loading && !digests.length ? 'Loading…'
    : failed && !digests.length ? 'Didn’t load'
    : shown ? `${dayLabel(shown, today) === shown.label ? shown.label : `${dayLabel(shown, today)} · ${shown.label}`} · ${toDoLabel(shown.toDoCount)}`
    : 'The 5pm email, kept'

  return (
    <div className="h-full overflow-auto">
      <div className={PAGE_COLUMN}>
        <MastheadCard variant="page" title="School digest" motif="documents" subline={subline} />

        {failed && !digests.length ? (
          <LoadFailedNotice title="The school digest didn’t load." onRetry={() => { void refresh() }} />
        ) : !loading && !digests.length ? (
          <EmptyState title="No digests kept yet.">
            Each day’s 5pm school digest is kept here once it’s emailed, so you can find it again later.
          </EmptyState>
        ) : shown && (
          <>
            {digests.length > 1 && (
              <nav aria-label="Earlier digests" className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
                {digests.map((d) => {
                  const on = d.id === shown.id
                  return (
                    <button
                      key={d.id} type="button" onClick={() => pick(d)} aria-current={on ? 'true' : undefined}
                      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] transition-colors ${on
                        ? 'border-primary-300 bg-primary-50 font-medium text-primary-800'
                        : 'border-neutral-200 bg-bg-elevated text-neutral-700 hover:border-primary-200 hover:bg-primary-50/50'}`}
                    >
                      {dayLabel(d, today)}
                      {d.toDoCount > 0 && <span className="ml-1.5 text-[12px] text-neutral-500">{d.toDoCount}</span>}
                    </button>
                  )
                })}
              </nav>
            )}
            <SchoolDigestBody digest={shown} />
          </>
        )}
      </div>
    </div>
  )
}
