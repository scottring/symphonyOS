import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { OnboardingShell, OnboardingCta } from './OnboardingShell'

interface PreviewCardProps {
  kicker: string
  title: string
  tag?: string
  accent?: boolean
  dark?: boolean
  className?: string
}

function PreviewCard({ kicker, title, tag, accent, dark, className }: PreviewCardProps) {
  return (
    <div
      className={`
        absolute w-60 p-[18px] rounded-[14px] shadow-card
        ${dark
          ? 'bg-neutral-800 text-white border border-neutral-800'
          : accent
            ? 'bg-bg-elevated border border-accent-300'
            : 'bg-bg-elevated border border-neutral-200'}
        ${className ?? ''}
      `}
    >
      <div
        className={`text-[9.5px] font-bold uppercase tracking-[0.18em] ${
          dark ? 'text-white/55' : accent ? 'text-accent-500' : 'text-neutral-400'
        }`}
      >
        {kicker}
      </div>
      <div className="h-1.5" />
      <div className="font-display text-[22px] leading-[1.15]">{title}</div>
      {tag && (
        <div
          className={`mt-2 font-display italic text-[13px] ${
            dark ? 'text-white/55' : 'text-neutral-500'
          }`}
        >
          · {tag}
        </div>
      )}
    </div>
  )
}

interface Props {
  onStart: () => void
  firstName?: string
}

export function WelcomeScreen({ onStart, firstName }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const name = firstName ?? user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'

  return (
    <OnboardingShell
      footerLeft={
        <button
          type="button"
          onClick={() => navigate('/onboarding/sample')}
          className="text-[13px] text-primary-500 underline italic hover:text-primary-600 transition-colors"
        >
          Just looking? See a sample plan →
        </button>
      }
      footerRight={
        <div className="flex gap-3 items-center">
          <span className="text-[12px] text-neutral-400">About 3 minutes</span>
          <OnboardingCta primary onClick={onStart}>Plan my week →</OnboardingCta>
        </div>
      }
    >
      <div className="flex-1 grid items-center px-20 gap-12" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
        {/* Left — copy */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500">WELCOME</div>
          <div className="h-4" />
          <h1 className="font-display text-[72px] leading-[1.05] text-neutral-800">
            Hi {name}<span className="italic text-primary-500">.</span>
          </h1>
          <div className="h-[18px]" />
          <p className="font-display italic text-[26px] leading-[1.4] text-neutral-500 max-w-[540px]">
            Symphony helps you plan the week your family actually eats — habits, kid mods, Sunday batch, all of it.
          </p>
          <div className="h-6" />
          <p className="text-[15px] text-neutral-600 max-w-[480px] leading-relaxed">
            We'll ask a few quick questions, then draft your first week. You can change anything.
          </p>
        </div>

        {/* Right — decorative stack */}
        <div className="grid place-items-center relative">
          <div className="relative" style={{ width: 320, height: 380 }}>
            <PreviewCard
              className="top-3 left-0 -rotate-3"
              kicker="HABITS"
              title="Yogurt + dal lunches"
              tag="standing"
            />
            <PreviewCard
              className="top-20 left-[60px] rotate-2"
              kicker="TUE · DINNER"
              title="Bittman shrimp"
              tag="first time"
              accent
            />
            <PreviewCard
              className="top-[200px] left-[10px] -rotate-1"
              kicker="GROCERIES"
              title="27 items · 6 sections"
              tag="ready to send"
            />
            <PreviewCard
              className="top-[280px] left-[70px] rotate-3"
              kicker="KIOSK"
              title="Tonight at 6:30"
              dark
            />
          </div>
        </div>
      </div>
    </OnboardingShell>
  )
}
