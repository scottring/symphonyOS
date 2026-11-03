// One day's digest, as the email laid it out: a section a source, what to
// do (with when, and one line of detail), what to know, and the chatter.

import { SectionHeading, GroupLabel } from '@/components/layout/SectionHeading'
import type { SchoolDigest } from '@/lib/schoolDigest/schoolDigests'

export function SchoolDigestBody({ digest }: { digest: SchoolDigest }) {
  if (!digest.sections.length) return <p className="text-[15px] text-neutral-500">Nothing new that day.</p>
  return (
    <div className="space-y-8 pb-12">
      {digest.sections.map((s, i) => (
        <section key={`${s.source}-${i}`} aria-label={s.source}>
          <SectionHeading>{s.source}</SectionHeading>
          <GroupLabel aside={s.toDo.length ? s.toDo.length : undefined}>To do</GroupLabel>
          {s.toDo.length ? (
            <ul className="space-y-3">
              {s.toDo.map((t, j) => (
                <li key={j} className="max-w-[44rem]">
                  <p className="text-[16px] leading-snug text-neutral-900">
                    <span className="font-medium">{t.title}</span>
                    {t.when && <span className="text-primary-700"> — {t.when}</span>}
                  </p>
                  {t.details && <p className="mt-0.5 text-[14px] leading-snug text-neutral-600">{t.details}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="text-[14px] text-neutral-500">Nothing to do.</p>}
          {s.goodToKnow.length > 0 && (
            <>
              <GroupLabel>Good to know</GroupLabel>
              <ul className="max-w-[44rem] list-disc space-y-1.5 pl-5 text-[15px] leading-snug text-neutral-800 marker:text-neutral-400">
                {s.goodToKnow.map((g, j) => <li key={j}>{g}</li>)}
              </ul>
            </>
          )}
          {s.chatter && s.chatter !== 'Nothing else.' && (
            <p className="mt-3 max-w-[44rem] text-[14px] italic leading-snug text-neutral-500">{s.chatter}</p>
          )}
        </section>
      ))}
    </div>
  )
}
