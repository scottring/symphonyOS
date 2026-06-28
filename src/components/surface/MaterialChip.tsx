// Renders one staged Material. Two variants share the same action wiring:
//   - 'chip' — compact, for the Daily Plan "Bring" row
//   - 'tile' — large touch target, for the Execution Wall (Phase 2)
//
// call/href actions render as real links (work on a phone); everything else is a
// button that delegates to onAction so the parent decides (open directions
// builder, recipe, step list, email thread). 'partial' materials get an amber
// "one field away" treatment; 'auto' is the calm filled style.

import { ConceptIcon } from '@/lib/conceptIcons'
import type { Material } from '@/types/material'

interface MaterialChipProps {
  material: Material
  variant?: 'chip' | 'tile'
  /** Called for non-link actions (directions, recipe, steps, email, files). */
  onAction?: (material: Material) => void
  /**
   * When true, a 'call' material renders as a button (delegating to onAction)
   * instead of a tel: link — used on the wall, where tel: does nothing and the
   * call is placed via Symphony → kid-phone instead.
   */
  callAsAction?: boolean
}

export function MaterialChip({ material, variant = 'chip', onAction, callAsAction }: MaterialChipProps) {
  const isTile = variant === 'tile'
  const partial = material.availability === 'partial'

  const base = isTile
    ? 'flex items-start gap-3 rounded-xl px-4 py-3 text-left w-full transition-colors'
    : 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left transition-colors'

  const tone = partial
    ? 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
    : 'bg-neutral-100 border border-neutral-200/70 text-neutral-700 hover:bg-neutral-200'

  const className = `${base} ${tone}`
  const iconSize = isTile ? 20 : 15

  const body = (
    <>
      <ConceptIcon name={material.icon} size={iconSize} decorative className={isTile ? 'mt-0.5 shrink-0' : 'shrink-0'} />
      <span className={isTile ? 'min-w-0' : 'inline-flex items-baseline gap-1.5 min-w-0'}>
        <span className={`truncate ${isTile ? 'block text-sm font-medium' : 'text-sm'}`}>{material.label}</span>
        {material.sublabel && (
          <span className={`truncate ${isTile ? 'block text-xs text-neutral-500 mt-0.5' : 'text-xs text-neutral-500'}`}>
            {material.sublabel}
          </span>
        )}
      </span>
    </>
  )

  // Real links for tappable actions (a tel: link works on a phone). On the wall
  // (callAsAction) the call is placed via Symphony instead, so render a button.
  if (material.action.kind === 'call' && material.action.value && !callAsAction) {
    return <a href={`tel:${material.action.value}`} className={className} aria-label={`Call ${material.label}`}>{body}</a>
  }
  if (material.action.kind === 'call' && material.action.value && callAsAction) {
    return (
      <button type="button" onClick={() => onAction?.(material)} className={className} aria-label={`Call ${material.label}`}>
        {body}
      </button>
    )
  }
  if (material.action.kind === 'href' && material.action.value) {
    return (
      <a href={material.action.value} target="_blank" rel="noopener noreferrer" className={className}>
        {body}
      </a>
    )
  }

  // Everything else delegates to the parent (or is inert when action is 'none').
  const inert = material.action.kind === 'none'
  return (
    <button
      type="button"
      onClick={inert ? undefined : () => onAction?.(material)}
      className={`${className}${inert ? ' cursor-default' : ''}`}
      aria-disabled={inert || undefined}
    >
      {body}
    </button>
  )
}
