// Where the next page of a paged box starts (KioskPaged, 2026-11-10).

const SLACK = 6

/** Where the next page starts: the first element that begins inside the
 *  view and runs past its foot (a row cut in half), else a full page on.
 */
export function nextPageTop(box: HTMLElement): number {
  const top = box.scrollTop
  const bottom = top + box.clientHeight
  const origin = box.getBoundingClientRect().top - top
  let cut = bottom
  for (const el of Array.from(box.querySelectorAll<HTMLElement>('*'))) {
    const r = el.getBoundingClientRect()
    // A whole section taller than most of a page is a container, not a row.
    if (r.height === 0 || r.height > box.clientHeight * 0.6) continue
    const t = r.top - origin
    if (t > top + 1 && t < bottom && r.bottom - origin > bottom + 1) cut = Math.min(cut, t)
  }
  return cut <= top + SLACK ? bottom : cut
}

