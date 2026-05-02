import { useNavigate } from 'react-router-dom'
import { OnboardingShell, OnboardingCta } from './OnboardingShell'
import { WHITMAN_FIXTURE } from './sample/whitmanFixture'

const DAY_HIGHLIGHT_LABELS = new Set(['Thursday'])

/** Public read-only sample plan for browsers who picked "See a sample plan"
 *  on Welcome. Uses the hand-authored Whitman fixture so it stays decoupled
 *  from real demo data. Reachable while logged out. */
export function SamplePlanPage() {
  const navigate = useNavigate()

  return (
    <OnboardingShell>
      {/* Watermark */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="bg-accent-500 text-white px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-[0.14em] shadow-accent">
          SAMPLE PLAN · NOT YOURS · WHITMAN FAMILY
        </div>
      </div>

      <div className="flex-1 flex flex-col px-20 py-13 relative" style={{ paddingTop: 52, paddingBottom: 52 }}>
        <h1 className="font-display text-[56px] leading-[1.1] text-neutral-800">
          Family Meal <span className="italic text-primary-500">Plan.</span>
        </h1>
        <div className="h-2" />
        <p className="font-display italic text-[22px] text-neutral-500 leading-[1.4]">
          {WHITMAN_FIXTURE.brief}
        </p>

        <div className="h-7" />

        {/* Mini week strip */}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {WHITMAN_FIXTURE.days.map(d => {
            const headline = d.meals.find(m => m.slot === 'dinner') ?? d.meals[0]
            const highlight = DAY_HIGHLIGHT_LABELS.has(d.label)
            return (
              <div
                key={d.dayOfWeek}
                className={`rounded-xl p-4 border ${
                  highlight ? 'bg-accent-50 border-accent-300' : 'bg-bg-elevated border-neutral-200'
                }`}
              >
                <div className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                  highlight ? 'text-accent-500' : 'text-neutral-500'
                }`}>
                  {d.label.slice(0, 3).toUpperCase()}
                </div>
                <div className="font-display text-[18px] text-neutral-800 mt-1.5 leading-[1.2]">
                  {headline?.title}
                </div>
                {headline?.detail && (
                  <div className="font-display italic text-[13px] text-primary-500 mt-1">{headline.detail}</div>
                )}
              </div>
            )
          })}
        </div>

        <div className="h-7" />

        {/* Two columns — habits / batch */}
        <div className="grid gap-5 flex-1" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="bg-bg-elevated border border-neutral-200 rounded-xl p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">
              STANDING HABITS · {WHITMAN_FIXTURE.habits.length}
            </div>
            <div className="h-3" />
            <div className="space-y-2">
              {WHITMAN_FIXTURE.habits.map((h, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[13.5px] text-neutral-700">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-400 w-[100px] shrink-0">
                    {h.whenLabel}
                  </span>
                  <span className="font-display">{h.what}</span>
                  {h.detail && <span className="italic text-neutral-500 text-[12px]">· {h.detail}</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-bg-elevated border border-neutral-200 rounded-xl p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500">
              SUNDAY BATCH
            </div>
            <div className="h-3" />
            <div className="text-[14px] text-neutral-700 leading-[1.9]">
              {WHITMAN_FIXTURE.days[0].meals.find(m => m.slot === 'prep')?.title ?? '—'}
              <div className="text-[12px] italic text-neutral-500 mt-2">
                Feeds Mon–Wed lunches.
              </div>
            </div>
            <div className="h-4" />
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500 mt-2">
              GROCERIES · {WHITMAN_FIXTURE.groceriesSummary.total} ITEMS
            </div>
            <div className="h-2" />
            <div className="text-[12.5px] text-neutral-500 leading-[1.6]">
              {WHITMAN_FIXTURE.groceriesSummary.examples.slice(0, 6).join(' · ')}…
            </div>
          </div>
        </div>

        {/* Bottom CTA bar */}
        <div className="mt-6 px-6 py-5 bg-neutral-800 text-white rounded-[14px] flex items-center gap-4">
          <div className="flex-1">
            <div className="font-display text-[22px]">Like what you see?</div>
            <div className="text-[13px] text-white/65 mt-0.5">
              Make your own in about 3 minutes. We'll use your habits, not Iris's.
            </div>
          </div>
          <OnboardingCta primary onClick={() => navigate('/onboarding')}>
            Start your own plan →
          </OnboardingCta>
        </div>
      </div>
    </OnboardingShell>
  )
}
