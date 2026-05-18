import type { QuadrantContent } from './buildDayGrid'

interface WallQuadrantExpandProps {
  content: QuadrantContent
  onClose: () => void
}

export function WallQuadrantExpand({ content, onClose }: WallQuadrantExpandProps) {
  return (
    <button
      type="button"
      aria-label="Close expanded view"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-neutral-950/95 flex flex-col items-center justify-center p-16 text-center"
    >
      <div className="text-sm uppercase tracking-[0.25em] text-white/50 mb-4">
        {content.eyebrow}
      </div>
      <h2 className="font-display text-6xl font-semibold text-white max-w-4xl leading-tight">
        {content.headline}
      </h2>
      {content.lines.length > 0 && (
        <div role="list" className="mt-10 space-y-4 text-2xl text-white/80">
          {content.lines.map((line, i) => (
            <div role="listitem" key={i}>
              {line.text}
              {line.tag === 'overdue' && (
                <span className="ml-3 text-base uppercase tracking-[0.1em] text-red-400">Overdue</span>
              )}
              {line.tag === 'urgent' && (
                <span className="ml-3 text-base uppercase tracking-[0.1em] text-amber-400">Soon</span>
              )}
            </div>
          ))}
        </div>
      )}
      {/* footer intentionally omitted in the expand view — the full lines list is the content here */}
      <div className="mt-12 text-white/40 text-sm">Tap anywhere to close</div>
    </button>
  )
}
