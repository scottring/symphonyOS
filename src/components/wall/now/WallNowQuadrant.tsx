import type { QuadrantContent } from './buildDayGrid'

export type QuadrantVariant = 'event' | 'neutral' | 'family'

const VARIANT_BG: Record<QuadrantVariant, string> = {
  event: 'bg-gradient-to-br from-emerald-900 to-teal-800',
  neutral: 'bg-white/5 border border-white/10',
  family: 'bg-gradient-to-br from-sky-900 to-cyan-900',
}

interface WallNowQuadrantProps {
  content: QuadrantContent
  onTap: () => void
  variant: QuadrantVariant
}

export function WallNowQuadrant({ content, onTap, variant }: WallNowQuadrantProps) {
  const lines = content.lines.slice(0, 3)
  return (
    <button
      type="button"
      aria-label={`${content.eyebrow}: ${content.headline}`}
      onClick={onTap}
      className={`text-left rounded-2xl p-6 flex flex-col h-full min-h-0 ${VARIANT_BG[variant]}`}
    >
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 mb-2">
        {content.eyebrow}
      </div>
      <h3 className="font-display text-3xl font-semibold leading-tight text-white line-clamp-2">
        {content.headline}
      </h3>
      {lines.length > 0 && (
        <div role="list" className="mt-4 space-y-1.5 text-white/75 text-base">
          {lines.map((line, i) => (
            <div role="listitem" key={i} className="truncate">
              {line.text}
              {line.tag === 'overdue' && (
                <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-red-400 border border-red-400/40 rounded px-1.5 py-0.5">
                  Overdue
                </span>
              )}
              {line.tag === 'urgent' && (
                <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5">
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {content.footer && (
        <div className="mt-auto pt-3 text-xs text-white/45">{content.footer}</div>
      )}
    </button>
  )
}
