import { useState, useEffect, useCallback } from 'react'
import type { ActiveContext, ContextEvalData, ContextViewProps } from './types'
import { DinnerFlowView } from './DinnerFlowView'
import { MorningLaunchView } from './MorningLaunchView'
import { AfterSchoolView } from './AfterSchoolView'
import { BedtimeView } from './BedtimeView'
import { WeekendMorningView } from './WeekendMorningView'
import { PlaceholderContextView } from './PlaceholderContextView'

interface ContextOverlayProps {
  activeContext: ActiveContext
  data: ContextEvalData
  onDismiss: () => void
}

const VIEW_COMPONENTS: Record<string, React.ComponentType<ContextViewProps>> = {
  'dinner-flow': DinnerFlowView,
  'morning-launch': MorningLaunchView,
  'after-school': AfterSchoolView,
  'bedtime': BedtimeView,
  'weekend-morning': WeekendMorningView,
}

export function ContextOverlay({ activeContext, data, onDismiss }: ContextOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(timer)
  }, [])

  // Handle dismiss with exit animation
  const handleDismiss = useCallback(() => {
    setExiting(true)
    setTimeout(onDismiss, 400)
  }, [onDismiss])

  // Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleDismiss()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleDismiss])

  const ViewComponent = VIEW_COMPONENTS[activeContext.viewId] || PlaceholderContextView

  return (
    <div
      className={`absolute inset-0 z-50 transition-all duration-400 ease-out ${
        visible && !exiting
          ? 'opacity-100'
          : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-[#0f172a] transition-opacity duration-400 ${
          visible && !exiting ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Content */}
      <div
        className={`absolute inset-0 transition-all duration-500 ease-out ${
          visible && !exiting
            ? 'translate-y-0 scale-100'
            : 'translate-y-8 scale-[0.97]'
        }`}
      >
        {/* Back button */}
        <button
          onClick={handleDismiss}
          className="absolute top-8 left-8 z-60 flex items-center gap-3 px-5 py-3
            rounded-xl bg-white/8 border border-white/15 backdrop-blur-sm
            text-white/70 hover:text-white hover:bg-white/12
            transition-all duration-200 group"
        >
          <svg
            className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-bold text-[0.9rem] uppercase tracking-wider">Back</span>
        </button>

        {/* Time display (small, top right) */}
        <div className="absolute top-8 right-8 z-60 text-white/30 font-bold text-[1rem] tabular-nums">
          {data.now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>

        {/* View content */}
        <div className="absolute inset-0 pt-24 pb-8 px-12">
          <ViewComponent data={data} onDismiss={handleDismiss} />
        </div>
      </div>

      <style>{`
        .duration-400 { transition-duration: 400ms; }
      `}</style>
    </div>
  )
}
