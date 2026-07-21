// src/components/planning/explainers/HorizonExplainer.tsx
//
// Full-screen dismissible scene player — one script per horizon. Pure CSS
// animation (see explainers.css); respects prefers-reduced-motion.
import { useEffect, useState } from 'react'
import { X, ArrowRight, ArrowLeft } from 'lucide-react'
import type { HorizonId } from '@/lib/today/horizons'
import { EXPLAINER_SCENES } from './scenes'
import './explainers.css'

export function HorizonExplainer({ horizon, open, onClose }: {
  horizon: HorizonId
  open: boolean
  onClose: () => void
}) {
  const scenes = EXPLAINER_SCENES[horizon] ?? []
  const [i, setI] = useState(0)
  useEffect(() => { if (open) setI(0) }, [open, horizon])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, scenes.length - 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, scenes.length, onClose])
  if (!open || scenes.length === 0) return null
  const scene = scenes[i]
  const last = i === scenes.length - 1
  return (
    <div className="fixed inset-0 z-50 bg-bg-base/95 backdrop-blur-sm flex flex-col" role="dialog" aria-modal="true">
      <div className="flex items-center justify-end p-4">
        <button type="button" aria-label="Close" onClick={onClose}
          className="w-9 h-9 rounded-full grid place-items-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div key={i} className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 explainer-scene">
        <div className="w-full max-w-md explainer-vignette">{scene.vignette}</div>
        <h2 className="mt-8 font-display text-2xl text-neutral-900 text-center max-w-lg text-balance">{scene.headline}</h2>
        {scene.body && <p className="mt-2 text-sm text-neutral-500 text-center max-w-md">{scene.body}</p>}
      </div>
      <div className="flex items-center justify-between p-6">
        <button type="button" aria-label="Back" onClick={() => setI((v) => Math.max(v - 1, 0))}
          disabled={i === 0}
          className="w-9 h-9 rounded-full grid place-items-center text-neutral-400 hover:bg-neutral-100 disabled:opacity-0 transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {scenes.map((_, d) => (
            <span key={d} className={`w-1.5 h-1.5 rounded-full transition-colors ${d === i ? 'bg-primary-500' : 'bg-neutral-200'}`} />
          ))}
        </div>
        <button type="button" onClick={() => (last ? onClose() : setI((v) => v + 1))}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
          {last ? 'Got it' : 'Next'} {!last && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
