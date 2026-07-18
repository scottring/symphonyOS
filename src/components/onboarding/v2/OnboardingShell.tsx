import type { ReactNode } from 'react'

interface Props {
  /** 1-3 for the three numbered steps. Omit on welcome / now-what (terminal). */
  stepNumber?: 1 | 2 | 3
  totalSteps?: number
  /** Section kicker shown above the title in the content region. */
  eyebrow?: string
  /** Right-aligned skip-for-now link in the topbar. */
  allowSkip?: boolean
  onSkip?: () => void
  /** Footer left content — typically a secondary link. */
  footerLeft?: ReactNode
  /** Footer right content — typically the primary CTA. */
  footerRight?: ReactNode
  children: ReactNode
}

/** Shared chrome for every onboarding screen: topbar with logo + progress
 *  dots, content with optional eyebrow kicker, optional footer with back/next.
 *  See docs/design_handoff_onboarding_flow/README.md §"Per-screen specs". */
export function OnboardingShell({
  stepNumber, totalSteps = 3, eyebrow, allowSkip, onSkip,
  footerLeft, footerRight, children,
}: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-bg-base text-neutral-800 font-body">
      {/* TOPBAR */}
      <header className="h-14 border-b border-neutral-200 bg-bg-elevated flex items-center px-8 gap-4 shrink-0">
        <div className="w-7 h-7 rounded-md bg-primary-500 text-white grid place-items-center font-display italic text-[18px]">S</div>
        <div className="font-display text-[18px] text-neutral-800">Symphony</div>
        <div className="flex-1" />
        {stepNumber && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => {
              const active = i + 1 === stepNumber
              const reached = i + 1 <= stepNumber
              return (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 ease-out ${
                    reached ? 'bg-primary-500' : 'bg-neutral-200'
                  }`}
                  style={{ width: active ? 22 : 6 }}
                />
              )
            })}
            <span className="ml-2 text-[11px] text-neutral-500 tabular-nums">
              {stepNumber} of {totalSteps}
            </span>
          </div>
        )}
        {allowSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="ml-4 text-[12px] text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Skip for now
          </button>
        )}
      </header>

      {/* CONTENT */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {eyebrow && (
          <div className="px-20 pt-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500">
              {eyebrow}
            </div>
          </div>
        )}
        {children}
      </main>

      {/* FOOTER */}
      {(footerLeft || footerRight) && (
        <footer className="h-20 border-t border-neutral-200 bg-bg-elevated flex items-center px-8 gap-4 shrink-0">
          <div>{footerLeft}</div>
          <div className="flex-1" />
          <div>{footerRight}</div>
        </footer>
      )}
    </div>
  )
}

/** Primary or secondary pill-shaped CTA. Matches artboard `Cta` atom. */
export function OnboardingCta({
  primary, onClick, disabled, children, type = 'button',
}: {
  primary?: boolean
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center gap-2 px-7 py-3.5 rounded-xl
        text-[14px] font-medium transition-all
        ${primary
          ? 'bg-primary-500 text-white shadow-primary hover:bg-primary-600 disabled:opacity-50'
          : 'border border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-bg-elevated disabled:opacity-50'}
        disabled:cursor-not-allowed
      `}
    >
      {children}
    </button>
  )
}
