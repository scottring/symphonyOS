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
 */
/** The horizontal half on its own — for pages that own their vertical rhythm
 *  (the week grid's header + grid) but must share the app's left edge. */
export const PAGE_GUTTER_X = 'px-6 md:px-10 lg:px-14'

const PAGE_GUTTER = `${PAGE_GUTTER_X} py-8`

/** Default column — rhythm views + library lists. */
export const PAGE_COLUMN = `w-full max-w-[940px] mr-auto ${PAGE_GUTTER}`

/** Wide column — detail pages that need more room (e.g. project detail). */
export const PAGE_COLUMN_WIDE = `w-full max-w-[1152px] mr-auto ${PAGE_GUTTER}`

/** Full-bleed column — hands-on WORK pages (e.g. /season) where a narrow column
 *  cramps a two-pane grid and wastes the right half of a wide screen. No
 *  max-width: fills the available width (minus gutter and any open pane). */
export const PAGE_COLUMN_FULL = `w-full ${PAGE_GUTTER}`
