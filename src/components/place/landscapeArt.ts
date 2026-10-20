// The Landscape look's scenery (stage 2): soft rounded hills in the palette's
// colours, drawn as SVG and handed to PlaceScenery in the same shape as a
// painted panorama — the art, the veil that conceals content under the
// skyline, and where that skyline sits — so the scene stands, fades and
// catches the pointer exactly as the painted ones do.
import { paletteById, type PaletteId } from '@/config/landscape'
import type { Panorama } from './panoramas'

/** The art's own size: the painted panoramas' width, a shallow band. */
const W = 1506
const H = 300
/** Where the far hills' crests sit (share of H): the veil's skyline. */
const SKYLINE = 0.42
/** Px above the skyline the veil fades in over (PlaceScenery's VEIL_FADE). */
const FADE = 64

const f = (n: number) => n.toFixed(1)

function hill(base: number, amp: number, wave: number, phase: number, ripple: number): string {
  let d = ''
  for (let x = -10; x <= W + 10; x += 8) {
    const y = H * base - H * amp * Math.sin(x / wave + phase) - H * ripple * Math.sin(x / 53 + phase * 2)
    d += (d ? ' L' : 'M') + x + ' ' + f(y)
  }
  return `${d} L${W + 10} ${H + 10} L-10 ${H + 10} Z`
}

/** SVG markup as a url() / src value: parentheses and quotes escaped so it
 *  survives an unquoted CSS url(). */
function svgUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27')
}

const cache = new Map<PaletteId, Panorama>()

export function landscapeArt(id: PaletteId): Panorama {
  const hit = cache.get(id)
  if (hit) return hit
  const p = paletteById(id)
  const [far, mid, near] = p.hills
  const fx = W * 0.76
  const fy = H * (0.72 - 0.05 * Math.sin(fx / 110 + 4.1) - 0.012 * Math.sin(fx / 53 + 8.2))
  const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`
    + `<path d="${hill(SKYLINE + 0.12, 0.09, 160, 0.8, 0.02)}" fill="${far}"/>`
    + `<path d="${hill(0.62, 0.07, 130, 2.3, 0.014)}" fill="${mid}"/>`
    + `<path d="${hill(0.72, 0.05, 110, 4.1, 0.012)}" fill="${near}"/>`
    + `<path d="M${f(fx - 3)} ${f(fy)} h6 v-11 a3 3 0 0 0 -6 0 Z M${f(fx + 4)} ${f(fy - 15)} a4 4 0 1 0 -8 0 a4 4 0 1 0 8 0 Z" fill="${p.figure}"/>`
    + `</svg>`
  const top = H * SKYLINE
  const veil = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">`
    + `<defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="1"/></linearGradient></defs>`
    + `<rect x="0" y="${f(top - FADE)}" width="${W}" height="${FADE}" fill="url(#v)"/>`
    + `<rect x="0" y="${f(top)}" width="${W}" height="${f(H - top)}" fill="#000"/>`
    + `</svg>`
  const out: Panorama = { src: svgUrl(art), veil: svgUrl(veil), skyline: SKYLINE }
  cache.set(id, out)
  return out
}
