import type { ReactNode } from 'react'

interface AiBodyProps {
  text: string
  /** Optional content rendered below the body (e.g. suggestion cards). */
  children?: ReactNode
}

/** Left-aligned AI response. Small primary-tinted "S" leaf glyph + body copy.
 *  Children render flush below the body, indented to align with the text column. */
export function AiBody({ text, children }: AiBodyProps) {
  return (
    <div className="flex gap-3">
      <div
        aria-hidden
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white"
      >
        <span className="font-display text-[13px] italic leading-none">S</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm leading-relaxed text-neutral-700">{text}</p>
        {children}
      </div>
    </div>
  )
}
