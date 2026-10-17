import { describe, expect, it } from 'vitest'
import { buildFlow, easternHour, formatWatts, layoutFlow, mixAt, type EnergyDevice, type EnergyReading } from './homeEnergy'

const catalog: EnergyDevice[] = [
  { id: 'ac', name: 'AC', status: 'verified', type: 'AC', first_used: '2019-06-23' },
  { id: 'h4', name: 'Heat 4', status: 'unverified', type: 'MysteryHeat', first_used: '2019-11-26' },
  { id: 'ev', name: 'Electric Vehicle', status: 'ev', type: 'ElectricVehicle', first_used: null },
  { id: 'always_on', name: 'Always On', status: 'always_on', type: 'AlwaysOn', first_used: null },
  { id: 'unknown', name: 'Other', status: 'unattributed', type: 'Unknown', first_used: null },
]
// 2026-10-17 18:30 UTC is 14:30 EDT.
const TS = Date.UTC(2026, 9, 17, 18, 30) / 1000
const mix = {
  '2026-10-17T13:00:00': { Nuclear: 30, Gas: 40, Coal: 20, Wind: 10 },
  '2026-10-17T15:00:00': { Nuclear: 100 },
}

const sumInto = (flow: ReturnType<typeof buildFlow>, id: string) => flow.links.filter((l) => l.to === id).reduce((s, l) => s + l.value, 0)
const sumOut = (flow: ReturnType<typeof buildFlow>, id: string) => flow.links.filter((l) => l.from === id).reduce((s, l) => s + l.value, 0)

describe('easternHour / mixAt', () => {
  it('keys a moment by its Eastern hour', () => {
    expect(easternHour(TS)).toBe('2026-10-17T14:00:00')
  })

  it('uses the latest posted hour at or before the moment, never a later one', () => {
    const m = mixAt(mix, TS, 0.3)
    expect(m.hour).toBe('2026-10-17T13:00:00')
    expect(m.shares.find((s) => s.group === 'gas')!.share).toBeCloseTo(0.4)
    expect(m.shares.find((s) => s.group === 'renewable')!.share).toBeCloseTo(0.1)
    // 0.4 × 410 + 0.2 × 1000 kg/MWh
    expect(m.kg).toBeCloseTo(0.364)
  })

  it('falls back to the regional average with no mix loaded', () => {
    expect(mixAt({}, TS, 0.3)).toEqual({ hour: null, shares: [], kg: 0.3 })
  })
})

