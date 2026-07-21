import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Sparkles, RefreshCw } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { UpdateRoutineInput } from '@/hooks/useRoutines'
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { TapRoutinePanel } from '@/components/surface/TapRoutinePanel'
import { TapStepPanel } from '@/components/surface/TapStepPanel'
import { buildRhythmModel, DAY_ORDER, type RhythmCard } from './rhythm/rhythmModel'
import { findTend, tendFindingKey } from './rhythm/tendHeuristics'
import { DailyArc } from './rhythm/DailyArc'
import { WeekStrip } from './rhythm/WeekStrip'
import { SometimesShelf } from './rhythm/SometimesShelf'
import { SeasonalShelf } from './rhythm/SeasonalShelf'
import { TendCard } from './rhythm/TendCard'

interface RhythmPageProps {
  routines: Routine[]
  /** Hold the empty state until the first load settles. */
  loading?: boolean
  contacts?: Contact[]
  familyMembers?: FamilyMember[]
  onCreateRoutine: () => void
  onUpdateRoutine: (id: string, updates: UpdateRoutineInput) => Promise<boolean> | void
  onAddStep: (collectionId: string, name: string) => void
  /** Batch step creation (document → steps extraction). */
  onAddSteps?: (collectionId: string, steps: { name: string; detail?: string }[]) => void | Promise<unknown>
  onReorderSteps: (writes: { id: string; step_order: number }[]) => void
  onPromoteStep: (stepId: string) => void
  /** Delete a step routine entirely (swap-out). Optional — hides the action when absent. */
  onDeleteStep?: (stepId: string) => void
  /** Delete a top-level routine (RoutinesApp already passes this — it was silently dropped before). */
  onDelete?: (id: string) => void
  onCreateCollection?: (name: string) => Promise<Routine | null> | void
  onGroupIntoCollection?: (name: string, routineIds: string[]) => void
  /** Open the AI routine builder (paste text / drop a PDF → proposed routine). */
  onBuildWithAI?: () => void
}

