// Home energy on the kitchen wall: what the house's bridge reports (Sense
// readings, the PJM grid's fuel mix, Sense's device list) turned into a flow
// — the grid's fuels and the roof's solar, into the house, out to each
// device and back to the grid — and that flow laid out as a Sankey.
//
// The bridge is the home-energy project's bridge.py, running on the wall Pi
// itself (127.0.0.1:7070): the wall is an https page, so loopback is the only
// address it may reach (CSP connect-src + Chromium's local-network policy).
//
// PURE: no React, no fetch, no clock reads.

export const HOME_ENERGY_URL = 'http://127.0.0.1:7070'

export type DeviceStatus = 'verified' | 'unverified' | 'ev' | 'always_on' | 'unattributed'

export interface EnergyReading {
  /** Unix seconds. */
  ts: number
  /** Watts. */
  pv: number
  house: number
  /** Positive while buying from the grid. */
  grid: number
  /** Devices drawing power, by Sense's name, in watts. */
  devices: Record<string, number>
}

export interface EnergyDevice {
  id: string
  name: string
  status: DeviceStatus
  type: string | null
  first_used: string | null
}

export interface EnergyLive {
  site: { rate_cents: number; sell_back_cents: number; co2_kg_per_kwh: number; tz: string }
  now: EnergyReading | Record<string, never>
  /** [buy, sell back] cents per kWh right now. */
  price_now: [number, number]
  catalog: EnergyDevice[]
  /** PJM generation by fuel, MW, keyed by Eastern hour start 'YYYY-MM-DDTHH:00:00'. */
  mix: Record<string, Record<string, number>>
}

/** A period's totals from the bridge's /api/flow, in kWh; purchases are split
 *  by each hour's PJM mix and netted per hour against the solar. */
export interface EnergyPeriod {
  /** First and last hour with data (ISO, Eastern), or null with no history. */
  first: string | null
  last: string | null
  usage: number
  solar: number
  bought: number
  sent: number
  /** Net: purchases minus solar credit. Negative is a credit. */
  cents: number
  co2_kg: number
  /** kWh bought, by PJM fuel ('Unknown' for hours without a posted mix). */
  fuels: Record<string, number>
  /** kWh by Sense device name. */
  devices: Record<string, number>
}

export const hasReading = (now: EnergyLive['now']): now is EnergyReading => typeof (now as EnergyReading).ts === 'number'

// ─── The grid's mix ───

export type FuelGroup = 'nuclear' | 'gas' | 'coal' | 'renewable' | 'other'

const FUEL_GROUPS: { group: FuelGroup; label: string; fuels: string[] }[] = [
  { group: 'nuclear', label: 'Nuclear', fuels: ['Nuclear'] },
  { group: 'gas', label: 'Gas', fuels: ['Gas'] },
  { group: 'coal', label: 'Coal', fuels: ['Coal'] },
  { group: 'renewable', label: 'Wind, sun & water', fuels: ['Wind', 'Solar', 'Hydro', 'Other Renewables'] },
  { group: 'other', label: 'Oil & other', fuels: ['Oil', 'Multiple Fuels', 'Storage'] },
]
/** kg CO2 per MWh by PJM fuel; the bridge's grid.py uses the same numbers. */
const FUEL_KG_PER_MWH: Record<string, number> = { Coal: 1000, Gas: 410, Oil: 780, 'Multiple Fuels': 600 }

