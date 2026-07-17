/**
 * The single source of truth for a page's content column — gutter, max-width,
 * and vertical rhythm. Every rhythm/library surface uses this (via the
 * <PageContainer> component, or applied directly on pages whose structure makes
 * wrapping awkward) so the app stops shipping five max-widths and six paddings.
 *
 * The column is LEFT-ALIGNED (no mx-auto): the gutter is identical on every page
 * and stays put when the right detail/AI pane opens. ShellLayout already reserves
 * the pane's width via marginRight, so a left-aligned column only reflows its
 * right edge — no horizontal jump. Tune the gutter/width in ONE place here.
 */
const PAGE_GUTTER = 'px-6 md:px-10 lg:px-14 py-8'

/** Default column — rhythm views + library lists. */
export const PAGE_COLUMN = `w-full max-w-[940px] ${PAGE_GUTTER}`

/** Wide column — detail pages that need more room (e.g. project detail). */
export const PAGE_COLUMN_WIDE = `w-full max-w-[1152px] ${PAGE_GUTTER}`