describe('buildFlow', () => {
  it('buying: the grid splits by fuel, the house splits by kind of device', () => {
    const r: EnergyReading = { ts: TS, pv: 600, house: 9400, grid: 8800, devices: { 'Electric Vehicle': 7200, AC: 900, 'Heat 4': 300, 'Always On': 150, Other: 400 } }
    const flow = buildFlow(r, catalog, mixAt(mix, TS, 0.3))
    expect(flow.zoomed).toBe(false)
    expect(sumInto(flow, 'grid')).toBeCloseTo(8800)
    expect(sumInto(flow, 'home')).toBeCloseTo(9400)
    expect(sumOut(flow, 'home')).toBeCloseTo(9400)
    expect(flow.nodes.find((n) => n.id === 'fuel-gas')!.value).toBeCloseTo(3520)
    expect(flow.nodes.find((n) => n.id === 'cat-ev')!.value).toBe(7200)
    expect(flow.nodes.find((n) => n.id === 'cat-unverified')!.label).toBe('Unverified devices')
    expect(flow.nodes.find((n) => n.id === 'sent')).toBeUndefined()
  })

  it('sending back: no grid side, and the house zooms when export dwarfs it', () => {
    const r: EnergyReading = { ts: TS, pv: 3000, house: 500, grid: -2500, devices: { 'Always On': 150, Other: 350 } }
    const flow = buildFlow(r, catalog, mixAt(mix, TS, 0.3))
    expect(flow.nodes.some((n) => n.col === 0)).toBe(false)
    expect(flow.nodes.find((n) => n.id === 'sent')!.value).toBe(2500)
    expect(flow.zoomed).toBe(true)
    expect(sumOut(flow, 'home-zoom')).toBeCloseTo(500)
  })

  it('scales devices to the meter and puts any gap under "not yet identified"', () => {
    const over = buildFlow({ ts: TS, pv: 0, house: 1000, grid: 1000, devices: { AC: 1500, 'Heat 4': 500 } }, catalog, mixAt({}, TS, 0.3))
    expect(sumOut(over, 'home')).toBeCloseTo(1000)
    const under = buildFlow({ ts: TS, pv: 0, house: 1000, grid: 1000, devices: { AC: 600 } }, catalog, mixAt({}, TS, 0.3))
    expect(under.nodes.find((n) => n.id === 'cat-unattributed')!.value).toBeCloseTo(400)
  })

  it('folds devices under 3% of the house into one node', () => {
    const r: EnergyReading = { ts: TS, pv: 0, house: 2000, grid: 2000, devices: { AC: 1800, 'Light 1': 20, 'Light 2': 20, Microwave: 160 } }
    const flow = buildFlow(r, catalog, mixAt({}, TS, 0.3))
    // Light 1/2 and Microwave aren't in the catalog: unverified by default.
    expect(flow.nodes.find((n) => n.id === 'small-unverified')!.label).toBe('2 small devices')
    expect(flow.nodes.find((n) => n.id === 'dev-Microwave')).toBeDefined()
  })

  it('never shows a solar row Sense logged as a device', () => {
    const flow = buildFlow({ ts: TS, pv: 3000, house: 500, grid: -2500, devices: { Solar: 3000, Other: 500 } }, catalog, mixAt({}, TS, 0.3))
    expect(flow.nodes.some((n) => n.label === 'Solar')).toBe(false)
  })
})

describe('layoutFlow', () => {
  it('keeps every node in its column, labels apart, and bands within their nodes', () => {
    const r: EnergyReading = { ts: TS, pv: 600, house: 9400, grid: 8800, devices: { 'Electric Vehicle': 7200, AC: 900, 'Heat 4': 300, 'Always On': 150, Other: 400 } }
    const lay = layoutFlow(buildFlow(r, catalog, mixAt(mix, TS, 0.3)), { width: 1200, height: 600, minSlot: 56 })
    for (const col of new Set(lay.nodes.map((n) => n.col))) {
      const ns = lay.nodes.filter((n) => n.col === col).sort((a, b) => a.y - b.y)
      for (let i = 1; i < ns.length; i++) expect(ns[i].y - ns[i - 1].y).toBeGreaterThanOrEqual(56)
    }
    expect(Math.max(...lay.nodes.map((n) => n.x))).toBeLessThanOrEqual(1200 - 220)
    expect(lay.zoom).toBeNull()
    expect(lay.links.every((l) => !l.d.includes('NaN'))).toBe(true)
  })

  it('draws the zoom wedge between the house and its enlarged copy', () => {
    const r: EnergyReading = { ts: TS, pv: 3000, house: 500, grid: -2500, devices: { 'Always On': 150, Other: 350 } }
    const lay = layoutFlow(buildFlow(r, catalog, mixAt(mix, TS, 0.3)), { width: 1200, height: 600 })
    expect(lay.zoom).toMatch(/^M/)
    const zoomed = lay.nodes.find((n) => n.id === 'home-zoom')!
    const home = lay.nodes.find((n) => n.id === 'home')!
    expect(zoomed.h).toBeGreaterThan(home.h * 3)
  })
})

describe('formatWatts', () => {
  it('reads like the meter', () => {
    expect(formatWatts(488)).toBe('488 W')
    expect(formatWatts(2675)).toBe('2.7 kW')
    expect(formatWatts(12400)).toBe('12 kW')
  })
})
