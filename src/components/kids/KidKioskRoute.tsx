// /kid — a kid's tablet (2026-10-21).
//
// A tablet paired FOR a kid in Settings → Displays opens here and shows that
// kid's day, always: there is no way to switch to another kid from the
// tablet. A grown-up signed in on their own account can open /kid/<member
// id>?layout=trail|list to see what a kid's tablet shows.
//
// Check-offs from a tablet go through the server (displayWrites.ts), which
// allows only that kid's own items.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useWallData } from '@/hooks/useWallData'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useMemberInstanceHistory } from '@/components/wall-v2/useMemberInstanceHistory'
import { PairDisplayScreen } from '@/components/auth/PairDisplayScreen'
import { AuthForm } from '@/components/AuthForm'
import { useDisplayHeartbeat } from '@/lib/display/useDisplayHeartbeat'
import { leaveDisplay, myDisplay, usePairing, type KidLayout, type MyDisplay } from '@/lib/display/pairing'
import { displaySetTaskDone, isDisplayUser } from '@/lib/display/displayWrites'
import { buildMemberDayModel, type MemberDayModel } from '@/lib/wall/kidDayModel'
import { buildKidPanel, type KidStop } from '@/lib/kids/kidPanelModel'
import { listOpenThoughts, saveThought, type KidThought, type ThoughtKind } from '@/lib/kids/kidThoughts'
import { supabase } from '@/lib/supabase'
import { groupByDaySection } from '@/lib/timeUtils'
import { KidPanelView } from './KidPanelView'

const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..600&family=Instrument+Sans:wght@400;500;600;700&display=swap'
function useKidFonts() {
  useEffect(() => {
    if (import.meta.env.MODE === 'test' || typeof document === 'undefined' || document.getElementById('kw-fonts')) return
    const link = document.createElement('link')
    link.id = 'kw-fonts'
    link.rel = 'stylesheet'
    link.href = FONTS
    document.head.appendChild(link)
  }, [])
}

/** The clock, to the second while a timer runs and to the half-minute otherwise. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** Optimistic ticks over the day model, so a tap reads at once. */
export function withTicks(model: MemberDayModel, ticks: Map<string, boolean>): MemberDayModel {
  if (ticks.size === 0) return model
  const tick = <T extends { entityType: 'routine' | 'task'; id: string; done: boolean }>(r: T): T => {
    const v = ticks.get(`${r.entityType}:${r.id}`)
    return v === undefined ? r : { ...r, done: v }
  }
  return {
    ...model,
    reading: model.reading ? tick(model.reading) : null,
    collections: model.collections.map((c) => ({ ...c, rows: c.rows.map(tick) })),
    bands: {
      morning: model.bands.morning.map(tick),
      afternoon: model.bands.afternoon.map(tick),
      evening: model.bands.evening.map(tick),
      anytime: model.bands.anytime.map(tick),
    },
    // A ticked homework row leaves the model's list; keep it, done, until the refetch.
    homework: model.homework,
  }
}

export default function KidKioskRoute() {
  useKidFonts()
  const { user, loading } = useAuth()
  const params = useParams<{ memberId?: string }>()
  const [search] = useSearchParams()
  const [display, setDisplay] = useState<MyDisplay | null | undefined>(undefined)
  const [wantsPersonSignIn, setWantsPersonSignIn] = useState(false)
  const isDisplay = isDisplayUser(user)
  const pairing = usePairing()
  useDisplayHeartbeat(isDisplay)

  useEffect(() => {
    let live = true
    if (!user || pairing) { setDisplay(undefined); return }
    if (!isDisplay) { setDisplay(null); return }
    void myDisplay().then((d) => { if (live) setDisplay(d) })
    return () => { live = false }
  }, [user, isDisplay, pairing])

  if (loading) return <div className="kid-kiosk" />
  // Mid-pairing the session is signed in but not yet a tablet: the pairing
  // screen stays up until the code is through (or refused, with the reason).
  if (!user || pairing) return wantsPersonSignIn ? <AuthForm /> : <PairDisplayScreen onSignInInstead={() => setWantsPersonSignIn(true)} />
  if (display === undefined) return <div className="kid-kiosk" />

  // A tablet is for its kid, whatever the address says.
  if (isDisplay) {
    if (!display) return <div className="kid-kiosk"><p className="kk-empty">This tablet is not paired any more. A grown-up can pair it again in Settings → Displays.</p></div>
    if (!display.familyMemberId) return <Navigate to="/wall-v2" replace />
    return <KidKioskLive memberId={display.familyMemberId} layout={display.layout ?? 'trail'} householdId={display.householdId} viaDisplay />
  }
  const layout: KidLayout = search.get('layout') === 'list' ? 'list' : 'trail'
  if (!params.memberId) return <Navigate to="/settings" replace />
  return <KidKioskLive memberId={params.memberId} layout={layout} householdId={null} viaDisplay={false} />
}

