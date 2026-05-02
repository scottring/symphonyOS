import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { OnboardingShell, OnboardingCta } from './OnboardingShell'
import {
  useOnboarding,
  type RhythmAnswers,
  type RhythmDraft,
  rhythmToLabel,
} from '@/contexts/OnboardingContext'

const PROMPTS: Array<{ key: keyof RhythmAnswers; q: string; placeholder: string }> = [
  { key: 'breakfast',  q: 'Breakfast usually looks like…',     placeholder: 'Yogurt with cherry tomatoes for me. Scott skips. Kids: HB eggs + sweet potato.' },
  { key: 'lunch',      q: 'Lunch most weekdays…',              placeholder: 'Dal with raw veg + an apple. Scott has cold cuts. Kids do school lunch.' },
  { key: 'snack',      q: 'Anything you tend to snack on?',    placeholder: 'Apple + cherry tomatoes around 3pm.' },
  { key: 'off_nights', q: "Any nights you don't cook?",        placeholder: 'Friday — adults out. Sunday is batch-cook day.' },
]

const DEBOUNCE_MS = 600

interface Props {
  onBack: () => void
  onContinue: () => void
}

export function RhythmsScreen({ onBack, onContinue }: Props) {
  const {
    rhythms,
    setRhythmAnswers,
    setRhythmParsed,
    setRhythmStatus,
  } = useOnboarding()

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<AbortController | null>(null)
  const seq = useRef(0)

  // Debounced parse: any change to answers schedules a fresh call after DEBOUNCE_MS.
  useEffect(() => {
    const allBlank = !(rhythms.answers.breakfast.trim() ||
                       rhythms.answers.lunch.trim() ||
                       rhythms.answers.snack.trim() ||
                       rhythms.answers.off_nights.trim())
    if (allBlank) {
      setRhythmStatus('idle')
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const mySeq = ++seq.current
      if (inflight.current) inflight.current.abort()
      inflight.current = new AbortController()
      setRhythmStatus('thinking')
      try {
        const { data, error } = await supabase.functions.invoke<{ habits: RhythmDraft[]; note?: string }>(
          'rhythms-parse',
          { body: { answers: rhythms.answers } },
        )
        if (mySeq !== seq.current) return // stale
        if (error || !data) {
          setRhythmStatus('error')
          return
        }
        setRhythmParsed(data.habits ?? [], data.note ?? '')
      } catch {
        if (mySeq === seq.current) setRhythmStatus('error')
      }
    }, DEBOUNCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  // Re-run whenever answers change. Status is intentionally excluded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rhythms.answers.breakfast, rhythms.answers.lunch, rhythms.answers.snack, rhythms.answers.off_nights])

  const updateAnswer = (key: keyof RhythmAnswers, value: string) => {
    setRhythmAnswers({ ...rhythms.answers, [key]: value })
  }

  const updateHabit = (idx: number, patch: Partial<RhythmDraft>) => {
    const next = rhythms.parsed.map((h, i) => i === idx ? { ...h, ...patch } : h)
    setRhythmParsed(next, rhythms.note)
  }

  const offNightCount = rhythms.parsed.filter(h => h.when === 'OFF-NIGHT' || h.when === 'BATCH-DAY').length

  return (
    <OnboardingShell
      stepNumber={3}
      eyebrow="STEP 3 · YOUR RHYTHMS"
      footerLeft={<OnboardingCta onClick={onBack}>← Back</OnboardingCta>}
      footerRight={<OnboardingCta primary onClick={onContinue}>Looks right →</OnboardingCta>}
    >
      <div className="px-20 py-10 flex-1 grid gap-12 overflow-auto" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* LEFT — prompts */}
        <div>
          <h1 className="font-display text-[44px] leading-[1.1] text-neutral-800">
            The rhythms you already keep.
          </h1>
          <div className="h-2" />
          <p className="font-display italic text-[18px] text-neutral-500 leading-[1.4]">
            How do most weeks usually go? Skip anything that doesn't apply.
          </p>

          <div className="h-7" />

          {PROMPTS.map(p => (
            <div key={p.key} className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-1.5">
                {p.q}
              </div>
              <textarea
                value={rhythms.answers[p.key]}
                onChange={e => updateAnswer(p.key, e.target.value)}
                placeholder={p.placeholder}
                rows={2}
                className="w-full bg-bg-elevated border border-neutral-200 rounded-[10px] px-3.5 py-2.5 text-[14px] text-neutral-700 leading-[1.5] placeholder:text-neutral-400 focus:outline-none focus:border-primary-400 resize-none"
              />
            </div>
          ))}
        </div>

        {/* RIGHT — Symphony's read */}
        <div className="bg-bg-elevated border border-neutral-200 rounded-2xl p-6 flex flex-col shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-[22px] h-[22px] rounded-full bg-primary-500 text-white grid place-items-center font-display italic text-[13px]">S</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500">
              SYMPHONY'S READ
            </span>
            <span className="ml-auto text-[10px] text-neutral-400 font-semibold tracking-[0.12em]">
              {rhythms.parseStatus === 'thinking'
                ? 'THINKING…'
                : rhythms.parsed.length > 0
                  ? `${rhythms.parsed.length} HABIT${rhythms.parsed.length === 1 ? '' : 'S'}${offNightCount > 0 ? ` · ${offNightCount} OFF-NIGHT${offNightCount === 1 ? '' : 'S'}` : ''}`
                  : 'READY'}
            </span>
          </div>
          <p className="font-display italic text-[18px] text-neutral-500 mb-[18px]">
            {rhythms.note?.trim() || "Here's what I'm hearing. Edit any of these later."}
          </p>

          {rhythms.parsed.length === 0 && rhythms.parseStatus !== 'thinking' && (
            <div className="text-[13px] italic text-neutral-400 py-8 text-center">
              Start typing on the left and your rhythms will show up here.
            </div>
          )}

          <div>
            {rhythms.parsed.map((h, i) => (
              <div
                key={i}
                className="grid items-start gap-3.5 py-2.5 border-b border-neutral-100 animate-fade-in-up"
                style={{ gridTemplateColumns: '120px 1fr', animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 pt-1">
                  {rhythmToLabel(h.when)}
                </div>
                <div>
                  <input
                    value={h.what}
                    onChange={e => updateHabit(i, { what: e.target.value })}
                    className="w-full bg-transparent border-0 p-0 font-display text-[17px] text-neutral-800 leading-[1.25] focus:outline-none"
                  />
                  <input
                    value={h.detail ?? ''}
                    onChange={e => updateHabit(i, { detail: e.target.value })}
                    placeholder="add detail"
                    className="w-full bg-transparent border-0 p-0 mt-0.5 text-[12px] text-neutral-500 placeholder:text-neutral-300 focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1" />

          {rhythms.parsed.length > 0 && (
            <div className="mt-4 p-3.5 bg-primary-50 border border-primary-100 rounded-[10px]">
              <p className="text-[13px] text-primary-700">
                These become <strong className="font-medium">standing habits</strong>. They show up in every week's plan unless you say otherwise — and your 800g target gets a head-start from them.
              </p>
            </div>
          )}

          {rhythms.parseStatus === 'error' && (
            <div className="mt-3 text-[12px] italic text-accent-500">
              Couldn't read those rhythms. Edit your answers or continue without — you can add habits later.
            </div>
          )}
        </div>
      </div>
    </OnboardingShell>
  )
}
