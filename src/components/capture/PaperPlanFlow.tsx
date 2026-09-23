import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Camera, Check, ImagePlus, Link2, Loader2, MessageSquare, RotateCcw, Send, Trash2, X,
} from 'lucide-react'
import type { Analysis, Item, ItemKind, Level, PlanContext } from '../../../supabase/functions/plan-from-paper/lib/plan'
import { CameraCaptureModal } from '@/components/capture/CameraCaptureModal'
import { supabase, getAuthUser } from '@/lib/supabase'
import { DOMAINS, type DomainId } from '@/lib/domains'
import { readCadenceConfig, weekOf, localYmd } from '@/lib/cadence/config'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGoalsContext } from '@/contexts/GoalsContext'
import { useRoutines } from '@/hooks/useRoutines'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import type { FamilyMember } from '@/types/family'
import { prepareImages } from '@/lib/paperPlan/images'
import { buildPlanContext } from '@/lib/paperPlan/context'
import { analyzePages, revisePlan } from '@/lib/paperPlan/api'
import { PaperPlanError, isRetryable, paperErrorMessage } from '@/lib/paperPlan/errors'
import { loadImport, newImport, storeImport, withAnalysis, type PaperImage, type PaperImport } from '@/lib/paperPlan/importState'
import { buildSaveRows, summarizeRows } from '@/lib/paperPlan/savePlan'
import { writePlanRows } from '@/lib/paperPlan/writeRows'

const MAX_IMAGES = 6
const KIND_LABEL: Record<ItemKind, string> = { goal: 'Goal', task: 'Task', routine: 'Routine idea', note: 'Note' }
const KIND_ORDER: ItemKind[] = ['goal', 'task', 'routine', 'note']
const LEVEL_LABEL: Record<Level, string> = { year: 'Year', season: 'Season', month: 'Month', week: 'This week', someday: 'Someday', none: 'No list' }

type Step = 'intake' | 'reading' | 'review' | 'confirm' | 'saving' | 'saved'
type Pane = 'plan' | 'pages' | 'chat'

interface Props {
  members: FamilyMember[]
  onClose: () => void
}

/** "photo-2-left.jpg" → "2": which photo a stored image came from. */
function photoNumber(path: string): string {
  return path.split('/').pop()!.replace(/\.jpg$/, '').split('-')[1] ?? '1'
}

function rememberedDomain(): DomainId {
  try {
    const raw = localStorage.getItem('symphony.paper.domain.plan')
    return raw === 'work' || raw === 'personal' || raw === 'family' ? raw : 'family'
  } catch {
    return 'family'
  }
}