/** The Eastern wall-clock hour a moment falls in, as PJM keys its hours. */
export function easternHour(ts: number): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ts * 1000)).map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00:00`
}

/** A period's purchases as fuel-group shares (an "unknown" hour counts as other). */
export function periodShares(p: EnergyPeriod): MixAt['shares'] {
  if (p.bought <= 0) return []
  return FUEL_GROUPS.map(({ group, label, fuels }) => ({
    group, label,
    share: (fuels.reduce((s, f) => s + (p.fuels[f] ?? 0), 0) + (group === 'other' ? p.fuels.Unknown ?? 0 : 0)) / p.bought,
  }))
}

export interface MixAt {
  /** The PJM hour used (posted about an hour late), or null when none is loaded. */
  hour: string | null
  shares: { group: FuelGroup; label: string; share: number }[]
  /** kg CO2 per kWh bought. */
  kg: number
}

/** The grid's mix at a moment: the latest posted hour at or before it. */
export function mixAt(mix: EnergyLive['mix'], ts: number, fallbackKg: number): MixAt {
  const want = easternHour(ts)
  const hour = Object.keys(mix).filter((h) => h <= want).sort().pop() ?? null
  if (!hour) return { hour: null, shares: [], kg: fallbackKg }
  const m = mix[hour]
  const total = Object.values(m).reduce((s, mw) => s + Math.max(0, mw), 0)
  if (!total) return { hour, shares: [], kg: fallbackKg }
  const kg = Object.entries(m).reduce((s, [f, mw]) => s + Math.max(0, mw) * (FUEL_KG_PER_MWH[f] ?? 0), 0) / total / 1000
  const shares = FUEL_GROUPS.map(({ group, label, fuels }) => ({ group, label, share: fuels.reduce((s, f) => s + Math.max(0, m[f] ?? 0), 0) / total }))
  return { hour, shares, kg }
}

// ─── The flow ───

/** Colour roles; the stage maps them to the wall's tokens. */
export type FlowTone = FuelGroup | 'grid' | 'solar' | 'home' | DeviceStatus

export interface FlowNode {
  id: string
  /** 0 grid mix · 1 source · 2 house · 3 inside the house (zoomed) · 4 category · 5 device */
  col: number
  label: string
  tone: FlowTone
  /** Watts for a reading, kWh for a period. */
  value: number
}
export interface FlowLink { from: string; to: string; value: number; tone: FlowTone }
export interface Flow { nodes: FlowNode[]; links: FlowLink[]; zoomed: boolean }

const STATUS_LABEL: Record<DeviceStatus, string> = {
  ev: 'Electric vehicle',
  verified: 'Verified devices',
  unverified: 'Unverified devices',
  always_on: 'Always on',
  unattributed: 'Not yet identified',
}
const STATUS_ORDER: DeviceStatus[] = ['ev', 'verified', 'unverified', 'always_on', 'unattributed']
/** Devices under this share of the house fold into "N small devices". */
const SMALL_SHARE = 0.03

function statusOf(name: string, catalog: EnergyDevice[]): DeviceStatus {
  const known = catalog.find((d) => d.name === name)
  if (known) return known.status
  if (name === 'Always On') return 'always_on'
  if (name === 'Other') return 'unattributed'
  return 'unverified'
}

/** One live reading as a flow, in watts. */
export function buildFlow(r: EnergyReading, catalog: EnergyDevice[], mix: MixAt): Flow {
  const pv = Math.max(0, r.pv)
  const house = Math.max(0, r.house)
  return flowOf({ pv, house, bought: Math.max(0, house - pv), sent: Math.max(0, pv - house), devices: r.devices }, catalog, mix.shares, 1)
}

/** A period's totals as a flow, in kWh. Over hours the house both buys and
 *  sends back, so both sides can show at once. */
export function buildPeriodFlow(p: EnergyPeriod, catalog: EnergyDevice[]): Flow {
  return flowOf({ pv: p.solar, house: p.usage, bought: p.bought, sent: p.sent, devices: p.devices }, catalog, periodShares(p), 0.05)
}

interface FlowTotals { pv: number; house: number; bought: number; sent: number; devices: Record<string, number> }

/** The grid's fuels and the roof, through the house, to each device and
 *  back out. The house zooms (its own scale) when the solar going back would
 *  otherwise squash it to a sliver. `eps` is the smallest band worth drawing. */
function flowOf({ pv, house, bought, sent, devices: byDevice }: FlowTotals, catalog: EnergyDevice[], shares: MixAt['shares'], eps: number): Flow {
  const nodes: FlowNode[] = []
  const links: FlowLink[] = []
  const node = (n: FlowNode) => { nodes.push(n); return n.id }
  const link = (from: string, to: string, value: number, tone: FlowTone) => { if (value >= eps) links.push({ from, to, value, tone }) }
  const zoomed = sent > house * 0.5

  const home = node({ id: 'home', col: 2, label: 'Home', tone: 'home', value: house })
  if (bought >= eps) {
    const grid = node({ id: 'grid', col: 1, label: 'Grid', tone: 'grid', value: bought })
    for (const f of shares) {
      const w = f.share * bought
      if (w >= eps) link(node({ id: `fuel-${f.group}`, col: 0, label: f.label, tone: f.group, value: w }), grid, w, f.group)
    }
    link(grid, home, bought, 'grid')
  }
  if (pv >= eps) {
    const solar = node({ id: 'solar', col: 1, label: 'Your solar', tone: 'solar', value: pv })
    link(solar, home, pv - sent, 'solar')
    if (sent >= eps) link(solar, node({ id: 'sent', col: 2, label: 'Back to the grid', tone: 'solar', value: sent }), sent, 'solar')
  }
  const inside = zoomed ? node({ id: 'home-zoom', col: 3, label: 'Home', tone: 'home', value: house }) : home

  // Sense's devices, scaled to the metered total; any gap is "not yet identified".
  const devices = Object.entries(byDevice).filter(([name, w]) => w > 0 && name !== 'Solar')
  const sum = devices.reduce((s, [, w]) => s + w, 0)
  const k = sum > house && sum > 0 ? house / sum : 1
  const groups = new Map<DeviceStatus, [string, number][]>()
  const add = (st: DeviceStatus, name: string, w: number) => groups.set(st, [...(groups.get(st) ?? []), [name, w]])
  for (const [name, w] of devices) add(statusOf(name, catalog), name, w * k)
  if (house - sum * k >= eps) add('unattributed', 'Other', house - sum * k)

  for (const st of STATUS_ORDER) {
    const list = (groups.get(st) ?? []).sort((a, b) => b[1] - a[1])
    const total = list.reduce((s, [, w]) => s + w, 0)
    if (total < eps) continue
    const cat = node({ id: `cat-${st}`, col: 4, label: STATUS_LABEL[st], tone: st, value: total })
    link(inside, cat, total, st)
    if (st !== 'verified' && st !== 'unverified') continue
    const big = list.filter(([, w]) => w >= house * SMALL_SHARE)
    const small = list.filter(([, w]) => w < house * SMALL_SHARE)
    for (const [name, w] of big) link(cat, node({ id: `dev-${name}`, col: 5, label: name, tone: st, value: w }), w, st)
    const sw = small.reduce((s, [, w]) => s + w, 0)
    if (sw >= eps) {
      const label = small.length === 1 ? small[0][0] : `${small.length} small devices`
      link(cat, node({ id: `small-${st}`, col: 5, label, tone: st, value: sw }), sw, st)
    }
  }
  return { nodes, links, zoomed }
}

// ─── The layout ───

export interface PlacedNode extends FlowNode { x: number; y: number; h: number }
export interface PlacedLink extends FlowLink { d: string }
export interface FlowLayout { nodes: PlacedNode[]; links: PlacedLink[]; heads: { col: number; x: number }[]; zoom: string | null; height: number }

export interface LayoutOptions {
  width: number
  height: number
  nodeWidth?: number
  /** Room right of the last column for its labels. */
  labelRoom?: number
  gap?: number
  /** A node's band never packs tighter than its two-line label. */
  minSlot?: number
  top?: number
}

/** Columns spread across the width; each side (supply 0–2, inside the house
 *  3–5) gets its own scale when the house is zoomed. Bands leave and arrive
 *  in node order so they don't cross needlessly. */
export function layoutFlow(flow: Flow, o: LayoutOptions): FlowLayout {
  const nodeW = o.nodeWidth ?? 14
  const labelRoom = o.labelRoom ?? 220
  const gap = o.gap ?? 16
  const minSlot = o.minSlot ?? 56
  const top = o.top ?? 40
  const cols = [...new Set(flow.nodes.map((n) => n.col))].sort((a, b) => a - b)
  const x = new Map(cols.map((c, i) => [c, i * (o.width - labelRoom - nodeW) / Math.max(1, cols.length - 1)]))
  const inCol = (c: number) => flow.nodes.filter((n) => n.col === c)
  const sides = flow.zoomed ? [cols.filter((c) => c <= 2), cols.filter((c) => c >= 3)] : [cols]

  const placed = new Map<string, PlacedNode & { scale: number; out: number; in: number }>()
  let height = o.height
  for (const side of sides) {
    if (!side.length) continue
    const total = Math.max(...side.map((c) => inCol(c).reduce((s, n) => s + n.value, 0))) || 1
    const count = Math.max(...side.map((c) => inCol(c).length))
    // Thin nodes still take a label's height; shrink the scale until the
    // tallest column fits (a few passes settle it), so nothing spills.
    let room = Math.max(0, o.height - top - gap * (count - 1))
    let sideHeight = 0
    for (let pass = 0; pass < 4; pass++) {
      const scale = room / total
      let tallest = 0
      for (const c of side) {
        let y = top
        for (const n of inCol(c)) {
          const h = Math.max(3, n.value * scale)
          placed.set(n.id, { ...n, x: x.get(c)!, y, h, scale, out: y, in: y })
          y += Math.max(h, minSlot) + gap
        }
        tallest = Math.max(tallest, y - gap)
      }
      sideHeight = tallest
      const over = tallest - o.height
      if (over <= 0.5 || room <= 0) break
      room = Math.max(0, room - over)
    }
    height = Math.max(height, sideHeight)
  }

  const order = new Map(flow.nodes.map((n, i) => [n.id, i]))
  const links = [...flow.links].sort((a, b) => order.get(a.from)! - order.get(b.from)! || order.get(a.to)! - order.get(b.to)!)
  const placedLinks: PlacedLink[] = links.map((l) => {
    const a = placed.get(l.from)!
    const b = placed.get(l.to)!
    const h = l.value * b.scale
    const x0 = a.x + nodeW, x1 = b.x, y0 = a.out, y1 = b.in, mx = (x0 + x1) / 2
    a.out += h
    b.in += h
    const d = `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}L${x1},${y1 + h}C${mx},${y1 + h} ${mx},${y0 + h} ${x0},${y0 + h}Z`
    return { ...l, d }
  })

  const home = placed.get('home'), zoomNode = placed.get('home-zoom')
  const zoom = home && zoomNode
    ? `M${home.x + nodeW},${home.y}L${zoomNode.x},${zoomNode.y}L${zoomNode.x},${zoomNode.y + zoomNode.h}L${home.x + nodeW},${home.y + home.h}Z`
    : null
  return {
    nodes: flow.nodes.map((n) => { const p = placed.get(n.id)!; return { ...n, x: p.x, y: p.y, h: p.h } }),
    links: placedLinks,
    heads: cols.map((c) => ({ col: c, x: x.get(c)! })),
    zoom,
    height,
  }
}

// ─── Words ───

export const formatKwh = (k: number) =>
  `${k >= 100 ? Math.round(k).toLocaleString('en-US') : k >= 10 ? k.toFixed(0) : k.toFixed(1)} kWh`

export const formatWatts = (w: number) =>
  Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(Math.abs(w) >= 10000 ? 0 : 1)} kW` : `${Math.round(w)} W`
