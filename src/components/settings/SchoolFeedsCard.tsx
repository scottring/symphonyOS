import { useEffect, useRef, useState, type Ref } from 'react'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { SectionHeading } from '@/components/layout/SectionHeading'
import { feedStatus, type FeedHealthRow, type FeedStatus } from '@/lib/schoolFeeds'

const COLUMNS = 'connector, last_ok_at, last_error, last_error_at, heartbeat_at, last_flush_at, pair_qr, pair_qr_at'

const formatWhen = (d: Date) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Settings → School feeds (Scott, 2026-11-11): whether the WhatsApp and
 * ClassDojo feeds behind the 5pm school digest are working, and — when
 * WhatsApp needs linking again — the code to scan, here rather than in the
 * worker's server logs. Shown only to a household that has feeds.
 */
export function SchoolFeedsCard() {
  const [rows, setRows] = useState<FeedHealthRow[] | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const { data } = await supabase.from('connector_health').select(COLUMNS)
      if (!alive) return
      const next = (data ?? []) as FeedHealthRow[]
      setRows(next)
      setNow(new Date())
      // Every few seconds while a code is up or due (they change every ~20s);
      // otherwise once a minute.
      const linking = feedStatus(next, new Date(), formatWhen).needsLink
      timer = setTimeout(() => { void load() }, linking ? 4_000 : 60_000)
    }
    void load()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [])

  // Arriving from the alert email's link.
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    if (rows?.length && window.location.hash === '#school-feeds') section.current?.scrollIntoView({ block: 'start' })
  }, [rows?.length])

  if (!rows || rows.length === 0) return null
  return <SchoolFeedsPanel ref={section} status={feedStatus(rows, now, formatWhen)} />
}

export function SchoolFeedsPanel({ status, ref }: { status: FeedStatus; ref?: Ref<HTMLElement> }) {
  return (
    <section ref={ref} id="school-feeds" className="scroll-mt-24">
      <SectionHeading>School feeds</SectionHeading>
      <p className="text-sm text-neutral-600 mb-4">
        The school WhatsApp groups and ClassDojo, read for the 5pm school digest. You get an email if they stop.
      </p>
      <dl className="school-feeds-lines">
        {status.lines.map((l) => (
          <div key={l.label} className={`school-feeds-line is-${l.tone}`}>
            <dt>{l.label}</dt>
            <dd>{l.text}</dd>
          </div>
        ))}
      </dl>
      {status.needsLink && <PairWhatsApp qr={status.pairQr} />}
    </section>
  )
}

function PairWhatsApp({ qr }: { qr: string | null }) {
  // The image is drawn for one code; a stale drawing is never shown for a new one.
  const [drawn, setDrawn] = useState<{ qr: string; url: string } | null>(null)
  useEffect(() => {
    let alive = true
    if (qr) void QRCode.toDataURL(qr, { margin: 1, width: 240 }).then((url) => { if (alive) setDrawn({ qr, url }) })
    return () => { alive = false }
  }, [qr])
  const src = qr && drawn?.qr === qr ? drawn.url : null
  return (
    <div className="school-feeds-pair" role="group" aria-label="Link WhatsApp">
      <p className="text-sm text-neutral-700">
        On the phone that’s in the school groups: WhatsApp → Settings → Linked Devices → Link a Device, then scan this.
      </p>
      {src
        ? <img src={src} width={240} height={240} alt="WhatsApp pairing code" className="school-feeds-qr" />
        : <p className="text-sm text-neutral-500" role="status">A new code appears here within a minute…</p>}
    </div>
  )
}
