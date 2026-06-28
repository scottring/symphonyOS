// ClarityCurtain — a full-page curtain that pulls down from the top to answer
// "where am I, and what's my next move to get clear?" A warm guide, never a
// gate: it highlights the single next step, shows what's already settled, and
// rests on a calm "you're clear" state when there's nothing to do.

import { ChevronUp, Check, Sparkles, ArrowRight } from 'lucide-react'
import type { ClarityResult, ClarityStep, ClarityStepId } from '@/lib/clarity/claritySteps'

interface ClarityCurtainProps {
  open: boolean
  onClose: () => void
  result: ClarityResult
  onStepAction: (id: ClarityStepId) => void
}

export function ClarityCurtain({ open, onClose, result, onStepAction }: ClarityCurtainProps) {
  if (!open) return null

  const act = (id: ClarityStepId) => { onStepAction(id); onClose() }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" role="dialog" aria-label="Clarity">
      <div className="flex flex-col h-full bg-bg-base animate-curtain-down">
        {/* Pull-up handle / close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close clarity"
          className="shrink-0 w-full flex flex-col items-center pt-3 pb-2 text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <span className="w-10 h-1 rounded-full bg-neutral-300 mb-1" />
          <ChevronUp className="w-5 h-5" />
        </button>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="max-w-[640px] mx-auto px-6 py-8">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-400">Where you are</p>

            {result.allClear ? (
              <div className="mt-6 flex flex-col items-center text-center py-12">
                <span className="grid place-items-center w-16 h-16 rounded-full bg-primary-50 text-primary-600 mb-4">
                  <Sparkles className="w-7 h-7" />
                </span>
                <h1 className="font-display text-3xl text-neutral-800">You're clear</h1>
                <p className="mt-2 text-neutral-500">Nothing needs your attention right now. Enjoy it.</p>
              </div>
            ) : (
              <>
                <h1 className="mt-1 font-display text-3xl text-neutral-800">Your next move</h1>
                <div className="mt-6 space-y-3">
                  {result.steps.map((step) => (
                    <StepRow key={step.id} step={step} onAct={() => act(step.id)} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepRow({ step, onAct }: { step: ClarityStep; onAct: () => void }) {
  if (step.status === 'done') {
    return (
      <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-white/60 border border-neutral-200/60">
        <span className="grid place-items-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 shrink-0">
          <Check className="w-3.5 h-3.5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium text-neutral-500 line-through decoration-neutral-300">{step.title}</span>
          <span className="block text-xs text-neutral-400">{step.detail}</span>
        </span>
      </div>
    )
  }

  if (step.status === 'next') {
    return (
      <div className="rounded-2xl px-5 py-4 bg-white border border-primary-200 shadow-[0_4px_16px_rgba(29,107,77,0.10)]">
        <p className="text-[11px] uppercase tracking-wider text-primary-600 font-medium">Next</p>
        <h2 className="mt-0.5 font-display text-xl text-neutral-800">{step.title}</h2>
        <p className="text-sm text-neutral-500">{step.detail}</p>
        <button
          type="button"
          onClick={onAct}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary-600 text-white text-sm font-medium px-4 py-2 hover:bg-primary-700 transition-colors"
        >
          {step.actionLabel} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // todo — still ahead, calm and muted
  return (
    <button
      type="button"
      onClick={onAct}
      className="w-full text-left flex items-center gap-3 rounded-xl px-4 py-3 bg-white/40 border border-dashed border-neutral-200 hover:bg-white/70 transition-colors"
    >
      <span className="w-6 h-6 rounded-full border border-neutral-300 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="text-sm font-medium text-neutral-600">{step.title}</span>
        <span className="block text-xs text-neutral-400">{step.detail}</span>
      </span>
      <span className="text-xs text-neutral-400">{step.actionLabel}</span>
    </button>
  )
}