/** Placement for a level: the page's own period when a page plans at that level, else the current one. */
function placementFor(level: Level, analysis: Analysis, ctx: PlanContext): Item['placement'] {
  const page = analysis.pages.find((p) => p.period.level === level)
  if (page?.period.start) return { level, label: page.period.label, start: page.period.start }
  if (level === 'season' && ctx.seasons[0]) return { level, label: ctx.seasons[0].label, start: ctx.seasons[0].start }
  if (level === 'month') {
    const start = `${ctx.today.slice(0, 7)}-01`
    const label = new Date(`${start}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    return { level, label, start }
  }
  if (level === 'year') return { level, label: String(ctx.year), start: `${ctx.year}-01-01` }
  return { level, label: LEVEL_LABEL[level], start: null }
}

/**
 * "Help me turn this into a plan": photos (+ what they are) → a proposed plan
 * beside the pages → edit it or talk it through → approve → save.
 *
 * Nothing is written until "Save N changes". The import (photos, the user's
 * explanation, the proposal, the conversation) is kept in localStorage, so a
 * failure or a closed tab never loses it, and each item's row id is fixed when
 * first proposed, so a retried save cannot duplicate anything.
 */
export function PaperPlanFlow({ members, onClose }: Props) {
  const navigate = useNavigate()
  const { tasks } = useSupabaseTasks()
  const { goals } = useGoalsContext()
  const { routines } = useRoutines()
  const { seasons } = useHouseholdSeasons()

  const [userId, setUserId] = useState<string | null>(null)
  const [imp, setImp] = useState<PaperImport | null>(null)
  const [step, setStep] = useState<Step>('intake')
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [camera, setCamera] = useState(false)
  const [pane, setPane] = useState<Pane>('plan')
  const [draft, setDraft] = useState('')
  const [revising, setRevising] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load (or start) this user's import.
  useEffect(() => {
    let alive = true
    void getAuthUser().then(({ data: { user } }) => {
      if (!alive || !user) return
      setUserId(user.id)
      const saved = loadImport(user.id)
      const current = saved && !saved.savedAt ? saved : newImport(rememberedDomain())
      setImp(current)
      setStep(current.analysis ? 'review' : 'intake')
    })
    return () => { alive = false }
  }, [])

  const update = useCallback((next: PaperImport) => {
    setImp(next)
    if (userId) storeImport(userId, next)
  }, [userId])

  const context = useMemo<PlanContext>(() => buildPlanContext({
    today: new Date(), seasons, tasks, goals, routines, members,
  }), [seasons, tasks, goals, routines, members])

  // ── Intake ────────────────────────────────────────────────────────────
  const addPhoto = useCallback(async (blob: Blob) => {
    if (!imp || !userId) return
    setBusy('Adding the photo…')
    setError(null)
    try {
      let prepared
      try {
        prepared = await prepareImages(blob)
      } catch {
        setError({ code: 'bad_request', message: 'This photo type can’t be opened here. Use a JPEG or PNG photo.' })
        return
      }
      if (imp.images.length + prepared.length > MAX_IMAGES) {
        setError({ code: 'bad_request', message: 'That’s as many photos as one reading can take. Read these first, then add the rest as a new import.' })
        return
      }
      const n = Math.max(0, ...imp.images.map((i) => Number(photoNumber(i.path)) || 0)) + 1
      const images: PaperImage[] = []
      for (const p of prepared) {
        const name = p.part === 'whole' ? `photo-${n}` : `photo-${n}-${p.part}`
        const path = `${userId}/paper-plan/${imp.id}/${name}.jpg`
        const { error: upErr } = await supabase.storage.from('attachments').upload(path, p.blob, { contentType: 'image/jpeg', upsert: true })
        if (upErr) {
          setError({ code: 'network', message: 'The photo didn’t upload. Check your connection and add it again.' })
          return
        }
        images.push({ path, part: p.part, bytes: p.blob.size, attachmentId: crypto.randomUUID() })
      }
      update({ ...imp, images: [...imp.images, ...images] })
    } finally {
      setBusy(null)
    }
  }, [imp, userId, update])

  const addFromPhone = useCallback(async (storagePath: string) => {
    setCamera(false)
    const { data, error: dlErr } = await supabase.storage.from('attachments').download(storagePath)
    if (dlErr || !data) {
      setError({ code: 'image_unavailable', message: 'The photo from your phone couldn’t be opened. Try sending it again.' })
      return
    }
    await addPhoto(data)
  }, [addPhoto])

  const removePhoto = useCallback((n: string) => {
    if (!imp) return
    const gone = imp.images.filter((i) => photoNumber(i.path) === n)
    void supabase.storage.from('attachments').remove(gone.map((g) => g.path))
    update({ ...imp, images: imp.images.filter((i) => !gone.includes(i)) })
  }, [imp, update])

  const read = useCallback(async () => {
    if (!imp || !imp.images.length) return
    setStep('reading')
    setError(null)
    try {
      const { analysis } = await analyzePages(imp.images.map((i) => i.path), imp.instructions, context)
      update(withAnalysis(imp, analysis))
      setStep('review')
    } catch (e) {
      const code = e instanceof PaperPlanError ? e.code : 'unknown'
      setError({ code, message: paperErrorMessage(code) })
      setStep('intake')
    }
  }, [imp, context, update])

  // ── Review ────────────────────────────────────────────────────────────
  const editItem = useCallback((id: string, patch: Partial<Item>) => {
    if (!imp?.analysis) return
    update({ ...imp, analysis: { ...imp.analysis, items: imp.analysis.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } })
  }, [imp, update])

  const setIncluded = useCallback((id: string, on: boolean) => {
    if (!imp) return
    update({ ...imp, include: { ...imp.include, [id]: on } })
  }, [imp, update])

  const send = useCallback(async () => {
    const message = draft.trim()
    if (!imp?.analysis || !message || revising) return
    setRevising(true)
    setError(null)
    const chat = [...imp.chat, { role: 'user' as const, text: message }]
    update({ ...imp, chat })
    setDraft('')
    try {
      const res = await revisePlan(imp.analysis, imp.chat, message, imp.instructions, context)
      update(withAnalysis({ ...imp, chat: [...chat, { role: 'assistant', text: res.reply, changes: res.changes }] }, res.analysis))
    } catch (e) {
      const code = e instanceof PaperPlanError ? e.code : 'unknown'
      // The message stays in the box so "try again" is one tap.
      update({ ...imp, chat: imp.chat })
      setDraft(message)
      setError({ code, message: paperErrorMessage(code) })
    } finally {
      setRevising(false)
    }
  }, [draft, imp, revising, context, update])

  // ── Save ──────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    if (!imp?.analysis || !userId) return null
    const cfg = readCadenceConfig()
    const periodGoals = Object.fromEntries(context.periodGoals.map((g) => [g.id, { level: g.level, start: g.start }]))
    const headings = imp.analysis.pages.map((p) => p.heading ?? p.period.label).filter(Boolean)
    return buildSaveRows(imp.analysis, imp.instructions, {
      userId,
      domain: imp.domain,
      year: context.year,
      weekStart: localYmd(weekOf(new Date(), cfg.weekStartsOn)),
      include: imp.include,
      rowIds: imp.rowIds,
      sourceNote: { id: imp.sourceNoteId, title: `Paper plan: ${headings.join(' · ') || 'pages'}`.slice(0, 120) },
      images: imp.images.map((i) => ({ path: i.path, attachmentId: i.attachmentId, bytes: i.bytes })),
      existingPeriodGoals: periodGoals,
      existing: {
        yearGoalIds: new Set(context.yearGoals.map((g) => g.id)),
        taskIds: new Set([...context.openTasks.map((t) => t.id), ...context.periodGoals.map((g) => g.id)]),
      },
    })
  }, [imp, userId, context])
  const summary = rows ? summarizeRows(rows) : null
  const labelFor = (itemId: string) => `“${imp?.analysis?.items.find((i) => i.id === itemId)?.title ?? ''}”`

  const save = useCallback(async () => {
    if (!imp || !rows || !userId) return
    setStep('saving')
    setError(null)
    try {
      await writePlanRows(rows)
      try { localStorage.setItem('symphony.paper.domain.plan', imp.domain) } catch { /* ignore */ }
      const done = { ...imp, savedAt: new Date().toISOString() }
      setImp(done)
      storeImport(userId, null)
      setStep('saved')
    } catch {
      // Same row ids on retry: what landed stays, the rest fills in.
      setError({ code: 'save', message: 'Not everything saved. Try again — anything already saved won’t be added twice.' })
      setStep('confirm')
    }
  }, [imp, rows, userId])

  const discard = useCallback(() => {
    if (imp && !imp.savedAt && imp.images.length) void supabase.storage.from('attachments').remove(imp.images.map((i) => i.path))
    if (userId) storeImport(userId, null)
    setImp(newImport(imp?.domain ?? rememberedDomain()))
    setStep('intake')
    setError(null)
  }, [imp, userId])

  if (!imp) {
    return (
      <Shell onClose={onClose} title="Plan from paper">
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>
      </Shell>
    )
  }

  const photos = groupPhotos(imp.images)

  return (
    <Shell onClose={onClose} title="Plan from paper" step={step}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          void (async () => { for (const f of files) await addPhoto(f) })()
        }}
      />
      {camera && (
        <CameraCaptureModal
          onCapture={(blob) => { setCamera(false); void addPhoto(blob) }}
          onPhoneHandoff={(path) => void addFromPhone(path)}
          onPickFile={() => { setCamera(false); fileRef.current?.click() }}
          onClose={() => setCamera(false)}
        />
      )}

      {(step === 'intake' || step === 'reading') && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
            <div>
              <h2 className="font-display text-2xl text-neutral-900">Turn your pages into a plan</h2>
              <p className="text-[14px] text-neutral-600 mt-1">
                Add photos of your planning pages. Symphony reads them word for word, then proposes goals, tasks,
                routine ideas and notes for you to check. Nothing is saved until you approve it.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map((ph) => (
                <div key={ph.n} className="relative rounded-xl overflow-hidden border border-neutral-200 bg-bg-elevated aspect-[4/3]">
                  <StorageImage path={ph.whole.path} alt={`Photo ${ph.n}`} className="w-full h-full object-cover" />
                  {ph.split && <span className="absolute left-2 bottom-2 text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-white">Two pages</span>}
                  {step === 'intake' && (
                    <button type="button" aria-label={`Remove photo ${ph.n}`} onClick={() => removePhoto(ph.n)}
                      className="absolute right-1.5 top-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {step === 'intake' && imp.images.length < MAX_IMAGES && (
                <div className="flex flex-col gap-2 aspect-[4/3]">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
                    className="flex-1 rounded-xl border border-dashed border-neutral-300 text-neutral-600 hover:bg-neutral-50 flex items-center justify-center gap-2 text-[14px]">
                    <ImagePlus className="w-4 h-4" />Choose photos
                  </button>
                  <button type="button" onClick={() => setCamera(true)} disabled={!!busy}
                    className="flex-1 rounded-xl border border-dashed border-neutral-300 text-neutral-600 hover:bg-neutral-50 flex items-center justify-center gap-2 text-[14px]">
                    <Camera className="w-4 h-4" />Take a photo
                  </button>
                </div>
              )}
            </div>
            {busy && <p className="text-[13px] text-neutral-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{busy}</p>}

            <label className="block">
              <span className="text-[14px] font-medium text-neutral-800">What are these pages? <span className="font-normal text-neutral-500">(optional)</span></span>
              <textarea
                value={imp.instructions}
                onChange={(e) => update({ ...imp, instructions: e.target.value })}
                disabled={step === 'reading'}
                rows={3}
                placeholder="e.g. The left page is my plan for the season; the right page is this month, taken from it."
                className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-bg-elevated px-3 py-2 text-[14px] text-neutral-800 placeholder:text-neutral-400"
              />
            </label>

            <DomainPicker value={imp.domain} onChange={(domain) => update({ ...imp, domain })} disabled={step === 'reading'} />

            {error && <ErrorBox error={error} onRetry={imp.images.length && isRetryable(error.code) ? () => void read() : undefined} />}

            <div className="flex items-center justify-between gap-3">
              {imp.images.length ? (
                <button type="button" onClick={discard} disabled={step === 'reading'} className="text-[13px] text-neutral-500 hover:text-neutral-700">Start over</button>
              ) : <span />}
              <button type="button" onClick={() => void read()} disabled={!imp.images.length || step === 'reading' || !!busy}
                className="btn-primary px-5 py-2.5 rounded-xl text-[15px] disabled:opacity-50 flex items-center gap-2">
                {step === 'reading' ? <><Loader2 className="w-4 h-4 animate-spin" />Reading your pages…</> : 'Read my pages'}
              </button>
            </div>
            {step === 'reading' && (
              <p className="text-[13px] text-neutral-500 text-right">A full page takes a minute or two. You can leave this open.</p>
            )}
          </div>
        </div>
      )}

      {step === 'review' && imp.analysis && (
        <>
          <div className="lg:hidden flex border-b border-neutral-200 bg-bg-elevated" role="tablist">
            {(['plan', 'pages', 'chat'] as Pane[]).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={pane === p} onClick={() => setPane(p)}
                className={`flex-1 py-2.5 text-[14px] ${pane === p ? 'text-neutral-900 font-medium border-b-2 border-primary-600' : 'text-neutral-500'}`}>
                {p === 'plan' ? 'Plan' : p === 'pages' ? 'Pages' : 'Discuss'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(320px,40%)_1fr]">
            <aside className={`${pane === 'pages' ? 'block' : 'hidden'} lg:block min-h-0 overflow-y-auto border-r border-neutral-200 bg-bg-panel`}>
              <SourcePanel imp={imp} />
            </aside>
            <section className={`${pane === 'pages' ? 'hidden' : 'flex'} lg:flex flex-col min-h-0`}>
              <div className={`${pane === 'chat' ? 'hidden' : 'block'} lg:block flex-1 min-h-0 overflow-y-auto relative`}>
                <PlanPanel imp={imp} context={context} disabled={revising} onEdit={editItem} onInclude={setIncluded} />
              </div>
              <ChatPanel
                imp={imp}
                draft={draft}
                onDraft={setDraft}
                onSend={() => void send()}
                revising={revising}
                className={`${pane === 'chat' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-none lg:max-h-[42%]`}
              />
              {error && <div className="px-4 pb-2"><ErrorBox error={error} /></div>}
              <footer className="border-t border-neutral-200 bg-bg-elevated px-4 py-3 flex items-center justify-between gap-3">
                <button type="button" onClick={discard} className="text-[13px] text-neutral-500 hover:text-neutral-700 flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" />Discard
                </button>
                <span className="text-[13px] text-neutral-500 hidden sm:inline">
                  {Object.values(imp.include).filter((v) => v !== false).length} of {imp.analysis.items.length} items kept
                </span>
                <button type="button" onClick={() => setStep('confirm')} disabled={revising || !summary?.total}
                  className="btn-primary px-5 py-2.5 rounded-xl text-[15px] disabled:opacity-50">Review changes</button>
              </footer>
            </section>
          </div>
        </>
      )}

      {(step === 'confirm' || step === 'saving') && summary && rows && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
            <button type="button" onClick={() => setStep('review')} disabled={step === 'saving'} className="text-[13px] text-neutral-500 flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />Back to the plan
            </button>
            <h2 className="font-display text-2xl text-neutral-900">Save these changes?</h2>
            <ul className="rounded-xl border border-neutral-200 bg-bg-elevated divide-y divide-neutral-100 text-[14px] text-neutral-800">
              <SummaryRow n={summary.yearGoals} one="new year goal" many="new year goals" />
              <SummaryRow n={summary.seasonGoals} one="season goal" many="season goals" />
              <SummaryRow n={summary.seasonTasks} one="task on the season list" many="tasks on the season list" />
              <SummaryRow n={summary.monthGoals} one="month goal" many="month goals" />
              <SummaryRow n={summary.monthTasks} one="task on the month list" many="tasks on the month list" />
              <SummaryRow n={summary.otherTasks} one="other task (week, someday or Inbox)" many="other tasks (week, someday or Inbox)" />
              <SummaryRow n={summary.routines} one="routine idea, saved switched off" many="routine ideas, saved switched off" />
              <SummaryRow n={summary.notes} one="note" many="notes" />
              <li className="px-4 py-2.5">1 page note with the transcription and your photos</li>
            </ul>
            <ul className="text-[13px] text-neutral-600 space-y-1">
              <li className="flex gap-2"><Check className="w-4 h-4 text-success-600 shrink-0" />Nothing is put on Today or on a day.</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-success-600 shrink-0" />Your existing goals, tasks and routines are not changed — only linked to.</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-success-600 shrink-0" />Saved in {DOMAINS.find((d) => d.id === imp.domain)?.label ?? 'Family'}.</li>
            </ul>
            {rows.unlinked.length > 0 && (
              <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-[13px] text-neutral-700">
                <p className="font-medium mb-1">{rows.unlinked.length} {rows.unlinked.length === 1 ? 'link is' : 'links are'} kept as a note on the item</p>
                <p className="mb-1">A goal only holds steps on its own list, so these are written into the item instead:</p>
                <ul className="space-y-0.5">{rows.unlinked.slice(0, 6).map((u, i) => <li key={i}>{labelFor(u.itemId)} {u.label}</li>)}</ul>
                {rows.unlinked.length > 6 && <p className="mt-1">and {rows.unlinked.length - 6} more</p>}
              </div>
            )}
            {error && <ErrorBox error={error} />}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStep('review')} disabled={step === 'saving'} className="px-4 py-2.5 rounded-xl text-[15px] text-neutral-600 hover:bg-neutral-100">Keep editing</button>
              <button type="button" onClick={() => void save()} disabled={step === 'saving'} className="btn-primary px-5 py-2.5 rounded-xl text-[15px] flex items-center gap-2">
                {step === 'saving' ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : `Save ${summary.total} ${summary.total === 1 ? 'change' : 'changes'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'saved' && summary && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-4 py-10 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-success-100 flex items-center justify-center"><Check className="w-6 h-6 text-success-700" /></div>
            <h2 className="font-display text-2xl text-neutral-900">Your plan is in</h2>
            <p className="text-[14px] text-neutral-600">{summary.total} changes saved. Routine ideas are waiting, switched off, until you turn them on.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {summary.seasonGoals + summary.seasonTasks > 0 && (
                <button type="button" className="btn-secondary px-4 py-2 rounded-xl text-[14px]" onClick={() => { onClose(); navigate('/season') }}>Open the season</button>
              )}
              {summary.monthGoals + summary.monthTasks > 0 && (
                <button type="button" className="btn-secondary px-4 py-2 rounded-xl text-[14px]" onClick={() => { onClose(); navigate('/month') }}>Open the month</button>
              )}
              <button type="button" className="btn-primary px-4 py-2 rounded-xl text-[14px]" onClick={onClose}>Done</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────

function Shell({ title, step, onClose, children }: { title: string; step?: Step; onClose: () => void; children: React.ReactNode }) {
  const steps: [Step[], string][] = [[['intake', 'reading'], 'Pages'], [['review'], 'Plan'], [['confirm', 'saving', 'saved'], 'Save']]
  return (
    <div className="fixed inset-0 z-[60] bg-bg-base flex flex-col" role="dialog" aria-modal="true" aria-label={title}>
      <header className="flex items-center gap-3 px-4 h-14 border-b border-neutral-200 bg-bg-elevated shrink-0">
        <h1 className="font-display text-lg text-neutral-900">{title}</h1>
        {step && (
          <ol className="hidden sm:flex items-center gap-2 text-[13px] text-neutral-400 ml-2">
            {steps.map(([ids, label], i) => (
              <li key={label} className={ids.includes(step) ? 'text-neutral-900 font-medium' : ''}>{i > 0 && <span className="mr-2">›</span>}{label}</li>
            ))}
          </ol>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto w-9 h-9 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-600">
          <X className="w-5 h-5" />
        </button>
      </header>
      {children}
    </div>
  )
}

function groupPhotos(images: PaperImage[]) {
  const byN = new Map<string, { n: string; whole: PaperImage; split: boolean }>()
  for (const img of images) if (img.part === 'whole') byN.set(photoNumber(img.path), { n: photoNumber(img.path), whole: img, split: false })
  for (const img of images) if (img.part !== 'whole' && byN.has(photoNumber(img.path))) byN.get(photoNumber(img.path))!.split = true
  return [...byN.values()]
}

function StorageImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void supabase.storage.from('attachments').createSignedUrl(path, 3600).then(({ data }) => { if (alive) setUrl(data?.signedUrl ?? null) })
    return () => { alive = false }
  }, [path])
  return url ? <img src={url} alt={alt} className={className} /> : <div className={`${className} bg-neutral-100`} />
}

function DomainPicker({ value, onChange, disabled }: { value: DomainId; onChange: (d: DomainId) => void; disabled?: boolean }) {
  return (
    <div>
      <span className="text-[14px] font-medium text-neutral-800">Save to</span>
      <div className="mt-1.5 flex gap-2" role="radiogroup">
        {DOMAINS.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={value === d.id} disabled={disabled} onClick={() => onChange(d.id)}
            className={`px-3 py-1.5 rounded-full text-[13px] border ${value === d.id ? 'border-primary-600 bg-primary-50 text-primary-800' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
            {d.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ErrorBox({ error, onRetry }: { error: { code: string; message: string }; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-[14px] text-neutral-800 flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
      <p className="flex-1">{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-[13px] font-medium text-danger-700 flex items-center gap-1 shrink-0">
          <RotateCcw className="w-3.5 h-3.5" />Try again
        </button>
      )}
    </div>
  )
}

function SourcePanel({ imp }: { imp: PaperImport }) {
  const [view, setView] = useState<'photos' | 'words'>('photos')
  const analysis = imp.analysis!
  const photos = groupPhotos(imp.images)
  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-1 text-[13px]">
        {(['photos', 'words'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`px-3 py-1 rounded-full ${view === v ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
            {v === 'photos' ? 'Photos' : 'As written'}
          </button>
        ))}
      </div>
      {view === 'photos' ? (
        photos.map((ph) => (
          <a key={ph.n} href="#" onClick={(e) => e.preventDefault()} className="block rounded-xl overflow-hidden border border-neutral-200">
            <StorageImage path={ph.whole.path} alt={`Photo ${ph.n}`} className="w-full h-auto" />
          </a>
        ))
      ) : (
        analysis.pages.map((p) => (
          <div key={p.page} className="rounded-xl border border-neutral-200 bg-bg-elevated p-3">
            <p className="text-[12px] uppercase tracking-wide text-neutral-500">{p.side !== 'single' ? `${p.side} page · ` : ''}{p.period.label}</p>
            <p className="font-display text-[16px] text-neutral-900 mb-2">{p.heading ?? 'Untitled page'}</p>
            <ol className="space-y-1 text-[14px] text-neutral-800">
              {p.lines.map((l) => (
                <li key={l.id} className={l.struck ? 'line-through text-neutral-400' : ''}>
                  {l.text}
                  {l.uncertain && <span className="ml-1.5 text-[12px] text-warning-700" title={l.uncertainty ?? undefined}>unsure{l.uncertainty ? `: ${l.uncertainty}` : ''}</span>}
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
    </div>
  )
}

function PlanPanel({ imp, context, disabled, onEdit, onInclude }: {
  imp: PaperImport
  context: PlanContext
  disabled: boolean
  onEdit: (id: string, patch: Partial<Item>) => void
  onInclude: (id: string, on: boolean) => void
}) {
  const analysis = imp.analysis!
  const labelOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of analysis.items) m.set(i.id, i.title)
    for (const g of context.yearGoals) m.set(g.id, g.title)
    for (const g of context.periodGoals) m.set(g.id, g.title)
    for (const t of context.openTasks) m.set(t.id, t.title)
    for (const r of context.routines) m.set(r.id, r.title)
    return m
  }, [analysis.items, context])
  const pages = analysis.pages.length ? analysis.pages : [{ page: 1, heading: null, period: { label: '' } } as unknown as Analysis['pages'][number]]

  return (
    <div className={`p-4 space-y-6 ${disabled ? 'opacity-60 pointer-events-none' : ''}`} aria-busy={disabled}>
      {analysis.summary && <p className="text-[14px] text-neutral-600">{analysis.summary}</p>}
      {analysis.questions.length > 0 && (
        <div className="rounded-xl border border-review-200 bg-review-50 px-4 py-3">
          <p className="text-[13px] font-medium text-neutral-800 mb-1 flex items-center gap-1.5"><MessageSquare className="w-4 h-4" />Questions — answer them in the chat</p>
          <ul className="list-disc pl-5 text-[13px] text-neutral-700 space-y-0.5">{analysis.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      )}
      {pages.map((p) => {
        const items = analysis.items.filter((i) => (analysis.pages.length ? i.page === p.page : true))
        if (!items.length) return null
        return (
          <section key={p.page}>
            <h3 className="font-display text-[18px] text-neutral-900">{p.heading ?? 'Page'}</h3>
            {p.period.label && <p className="text-[12px] text-neutral-500 mb-2">{p.period.label}</p>}
            {KIND_ORDER.map((kind) => {
              const group = items.filter((i) => i.kind === kind)
              if (!group.length) return null
              return (
                <div key={kind} className="mb-3">
                  <p className="text-[12px] uppercase tracking-wide text-neutral-500 mb-1">{KIND_LABEL[kind]}s</p>
                  <ul className="space-y-2">
                    {group.map((item) => (
                      <ItemRow key={item.id} item={item} included={imp.include[item.id] !== false} labelOf={labelOf}
                        analysis={analysis} context={context} onEdit={onEdit} onInclude={onInclude} />
                    ))}
                  </ul>
                </div>
              )
            })}
          </section>
        )
      })}
      {/* Items the reader tied to no page still show. */}
      {analysis.pages.length > 0 && analysis.items.some((i) => !analysis.pages.some((p) => p.page === i.page)) && (
        <section>
          <h3 className="font-display text-[18px] text-neutral-900 mb-2">Other</h3>
          <ul className="space-y-2">
            {analysis.items.filter((i) => !analysis.pages.some((p) => p.page === i.page)).map((item) => (
              <ItemRow key={item.id} item={item} included={imp.include[item.id] !== false} labelOf={labelOf}
                analysis={analysis} context={context} onEdit={onEdit} onInclude={onInclude} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const REL_LABEL = { derived_from: 'From', supports: 'Serves', part_of: 'Part of' } as const
const FLAG_LABEL = { uncertain_handwriting: 'Unsure reading', uncertain_date: 'Unsure date', possible_duplicate: 'Possible duplicate', ambiguous_kind: 'Goal or task?' } as const

function ItemRow({ item, included, labelOf, analysis, context, onEdit, onInclude }: {
  item: Item
  included: boolean
  labelOf: Map<string, string>
  analysis: Analysis
  context: PlanContext
  onEdit: (id: string, patch: Partial<Item>) => void
  onInclude: (id: string, on: boolean) => void
}) {
  const levels: Level[] = item.kind === 'note' ? ['none'] : item.kind === 'goal' ? ['year', 'season', 'month'] : ['season', 'month', 'week', 'someday', 'year', 'none']
  return (
    <li className={`rounded-xl border px-3 py-2.5 ${included ? 'border-neutral-200 bg-bg-elevated' : 'border-dashed border-neutral-200 bg-transparent opacity-60'}`}>
      <div className="flex items-start gap-2.5">
        <input type="checkbox" checked={included} onChange={(e) => onInclude(item.id, e.target.checked)}
          aria-label={included ? `Leave out “${item.title}”` : `Keep “${item.title}”`} className="mt-1.5 w-4 h-4 accent-primary-600" />
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Wraps instead of cutting a long line off on a phone. */}
          <textarea value={item.title} onChange={(e) => onEdit(item.id, { title: e.target.value.replace(/\n/g, ' ') })} aria-label="Title" rows={1}
            className="w-full resize-none [field-sizing:content] bg-transparent text-[15px] leading-snug text-neutral-900 border-b border-transparent focus:border-neutral-300 outline-none" />
          {item.title !== item.original && <p className="text-[12px] text-neutral-500">On paper: “{item.original}”</p>}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <select value={item.kind} aria-label="Kind" onChange={(e) => {
              const kind = e.target.value as ItemKind
              const level: Level = kind === 'note' ? 'none' : kind === 'goal' && !['year', 'season', 'month'].includes(item.placement.level) ? 'season' : item.placement.level
              onEdit(item.id, { kind, placement: level === item.placement.level ? item.placement : placementFor(level, analysis, context) })
            }} className="rounded-full border border-neutral-200 bg-bg-elevated px-2 py-0.5 text-neutral-700">
              {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            {item.kind !== 'note' && (
              <select value={item.placement.level} aria-label="List" onChange={(e) => onEdit(item.id, { placement: placementFor(e.target.value as Level, analysis, context) })}
                className="rounded-full border border-neutral-200 bg-bg-elevated px-2 py-0.5 text-neutral-700">
                {levels.map((l) => <option key={l} value={l}>{l === item.placement.level && item.placement.label ? item.placement.label : LEVEL_LABEL[l]}</option>)}
              </select>
            )}
            {item.date_text && <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">Date on page: {item.date_text}</span>}
            {item.relationships.map((r, i) => (
              <span key={i} title={r.reason} className="px-2 py-0.5 rounded-full bg-sage-50 text-sage-800 flex items-center gap-1 max-w-full">
                <Link2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{REL_LABEL[r.type]} {labelOf.get(r.target_id) ?? r.target_label}</span>
                <button type="button" aria-label="Remove link" onClick={() => onEdit(item.id, { relationships: item.relationships.filter((_, j) => j !== i) })}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {item.flags.map((f, i) => (
              <span key={`f${i}`} title={f.detail} className="px-2 py-0.5 rounded-full bg-warning-50 text-warning-800 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{FLAG_LABEL[f.type]}{f.type === 'possible_duplicate' && f.target_id && labelOf.get(f.target_id) ? `: ${labelOf.get(f.target_id)}` : ''}
              </span>
            ))}
          </div>
          {item.routine && (item.routine.cadence || item.routine.steps.length > 0) && (
            <p className="text-[12px] text-neutral-500">
              {[item.routine.cadence, item.routine.time, item.routine.who].filter(Boolean).join(' · ')}
              {item.routine.steps.length > 0 && ` — ${item.routine.steps.join('; ')}`}
            </p>
          )}
          {item.flags.some((f) => f.detail) && (
            <p className="text-[12px] text-warning-800">{item.flags.map((f) => f.detail).filter(Boolean).join(' ')}</p>
          )}
        </div>
      </div>
    </li>
  )
}

function ChatPanel({ imp, draft, onDraft, onSend, revising, className }: {
  imp: PaperImport
  draft: string
  onDraft: (s: string) => void
  onSend: () => void
  revising: boolean
  className?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [imp.chat.length, revising])
  return (
    <div className={`${className ?? ''} flex-col min-h-0 border-t border-neutral-200 bg-bg-panel`}>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
        {imp.chat.length === 0 && !revising && (
          <p className="text-[13px] text-neutral-500">
            Talk it through: “the second line is a goal, not a task”, “move the chore chart to this month”, “that word is ‘bench’”.
            Changes show up in the plan; nothing is saved until you approve.
          </p>
        )}
        {imp.chat.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[14px] ${t.role === 'user' ? 'bg-primary-600 text-white' : 'bg-bg-elevated border border-neutral-200 text-neutral-800'}`}>
              <p className="whitespace-pre-wrap">{t.text}</p>
              {t.changes && t.changes.length > 0 && (
                <ul className="mt-1.5 text-[12px] text-neutral-600 list-disc pl-4 space-y-0.5">{t.changes.map((c, j) => <li key={j}>{c}</li>)}</ul>
              )}
            </div>
          </div>
        ))}
        {revising && <p className="text-[13px] text-neutral-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Updating the plan…</p>}
        <div ref={endRef} />
      </div>
      <form className="flex items-end gap-2 px-4 pb-3" onSubmit={(e) => { e.preventDefault(); onSend() }}>
        <textarea value={draft} onChange={(e) => onDraft(e.target.value)} rows={1} placeholder="Ask for a change…" aria-label="Message"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          className="flex-1 resize-none rounded-xl border border-neutral-200 bg-bg-elevated px-3 py-2 text-[14px] text-neutral-800 placeholder:text-neutral-400 max-h-32" />
        <button type="submit" disabled={!draft.trim() || revising} aria-label="Send" className="btn-primary w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}

function SummaryRow({ n, one, many }: { n: number; one: string; many: string }) {
  if (!n) return null
  return <li className="px-4 py-2.5">{n} {n === 1 ? one : many}</li>
}
