// NordicManualSpine — Book spine for the bookshelf
// Adapted from parentpulse-web's ManualSpine.tsx for Nordic design system

import type { Manual, ManualType, DomainId } from '@/types/manual'
import { DOMAIN_ORDER } from '@/types/manual'

interface NordicManualSpineProps {
  manual: Manual
  onClick: (manualId: string) => void
}

const SPINE_STYLES: Record<ManualType, { bg: string; text: string; accent: string }> = {
  household: { bg: 'bg-neutral-800', text: 'text-neutral-100', accent: 'bg-accent-500' },
  individual: { bg: 'bg-primary-800', text: 'text-primary-100', accent: 'bg-sage-400' },
}

const TYPE_LABELS: Record<ManualType, string> = {
  household: 'Family',
  individual: 'Personal',
}

export function NordicManualSpine({ manual, onClick }: NordicManualSpineProps) {
  const style = SPINE_STYLES[manual.type] || SPINE_STYLES.household
  const typeLabel = TYPE_LABELS[manual.type] || manual.type

  // Count populated domains
  const domains = manual.domains || {}
  const populatedCount = DOMAIN_ORDER.filter((d: DomainId) => {
    const domain = domains[d]
    if (!domain) return false
    return Object.values(domain).some(v =>
      Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? !!v : !!v
    )
  }).length

  return (
    <button
      onClick={() => onClick(manual.id)}
      className="group block shrink-0 snap-start"
    >
      <div
        className={`${style.bg} rounded-lg w-[120px] h-[180px] relative overflow-hidden cursor-pointer
          shadow-[3px_4px_8px_rgba(0,0,0,0.18),1px_1px_3px_rgba(0,0,0,0.12)]
          group-hover:shadow-[4px_6px_12px_rgba(0,0,0,0.22),2px_2px_4px_rgba(0,0,0,0.16)]
          group-hover:-translate-y-1 transition-all duration-200`}
      >
        {/* Spine edge line */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-black/20" />

        {/* Top accent band */}
        <div className={`${style.accent} h-1.5 mx-3 mt-3 rounded-sm opacity-60`} />

        {/* Title area */}
        <div className="px-3 pt-3 flex flex-col h-[calc(100%-3.5rem)]">
          <h3 className={`${style.text} text-sm font-semibold leading-tight font-display`}>
            {manual.title}
          </h3>
          {manual.subtitle && (
            <p className={`${style.text} opacity-50 text-[10px] mt-1 leading-tight`}>
              {manual.subtitle}
            </p>
          )}
        </div>

        {/* Bottom: type label + domain dots */}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 flex items-end justify-between">
          <span className={`${style.text} opacity-40 text-[9px] uppercase tracking-widest`}>
            {typeLabel}
          </span>
          <div className="flex gap-0.5">
            {DOMAIN_ORDER.map((d, i) => (
              <div
                key={d}
                className={`w-1 h-1 rounded-full ${
                  i < populatedCount ? style.accent + ' opacity-80' : 'bg-white/15'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </button>
  )
}
