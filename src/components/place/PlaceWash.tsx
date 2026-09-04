import { PlaceMedallion } from './PlaceMedallion'

/**
 * The active Place (Settings → the five illustrated worlds), worn by a surface:
 * a soft wash in that place's hues plus its own medallion bleeding off an edge.
 *
 * Purely decorative — aria-hidden, pointer-events-none, and it never touches the
 * neutral text palette, so contrast is unchanged whichever place is chosen.
 *
 * Drop it as the FIRST child of a `relative isolate` surface. It clips ITSELF
 * (and inherits the surface's corner radius), so the surface must NOT set
 * `overflow-hidden` — doing so also clips any dropdown opened from inside it,
 * which is how the Today card started cutting the bottom off its own pool
 * menus.
 * `isolate` is load-bearing: the wash sits at -z-10 so no content child needs a
 * z-index, but a negative-z child only paints above its parent's background if
 * that parent is a stacking context. Without `isolate` the wash paints beneath
 * the surface's own opaque background and is invisible.
 */
export function PlaceWash({
  anchor = 'right',
  opacity = 0.22,
  tint = 'soft',
}: {
  /** 'right' for wide surfaces (the day card); 'top' for tall narrow panes,
   *  where a centred medallion would sit behind the reading column. */
  anchor?: 'right' | 'top'
  opacity?: number
  /** How much of the place's colour the surface carries. 'soft' for surfaces
   *  sitting on the warm paper ground, where a little goes a long way;
   *  'strong' for a pane on flat white, which otherwise reads as untouched. */
  tint?: 'soft' | 'strong'
}) {
  const position =
    anchor === 'right'
      ? '-right-12 top-1/2 h-[320px] w-[320px] -translate-y-1/2'
      : '-right-16 -top-20 h-[300px] w-[300px]'
  const fade =
    anchor === 'right'
      ? 'linear-gradient(to left, black 40%, transparent 95%)'
      : 'linear-gradient(to bottom, black 25%, transparent 90%)'

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${
          tint === 'strong'
            ? 'from-primary-100/80 via-primary-50/45 to-accent-100/55'
            : 'from-primary-50/70 via-transparent to-accent-50/40'
        }`}
      />
      <div
        className={`absolute hidden sm:block ${position}`}
        style={{ opacity, maskImage: fade, WebkitMaskImage: fade }}
      >
        <PlaceMedallion className="h-full w-full" />
      </div>
    </div>
  )
}
