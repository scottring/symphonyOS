/**
 * The single source of truth for a page's content column — gutter, max-width,
 * and vertical rhythm. Every rhythm/library surface uses this (via the
 * <PageContainer> component, or applied directly on pages whose structure makes
 * wrapping awkward) so the app stops shipping five max-widths and six paddings.
 *
 * The column STARTS in the same place on every page (Scott, 2026-09-07: "the
 * today card should appear at the exact same coordinates — at least on the
 * left/starting margin — for all pages").
 *
 * It was CENTERED between 2026-09-01 and then, for a real reason: a
 * left-hugging page beside a centered one reads as a different app. But
 * centering only unifies pages that share a width, and these three do not — so
 * every page put its masthead card at a different x, and the wider the screen
 * the further apart they drifted. Measured on prod at a 1715px viewport, all
 * on the same day: /week 280, /today 312, /month 460, /inbox 466, /lists 566,
 * /notes 626. Left-aligning makes the left edge a constant of the app rather
 * than a function of each page's max-width; a narrower page now simply ENDS
 * sooner, which is the difference a reader can actually follow.
 *
 * CENTRED again 2026-10-02 (Scott): the top bar became a header whose ends
 * overhang the page, and "the content in the main viewport needs to be
 * centered below the content of the header". The drift above no longer
 * applies — every page is now the one 880px column or a full-width split or
 * canvas, all inside the same 1152px frame — so a centred column sits at the
 * same x on every reading page. Splits and canvases fill the frame.
 */
/** The horizontal half on its own — for pages that own their vertical rhythm
 *  (the week grid's header + grid) but must share the app's left edge. */
export const PAGE_GUTTER_X = 'px-4 md:px-10 lg:px-14'

const PAGE_GUTTER = `${PAGE_GUTTER_X} pt-3 pb-8 md:py-8`

/** THE column (layout system, 2026-10-01): every page, 880px of content at
 *  desktop width (992 = 880 + the 56px gutter either side). One width is what
 *  makes pages read as one app, and it keeps a row's people and actions within
 *  reach of its title instead of across an empty middle (Scott: "less white
 *  space in the center"). See docs/design-system/LAYOUT-SYSTEM.md. */
export const PAGE_COLUMN = `w-full max-w-[992px] mx-auto ${PAGE_GUTTER}`

/** Kept as a name so old call sites read sensibly; it IS the one column now.
 *  A page that needs more room is a canvas (PAGE_COLUMN_FULL) or a two-pane
 *  split (PAGE_COLUMN_SPLIT), never a slightly wider column. */
export const PAGE_COLUMN_WIDE = PAGE_COLUMN

/** Two panes side by side — Today with its week column beside the day. */
export const PAGE_COLUMN_SPLIT = `w-full max-w-[1152px] mx-auto ${PAGE_GUTTER}`

/** Full-bleed CANVAS — a grid you work on rather than read (Week's hourly
 *  grid, the people river). No max-width: fills the available width (minus
 *  gutter and any open pane). */
export const PAGE_COLUMN_FULL = `w-full ${PAGE_GUTTER}`
