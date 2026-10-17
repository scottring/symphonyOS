// The house's power on the kitchen wall (Scott, 2026-10-17): where it comes
// from right now — the PJM grid's fuels and the roof's solar — into the
// house, out to each device Sense knows (verified, or a "mystery" it hasn't
// named yet), the car, and the solar going back to the grid. The lead column
// is the flow; the side column is the numbers a person in the kitchen asks
// about: how much, what it costs, how clean.
//
// Now · Today · 7 days · 30 days: the same flow over a period, in kWh, with
// what it cost and the CO2 bought (Scott, 2026-10-17).
//
// Presentation only: useHomeEnergy (the Shell's) polls the bridge; a period
// arrives through loadPeriod.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildFlow, buildPeriodFlow, formatKwh, formatWatts, hasReading, layoutFlow, mixAt, periodShares,
  type EnergyLive, type EnergyPeriod, type Flow, type FlowLayout,
} from '@/lib/wall/energy/homeEnergy'

/** One design pixel, as kiosk-v1.css computes --p. */
const designPx = () => Math.min(window.innerWidth / 1920, window.innerHeight / 1080) || 1

const COL_HEAD: Record<number, string> = { 0: 'The grid', 1: 'From', 2: 'House', 3: 'Inside', 4: 'Kind', 5: 'Device' }
const NODE_W = 14

function useDesignSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const p = designPx()
      setSize({ w: el.clientWidth / p, h: el.clientHeight / p })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

