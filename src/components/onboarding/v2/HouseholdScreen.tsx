import { useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { OnboardingShell, OnboardingCta } from './OnboardingShell'
import { useOnboarding, type Adult, type Kid } from '@/contexts/OnboardingContext'

interface Props {
  onBack: () => void
  onContinue: () => void
}

export function HouseholdScreen({ onBack, onContinue }: Props) {
  const { user } = useAuth()
  const { household, setAdults, setKids } = useOnboarding()

  // Seed the first adult from the authed user on first mount if empty.
  useEffect(() => {
    if (household.adults.length === 0) {
      const seed = user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? ''
      setAdults([{ name: seed, role: '' }])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canContinue = household.adults.some(a => a.name.trim().length > 0)

  const summary = useMemo(() => {
    const adultCount = household.adults.filter(a => a.name.trim()).length
    const kidCount = household.kids.filter(k => k.name.trim()).length
    if (adultCount === 0) return null
    const parts: string[] = []
    parts.push(`${adultCount} adult${adultCount === 1 ? '' : 's'}`)
    if (kidCount > 0) parts.push(`${kidCount} kid${kidCount === 1 ? '' : 's'}`)
    const tail = kidCount > 0
      ? "I'll plan parallel kid plates by default."
      : "I'll plan straightforward family plates."
    return { headline: parts.join(' + '), tail }
  }, [household])

  const updateAdult = (idx: number, patch: Partial<Adult>) => {
    setAdults(household.adults.map((a, i) => i === idx ? { ...a, ...patch } : a))
  }
  const removeAdult = (idx: number) => setAdults(household.adults.filter((_, i) => i !== idx))
  const addAdult = () => setAdults([...household.adults, { name: '', role: '' }])

  const updateKid = (idx: number, patch: Partial<Kid>) => {
    setKids(household.kids.map((k, i) => i === idx ? { ...k, ...patch } : k))
  }
  const removeKid = (idx: number) => setKids(household.kids.filter((_, i) => i !== idx))
  const addKid = () => setKids([...household.kids, { name: '', age: undefined }])

  return (
    <OnboardingShell
      stepNumber={1}
      eyebrow="STEP 1 · HOUSEHOLD"
      footerLeft={<OnboardingCta onClick={onBack}>← Back</OnboardingCta>}
      footerRight={
        <OnboardingCta primary onClick={onContinue} disabled={!canContinue}>
          Continue →
        </OnboardingCta>
      }
    >
      <div className="px-20 py-10 flex-1 flex flex-col">
        <h1 className="font-display text-[48px] leading-[1.1] text-neutral-800">Who's eating?</h1>
        <div className="h-2" />
        <p className="font-display italic text-[18px] text-neutral-500 max-w-[580px] leading-[1.4]">
          Just enough so the plan is sized right. You can edit any of this later.
        </p>

        <div className="h-9" />

        <div className="grid gap-6 max-w-[880px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Adults */}
          <div className="bg-bg-elevated border border-neutral-200 rounded-2xl p-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">ADULTS</div>
            <div className="h-3" />
            <div className="flex flex-col gap-3">
              {household.adults.map((a, i) => (
                <PersonRow
                  key={i}
                  name={a.name}
                  detail={a.role}
                  pinned={i === 0}
                  onNameChange={(v) => updateAdult(i, { name: v })}
                  onDetailChange={(v) => updateAdult(i, { role: v })}
                  onRemove={i === 0 ? undefined : () => removeAdult(i)}
                  detailPlaceholder="role · preferences (optional)"
                />
              ))}
              <AddRow label="+ Add adult" onClick={addAdult} />
            </div>
          </div>

          {/* Kids */}
          <div className="bg-bg-elevated border border-neutral-200 rounded-2xl p-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">KIDS · OPTIONAL</div>
            <div className="h-3" />
            <div className="flex flex-col gap-3">
              {household.kids.map((k, i) => (
                <KidRow
                  key={i}
                  name={k.name}
                  age={k.age}
                  onNameChange={(v) => updateKid(i, { name: v })}
                  onAgeChange={(v) => updateKid(i, { age: v })}
                  onRemove={() => removeKid(i)}
                />
              ))}
              <AddRow label="+ Add kid" onClick={addKid} />
            </div>
            <p className="mt-3.5 text-[11.5px] text-neutral-400 leading-[1.6]">
              We use ages to suggest kid mods (parallel plates) and adjust portion sizes. No tracking on kids.
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {summary && (
          <div className="mt-4 px-4 py-3 bg-primary-50 border border-primary-100 rounded-[10px] inline-flex items-center gap-2.5 self-start">
            <span className="w-[18px] h-[18px] rounded-full bg-primary-500 text-white grid place-items-center font-display italic text-[12px] shrink-0">S</span>
            <span className="text-[13px] text-primary-700">
              Got it — a household of{' '}
              <strong className="font-medium">{summary.headline}</strong>. {summary.tail}
            </span>
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}

function Avatar({ name }: { name: string }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-primary-500 text-white grid place-items-center font-display text-[16px] shrink-0">
      {initial}
    </div>
  )
}

function PersonRow({
  name, detail, pinned, onNameChange, onDetailChange, onRemove, detailPlaceholder,
}: {
  name: string
  detail?: string
  pinned?: boolean
  onNameChange: (v: string) => void
  onDetailChange: (v: string) => void
  onRemove?: () => void
  detailPlaceholder?: string
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 bg-bg-base border border-neutral-200 rounded-[10px]">
      <Avatar name={name} />
      <div className="flex-1 min-w-0">
        <input
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Name"
          className="w-full bg-transparent border-0 p-0 font-display text-[18px] text-neutral-800 placeholder:text-neutral-300 focus:outline-none"
        />
        <input
          value={detail ?? ''}
          onChange={e => onDetailChange(e.target.value)}
          placeholder={detailPlaceholder}
          className="w-full bg-transparent border-0 p-0 mt-0.5 text-[12px] text-neutral-500 placeholder:text-neutral-300 focus:outline-none"
        />
      </div>
      {pinned ? (
        <span className="text-[10px] text-neutral-400 font-semibold tracking-[0.14em]">YOU</span>
      ) : onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="text-neutral-300 hover:text-accent-500 px-1 transition-colors"
          aria-label="Remove"
        >×</button>
      ) : null}
    </div>
  )
}

function KidRow({
  name, age, onNameChange, onAgeChange, onRemove,
}: {
  name: string
  age?: number
  onNameChange: (v: string) => void
  onAgeChange: (v: number | undefined) => void
  onRemove: () => void
}) {
  return (
    <div className="grid items-center gap-2.5 px-3.5 py-2.5 bg-bg-base border border-neutral-200 rounded-[10px]"
         style={{ gridTemplateColumns: '1fr 80px 24px' }}>
      <input
        value={name}
        onChange={e => onNameChange(e.target.value)}
        placeholder="Name"
        className="bg-transparent border-0 p-0 font-display text-[17px] text-neutral-800 placeholder:text-neutral-300 focus:outline-none"
      />
      <input
        type="number"
        min={0}
        max={21}
        value={age ?? ''}
        onChange={e => {
          const v = e.target.value
          onAgeChange(v === '' ? undefined : Math.max(0, Math.min(21, Number(v))))
        }}
        placeholder="age"
        className="bg-transparent border-0 p-0 font-display italic text-[14px] text-neutral-500 placeholder:text-neutral-300 focus:outline-none"
      />
      <button
        type="button"
        onClick={onRemove}
        className="text-neutral-300 hover:text-accent-500 text-center transition-colors"
        aria-label="Remove kid"
      >×</button>
    </div>
  )
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left px-3.5 py-2.5 border border-dashed border-neutral-300 rounded-[10px] text-[13px] text-primary-500 font-display italic hover:border-primary-400 hover:bg-primary-50 transition-colors"
    >
      {label}
    </button>
  )
}