export function RhythmPage(props: RhythmPageProps) {
  const {
    routines, loading = false, familyMembers = [],
    onUpdateRoutine, onDelete, onGroupIntoCollection, onBuildWithAI, onCreateCollection,
  } = props

  const [memberId, setMemberId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<{ kind: 'routine' | 'standalone-step' | 'step'; id: string } | null>(null)

  const model = useMemo(() => buildRhythmModel(routines, { memberId }), [routines, memberId])

  // Dismissed tend suggestions persist so a rejected grouping stays gone.
  const [dismissedTend, setDismissedTend] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('rhythm-tend-dismissed') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const dismissTend = (key: string) => {
    setDismissedTend(prev => {
      const next = prev.includes(key) ? prev : [...prev, key]
      localStorage.setItem('rhythm-tend-dismissed', JSON.stringify(next))
      return next
    })
  }
  const findings = useMemo(
    () => findTend(routines).filter(f => !dismissedTend.includes(tendFindingKey(f))),
    [routines, dismissedTend],
  )
  const { collections } = useMemo(() => groupRoutineSteps(routines), [routines])
  const collectionSteps = useMemo(
    () => Object.fromEntries(collections.map(c => [c.id, c.steps])),
    [collections],
  )
  // Every-day routines mirrored into the Week Strip: collections as one named
  // item, cluster/single members individually.
  const dailyItems = useMemo(
    () => [
      ...model.daily.timed.flatMap(c => (c.kind === 'collection' && c.routine ? [c.routine] : c.routines)),
      ...model.daily.anytime,
    ],
    [model],
  )

  // Type-anywhere search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input,textarea,[contenteditable="true"]')) return
      if (open) return
      if (e.key === 'Escape') { setQuery(''); return }
      if (e.key === 'Backspace') { e.preventDefault(); setQuery(q => q.slice(0, -1)); return }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setQuery(q => q + e.key) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = (r: Routine): boolean => {
    if (!q) return true
    if (r.name.toLowerCase().includes(q)) return true
    const coll = collections.find(c => c.id === r.id)
    return coll?.steps.some(s => s.name.toLowerCase().includes(q)) ?? false
  }

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todayKey = DAY_ORDER[now.getDay()]
  const subtitle = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const handleNameCluster = (card: RhythmCard, name: string) => {
    onGroupIntoCollection?.(name, card.routines.map(r => r.id))
  }
  const handleWakeAll = () => {
    for (const r of model.seasonal) onUpdateRoutine(r.id, { visibility: 'active', paused_until: null })
  }
  const handleMerge = (_survivorId: string, loserIds: string[]) => {
    for (const id of loserIds) onDelete?.(id)
  }

  // --- open-panel resolution (routine/standalone-step/step kinds) ---
  const cs = collections
  const openRoutineItem =
    open?.kind === 'routine' || open?.kind === 'standalone-step'
      ? (cs.find(c => c.id === open.id)
         ?? (() => {
              const r = routines.find(x => x.id === open.id && !x.parent_routine_id)
              return r ? { ...r, steps: [] as Routine[] } : undefined
            })())
      : undefined
  const openWithSteps = open?.kind === 'routine'
  const openStep = open?.kind === 'step' ? cs.flatMap(c => c.steps).find(s => s.id === open.id) : undefined
  const parentOfOpenStep = openStep ? cs.find(c => c.steps.some(s => s.id === openStep.id)) : undefined

  const openRoutine = (r: Routine) =>
    setOpen({ kind: model.stepCounts[r.id] ? 'routine' : 'standalone-step', id: r.id })

  // --- Sticky section nav: pills that jump to each zone; scroll-spy highlight ---
  const scrollRef = useRef<HTMLDivElement>(null)
  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const weekCount = DAY_ORDER.reduce((n, d) => n + model.week.days[d].length, 0) + model.week.sometime.length
  const zones = [
    { key: 'daily', label: 'Every day', show: model.daily.timed.length + model.daily.anytime.length > 0 },
    { key: 'week', label: 'This week', show: weekCount > 0 },
    { key: 'sometimes', label: 'Sometimes', show: model.sometimes.length > 0 },
    { key: 'seasonal', label: 'Resting', show: model.seasonal.length > 0 },
    { key: 'tend', label: 'Tend', show: findings.length > 0 },
  ].filter(z => z.show)
  const [activeZone, setActiveZone] = useState('daily')
  const zoneKeys = zones.map(z => z.key).join(',')

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const offset = el.scrollTop + 140
      let current = zoneKeys.split(',')[0] ?? 'daily'
      for (const key of zoneKeys.split(',')) {
        const top = zoneRefs.current[key]?.offsetTop ?? Infinity
        if (top <= offset) current = key
      }
      setActiveZone(current)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [zoneKeys])

  const jumpTo = (key: string) => zoneRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const setZoneRef = (key: string) => (node: HTMLDivElement | null) => { zoneRefs.current[key] = node }

  return (
    <div ref={scrollRef} className="h-full overflow-auto bg-[var(--color-bg-base)]">
      {/* Full-width canvas (keeps the shared gutter, drops the 940px cap) —
          the staggered timeline needs the room; approved deviation from PAGE_COLUMN. */}
      <div className="relative w-full px-6 md:px-10 lg:px-14 py-8">
        {/* Masthead */}
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">Routines</h1>
            <p className="mt-1 text-sm text-neutral-500">How your family runs — {subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type anywhere to find"
                className="w-40 bg-transparent text-sm focus:outline-none placeholder:text-neutral-400"
              />
            </div>
            {onBuildWithAI && (
              <button onClick={onBuildWithAI}
                className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5
                           font-medium text-neutral-700 shadow-sm hover:border-amber-300 transition-colors">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Build with AI
              </button>
            )}
            <button
              onClick={async () => {
                if (!onCreateCollection) return
                const created = await onCreateCollection('New routine')
                if (created) setOpen({ kind: 'standalone-step', id: created.id })
              }}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 font-medium text-white
                         shadow-sm hover:bg-amber-600 active:bg-amber-700 transition-colors">
              <Plus className="w-5 h-5" />
              New routine
            </button>
          </div>
        </div>

        {/* People pills */}
        {familyMembers.length > 0 && (
          <div className="mb-6 flex items-center gap-1.5 flex-wrap">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Whose week</span>
            <button onClick={() => setMemberId(null)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                memberId === null ? 'bg-[var(--color-primary-500,#3d5a44)] text-white' : 'border border-neutral-200 bg-white text-neutral-600'
              }`}>
              Everyone
            </button>
            {[...familyMembers].sort((a, b) => a.display_order - b.display_order).map(m => (
              <button key={m.id} onClick={() => setMemberId(memberId === m.id ? null : m.id)}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  memberId === m.id ? 'bg-[var(--color-primary-500,#3d5a44)] text-white' : 'border border-neutral-200 bg-white text-neutral-600'
                }`}>
                {m.name}
              </button>
            ))}
          </div>
        )}

        {/* Sticky section nav — tab ergonomics without hiding the canvas */}
        {zones.length >= 2 && (
          <nav className="sticky top-0 z-20 -mx-6 md:-mx-10 lg:-mx-14 mb-6 px-6 md:px-10 lg:px-14 py-2.5
                          bg-[var(--color-bg-base)]/95 backdrop-blur-sm border-b border-neutral-200/60
                          flex items-center gap-1.5 overflow-x-auto">
            {zones.map(z => (
              <button
                key={z.key}
                onClick={() => jumpTo(z.key)}
                className={`rounded-full px-3.5 py-1 text-sm whitespace-nowrap transition-colors ${
                  activeZone === z.key
                    ? 'bg-[var(--color-primary-500,#3d5a44)] text-white'
                    : 'text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                {z.label}
              </button>
            ))}
          </nav>
        )}

        {loading && routines.length === 0 && (
          <p className="py-16 text-center text-neutral-400">Loading your week…</p>
        )}

        {!loading && routines.length === 0 && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-100">
              <RefreshCw className="h-10 w-10 text-amber-600" />
            </div>
            <h2 className="font-display mb-2 text-xl font-semibold text-neutral-700">No routines yet</h2>
            <p className="mx-auto mb-6 max-w-sm text-neutral-500">
              Capture your first routine and Symphony will start painting your week.
            </p>
            <button
              onClick={async () => {
                if (!onCreateCollection) return
                const created = await onCreateCollection('New routine')
                if (created) setOpen({ kind: 'standalone-step', id: created.id })
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-medium text-white
                         shadow-sm hover:bg-amber-600 transition-colors">
              <Plus className="h-5 w-5" />
              Create your first routine
            </button>
          </div>
        )}

        <div ref={setZoneRef('daily')} className="scroll-mt-16">
          <DailyArc
            cards={model.daily.timed}
            anytime={model.daily.anytime}
            familyMembers={familyMembers}
            matches={matches}
            nowMinutes={nowMinutes}
            onOpenCollection={id => setOpen({ kind: 'routine', id })}
            onOpenRoutine={openRoutine}
            onNameCluster={handleNameCluster}
          />
        </div>

        <div ref={setZoneRef('week')} className="scroll-mt-16">
          <WeekStrip
            days={model.week.days}
            sometime={model.week.sometime}
            stepCounts={model.stepCounts}
            matches={matches}
            todayKey={todayKey}
            onOpenRoutine={openRoutine}
            familyMembers={familyMembers}
            collectionSteps={collectionSteps}
            dailyItems={dailyItems}
          />
        </div>

        <div ref={setZoneRef('sometimes')} className="scroll-mt-16">
          <SometimesShelf routines={model.sometimes} matches={matches} onOpenRoutine={openRoutine} />
        </div>

        <div ref={setZoneRef('seasonal')} className="scroll-mt-16">
          <SeasonalShelf routines={model.seasonal} onWakeAll={handleWakeAll} onOpenRoutine={openRoutine} />
        </div>

        <div ref={setZoneRef('tend')} className="scroll-mt-16">
          <TendCard
            findings={findings}
            routines={routines}
            onMerge={handleMerge}
            onStampDomain={(id, context) => onUpdateRoutine(id, { context })}
            onRename={(id, name) => onUpdateRoutine(id, { name })}
            onLetGo={id => onDelete?.(id)}
            onDismiss={dismissTend}
          />
        </div>
      </div>

      {/* Panel overlay — routine/step editors, shared across all zones */}
      {(openRoutineItem || openStep) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(null)}>
          <div onClick={e => e.stopPropagation()}>
            {openRoutineItem && (
              <TapRoutinePanel
                key={openRoutineItem.id}
                routine={openRoutineItem}
                familyMembers={familyMembers}
                onClose={() => setOpen(null)}
                onRename={name => onUpdateRoutine(openRoutineItem.id, { name })}
                onContextChange={context => onUpdateRoutine(openRoutineItem.id, { context: context ?? null })}
                onVisibilityChange={visibility => onUpdateRoutine(openRoutineItem.id, { visibility })}
                onRestUntilChange={pausedUntil => onUpdateRoutine(openRoutineItem.id, { paused_until: pausedUntil })}
                onAssignChange={memberIds => onUpdateRoutine(openRoutineItem.id, { assigned_to_all: memberIds })}
                onScheduleChange={(pattern, timeOfDay) =>
                  onUpdateRoutine(openRoutineItem.id, { recurrence_pattern: pattern, time_of_day: timeOfDay || null })}
                onNotesChange={description => onUpdateRoutine(openRoutineItem.id, { description })}
                onDelete={onDelete ? () => { onDelete(openRoutineItem.id); setOpen(null) } : undefined}
                onAddSteps={props.onAddSteps ? steps => props.onAddSteps!(openRoutineItem.id, steps) : undefined}
                {...(openWithSteps ? {
                  steps: openRoutineItem.steps,
                  onSelectStep: (s: Routine) => setOpen({ kind: 'step', id: s.id }),
                  onAddStep: (name: string) => props.onAddStep(openRoutineItem.id, name),
                  onReorderSteps: props.onReorderSteps,
                } : {})}
              />
            )}
            {openStep && parentOfOpenStep && (
              <TapStepPanel
                key={openStep.id}
                step={openStep}
                parentName={parentOfOpenStep.name}
                onClose={() => setOpen({ kind: 'routine', id: parentOfOpenStep.id })}
                onRename={name => onUpdateRoutine(openStep.id, { name })}
                onDosesChange={times => onUpdateRoutine(openStep.id, { times_per_day: times })}
                onNotesChange={description => onUpdateRoutine(openStep.id, { description })}
                onScheduleChange={pattern => onUpdateRoutine(openStep.id, { recurrence_pattern: pattern })}
                onPromote={() => { props.onPromoteStep(openStep.id); setOpen({ kind: 'routine', id: parentOfOpenStep.id }) }}
                onDelete={props.onDeleteStep ? () => { props.onDeleteStep!(openStep.id); setOpen({ kind: 'routine', id: parentOfOpenStep.id }) } : undefined}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
