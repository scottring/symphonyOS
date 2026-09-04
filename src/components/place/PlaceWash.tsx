import { PlaceMedallion } from './PlaceMedallion'

/**
 * The active Place (Settings → the five illustrated worlds), worn by a surface:
 * a soft wash in that place's hues plus its own medallion bleeding off an edge.
 *
 * Purely decorative — aria-hidden, pointer-events-none, and it never touches the
 * neutral text palette, so contrast is unchanged whichever place is chosen.
 *
 * Drop it as the FIRST child of a `relative` surface, and wrap that surface's
 * real content in a `relative` sibling AFTER it. Both stay at the default
 * z-index, which is the whole trick: two positioned siblings paint in DOM
 * order, so the content covers the wash without either one creating a
 * stacking context.
 *
 * That matters more than it sounds. The first attempt put the wash at -z-10
 * and `isolate` on the surface — which worked visually and then trapped every
 * dropdown opened from inside the Today card, because `isolate` confines a
 * child's z-50 to the card and the task list below simply painted over the
 * open menu. It reads exactly like a translucent panel, and isn't.
 *
 * It also clips ITSELF and inherits the surface's corner radius, so the
 * surface must not set `overflow-hidden` either — that clipped the bottom off
 * the same menus.
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
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
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
