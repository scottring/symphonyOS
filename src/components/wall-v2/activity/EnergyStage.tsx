// The house's power on the kitchen wall (Scott, 2026-10-17): where it comes
// from right now — the PJM grid's fuels and the roof's solar — into the
// house, out to each device Sense knows (verified, or a "mystery" it hasn't
// named yet), the car, and the solar going back to the grid. The lead column
// is the flow; the side column is the numbers a person in the kitchen asks
// about: how much, what it costs, how clean.
//
// Presentation only: useHomeEnergy (the canvas's) polls the bridge.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildFlow, formatWatts, hasReading, layoutFlow, mixAt,
  type EnergyLive, type FlowLayout,
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

function FlowChart({ layout, width }: { layout: FlowLayout; width: number }) {
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
              <text className="ke-value" x={n.x + NODE_W + 10} y={n.y + n.h / 2 + 24}>{formatWatts(n.value)}</text>
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

export function EnergyStage({ live, now }: { live: EnergyLive | null; now: Date }) {
  const [leadRef, size] = useDesignSize<HTMLDivElement>()
  const reading = live && hasReading(live.now) ? live.now : null
  const mix = useMemo(
    () => (live && reading ? mixAt(live.mix, reading.ts, live.site.co2_kg_per_kwh) : null),
    [live, reading],
  )
  const layout = useMemo(() => {
    if (!live || !reading || !mix || !size) return null
    return layoutFlow(buildFlow(reading, live.catalog, mix), { width: size.w, height: size.h - 8, nodeWidth: NODE_W, labelRoom: 210, minSlot: 62, gap: 18, top: 44 })
  }, [live, reading, mix, size])

  if (!live || !reading || !mix) {
    return <div className="ke-empty">The house’s power shows here on the kitchen wall.</div>
  }

  const bought = Math.max(0, reading.house - reading.pv)
  const sent = Math.max(0, reading.pv - reading.house)
  const [buy, sell] = live.price_now
  const centsHour = bought ? (bought / 1000) * buy : (sent / 1000) * sell
  const co2Hour = bought * mix.kg // g per hour
  const ageMin = Math.round((now.getTime() / 1000 - reading.ts) / 60)
  const topFuels = [...mix.shares].sort((a, b) => b.share - a.share).filter((f) => f.share >= 0.05).slice(0, 3)

  return (
    <div className="ke-stage">
      <div className="ke-lead" ref={leadRef}>
        {layout && size && <FlowChart layout={layout} width={size.w} />}
      </div>
      <div className="ke-rule" aria-hidden="true" />
      <div className="ke-side">
        <p className="ke-lab">Right now</p>
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
        {mix.hour && (
          <p className="ke-grid">
            The grid: {Math.round(mix.kg * 1000)} g CO₂ per kWh · {topFuels.map((f) => `${Math.round(f.share * 100)}% ${f.label.toLowerCase()}`).join(' · ')}
          </p>
        )}
        <p className="ke-foot">{ageMin <= 1 ? 'Updated just now' : `Updated ${ageMin} minutes ago`} · Sense and PJM</p>
      </div>
    </div>
  )
}