function KidKioskLive({ memberId, layout, householdId, viaDisplay }: { memberId: string; layout: KidLayout; householdId: string | null; viaDisplay: boolean }) {
  const wall = useWallData()
  const { history } = useMemberInstanceHistory()
  const { markDone, undoDone } = useActionableInstances()
  const now = useNow()
  const navigate = useNavigate()
  // Leaving kid mode (a grown-up holds the clock): a tablet unpairs itself and
  // shows the pairing screen, where "Sign in instead" is one tap away.
  const exit = useMemo(() => (viaDisplay
    ? { note: 'This unpairs the tablet and goes to the sign-in screen. Pair it again any time in Settings → Displays.', onExit: async () => { await leaveDisplay(); window.location.replace('/kid') } }
    : { note: 'Back to Symphony.', onExit: () => navigate('/settings') }), [viaDisplay, navigate])
  const [ticks, setTicks] = useState<Map<string, boolean>>(new Map())
  useEffect(() => { setTicks(new Map()) }, [history, wall.days, wall.homeworkTasks])

  const member = wall.familyMembers.find((m) => m.id === memberId) ?? null
  // The model reads the day; recompute it each minute, not each second.
  const minute = Math.floor(now.getTime() / 60_000)
  const model = useMemo(() => {
    if (!member) return null
    const clock = new Date(minute * 60_000)
    const today = wall.days.find((d) => d.isToday) ?? wall.days[0]
    return buildMemberDayModel({
      member, date: clock, now: clock, routines: wall.routines,
      todayItems: today?.items ?? groupByDaySection([]),
      members: wall.familyMembers, neededTasks: wall.neededTasks, homeworkTasks: wall.homeworkTasks, history,
    })
  }, [member, minute, wall.days, wall.routines, wall.familyMembers, wall.neededTasks, wall.homeworkTasks, history])
  const panel = useMemo(() => (model && member ? buildKidPanel(withTicks(model, ticks), member.id, new Date(minute * 60_000)) : null), [model, member, ticks, minute])

  const onToggle = useCallback((stop: KidStop, done: boolean) => {
    setTicks((m) => new Map(m).set(stop.key, done))
    void (async () => {
      const today = new Date()
      if (stop.row.entityType === 'routine') {
        await (done ? markDone('routine', stop.row.id, today) : undoDone('routine', stop.row.id, today))
      } else if (viaDisplay) {
        await displaySetTaskDone(stop.row.id, done)
        await wall.refetch()
      } else {
        await supabase.from('tasks').update({ completed: done, completed_at: done ? new Date().toISOString() : null }).eq('id', stop.row.id)
        await wall.refetch()
      }
    })()
  }, [markDone, undoDone, viaDisplay, wall])

  // Thoughts: this kid's, not yet gone over.
  const [thoughts, setThoughts] = useState<KidThought[]>([])
  const [hh, setHh] = useState<string | null>(householdId)
  useEffect(() => {
    if (hh) return
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle()
      if (data?.household_id) setHh(data.household_id as string)
    })
  }, [hh])
  const refreshThoughts = useCallback(async () => {
    try { setThoughts(await listOpenThoughts(memberId)) } catch { /* not yet migrated, or offline: no list */ }
  }, [memberId])
  useEffect(() => {
    void refreshThoughts()
    const t = setInterval(() => void refreshThoughts(), 5 * 60_000)
    return () => clearInterval(t)
  }, [refreshThoughts])
  const onSaveThought = useCallback(async (text: string, kind: ThoughtKind | null) => {
    if (!hh) return false
    const saved = await saveThought({ householdId: hh, memberId, text, kind })
    if (saved) setThoughts((list) => [...list, saved])
    return saved != null
  }, [hh, memberId])

  const canListen = typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)

  if (!member || !panel) {
    return <div className="kid-kiosk"><p className="kk-empty">{wall.loading ? 'Getting the day ready…' : 'This kid isn’t in the household’s people. A grown-up can check Settings → Displays.'}</p></div>
  }
  return (
    <KidPanelView
      member={{ id: member.id, name: member.name, color: member.color }}
      layout={layout}
      panel={panel}
      now={now}
      onToggle={onToggle}
      thoughts={thoughts}
      onSaveThought={onSaveThought}
      canListen={canListen}
      exit={exit}
    />
  )
}