function FlowChart({ layout, width, unit }: { layout: FlowLayout; width: number; unit: (v: number) => string }) {
  return (
    <svg className="ke-flow" viewBox={`0 0 ${width} ${layout.height}`} role="img" aria-label="Where the house's power comes from and goes">
      {layout.heads.map((h) => <text key={h.col} className="ke-head" x={h.x} y={22}>{COL_HEAD[h.col]}</text>)}
      {layout.zoom && <path className="ke-zoom" d={layout.zoom} />}
      {layout.links.map((l) => <path key={`${l.from}>${l.to}`} className={`ke-band ke-${l.tone}`} d={l.d} />)}
      {layout.nodes.map((n) => (
        <g key={n.id}>
          <rect className={`ke-node ke-${n.tone}`} x={n.x} y={n.y} width={NODE_W} height={n.h} rx={3} />
          {/* The small house beside its zoomed copy carries no label; the copy does. */}
          {!(n.id === 'home' && layout.zoom) && (
            <>
              <text className="ke-label" x={n.x + NODE_W + 10} y={n.y + n.h / 2 - 2}>{n.label}</text>
              <text className="ke-value" x={n.x + NODE_W + 10} y={n.y + n.h / 2 + 24}>{unit(n.value)}</text>
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

const PERIODS = [
  { days: 0, label: 'Now' },
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
] as const
const PERIOD_LAB: Record<number, string> = { 1: 'Today', 7: 'The last 7 days', 30: 'The last 30 days' }
const PERIOD_REFRESH_MS = 5 * 60_000

const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const dollars = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}`
const topShares = (shares: { label: string; share: number }[]) =>
  [...shares].sort((a, b) => b.share - a.share).filter((f) => f.share >= 0.05).slice(0, 3)
    .map((f) => `${Math.round(f.share * 100)}% ${f.label.toLowerCase()}`).join(' · ')

/** A period's totals, reloaded every few minutes while it's on screen. */
function usePeriod(days: number, load?: (days: number) => Promise<EnergyPeriod>) {
  const [got, setGot] = useState<{ days: number; data: EnergyPeriod | null } | null>(null)
  useEffect(() => {
    if (!days || !load) return
    let stopped = false
    const get = () => load(days).then(
      (data) => { if (!stopped) setGot({ days, data }) },
      () => { if (!stopped) setGot({ days, data: null }) },
    )
    void get()
    const timer = setInterval(get, PERIOD_REFRESH_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [days, load])
  return got?.days === days ? got : null
}

export function EnergyStage({ live, now, loadPeriod }: { live: EnergyLive | null; now: Date; loadPeriod?: (days: number) => Promise<EnergyPeriod> }) {
  const [leadRef, size] = useDesignSize<HTMLDivElement>()
  const [days, setDays] = useState(0)
  const period = usePeriod(days, loadPeriod)
  const reading = live && hasReading(live.now) ? live.now : null
  const mix = useMemo(
    () => (live && reading ? mixAt(live.mix, reading.ts, live.site.co2_kg_per_kwh) : null),
    [live, reading],
  )
  const flow: Flow | null = useMemo(() => {
    if (!live) return null
    if (days) return period?.data?.first ? buildPeriodFlow(period.data, live.catalog) : null
    return reading && mix ? buildFlow(reading, live.catalog, mix) : null
  }, [live, days, period, reading, mix])
  const layout = useMemo(
    () => (flow && size ? layoutFlow(flow, { width: size.w, height: size.h - 8, nodeWidth: NODE_W, labelRoom: 210, minSlot: 62, gap: 18, top: 44 }) : null),
    [flow, size],
  )

  if (!live || !reading || !mix) {
    return <div className="ke-empty">The house’s power shows here on the kitchen wall.</div>
  }

  const periods = loadPeriod ? (
    <div className="ke-periods" role="group" aria-label="When">
      {PERIODS.map((p) => (
        <button key={p.days} type="button" aria-pressed={days === p.days} onClick={() => setDays(p.days)}>{p.label}</button>
      ))}
    </div>
  ) : null

  let side
  if (days) {
    const d = period?.data
    side = !period ? <p className="ke-line ke-quiet">Adding it up…</p>
      : !d || !d.first ? <p className="ke-line ke-quiet">{d ? 'No history for this yet.' : 'Couldn’t reach the house’s energy history.'}</p>
      : (
        <>
          <dl className="ke-nums">
            <div><dt>Solar made</dt><dd>{formatKwh(d.solar)}</dd></div>
            <div><dt>The house used</dt><dd>{formatKwh(d.usage)}</dd></div>
          </dl>
          <p className="ke-line">Bought <b>{formatKwh(d.bought)}</b> · sent back <b>{formatKwh(d.sent)}</b></p>
          <p className="ke-line">{d.cents >= 0 ? 'Net cost' : 'Net credit'} <b>{dollars(d.cents)}</b></p>
          <p className="ke-line">CO₂ <b>{d.co2_kg >= 10 ? Math.round(d.co2_kg) : d.co2_kg.toFixed(1)} kg</b> from the grid</p>
          {d.bought > 0 && (
            <p className="ke-grid">The grid averaged {Math.round((d.co2_kg / d.bought) * 1000)} g CO₂ per kWh · {topShares(periodShares(d))}</p>
          )}
          <p className="ke-foot">{d.first.slice(0, 10) === d.last!.slice(0, 10) ? dayLabel(d.first) : `${dayLabel(d.first)} – ${dayLabel(d.last!)}`} · Sense and PJM</p>
        </>
      )
  } else {
    const bought = Math.max(0, reading.house - reading.pv)
    const sent = Math.max(0, reading.pv - reading.house)
    const [buy, sell] = live.price_now
    const centsHour = bought ? (bought / 1000) * buy : (sent / 1000) * sell
    const co2Hour = bought * mix.kg // g per hour
    const ageMin = Math.round((now.getTime() / 1000 - reading.ts) / 60)
    side = (
      <>
        <dl className="ke-nums">
          <div><dt>Solar</dt><dd>{formatWatts(reading.pv)}</dd></div>
          <div><dt>The house is using</dt><dd>{formatWatts(reading.house)}</dd></div>
          <div className={bought ? 'is-buy' : 'is-send'}>
            <dt>{bought ? 'Buying from the grid' : 'Sending back to the grid'}</dt>
            <dd>{formatWatts(bought || sent)}</dd>
          </div>
        </dl>
        <p className="ke-line">
          {bought ? 'Costing' : 'Earning'} <b>{centsHour < 10 ? centsHour.toFixed(1) : Math.round(centsHour)}¢ an hour</b>
        </p>
        <p className="ke-line">
          {bought
            ? <>CO₂ <b>{co2Hour >= 1000 ? `${(co2Hour / 1000).toFixed(1)} kg` : `${Math.round(co2Hour)} g`} an hour</b></>
            : <>No CO₂: <b>the sun covers the house</b></>}
        </p>
        {mix.hour && <p className="ke-grid">The grid: {Math.round(mix.kg * 1000)} g CO₂ per kWh · {topShares(mix.shares)}</p>}
        <p className="ke-foot">{ageMin <= 1 ? 'Updated just now' : `Updated ${ageMin} minutes ago`} · Sense and PJM</p>
      </>
    )
  }

  return (
    <div className="ke-stage">
      <div className="ke-lead" ref={leadRef}>
        {layout && size && <FlowChart layout={layout} width={size.w} unit={days ? formatKwh : formatWatts} />}
      </div>
      <div className="ke-rule" aria-hidden="true" />
      <div className="ke-side">
        {periods}
        <p className="ke-lab">{days ? PERIOD_LAB[days] : 'Right now'}</p>
        {side}
      </div>
    </div>
  )
}
