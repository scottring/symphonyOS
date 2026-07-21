import { useMemo, useState } from 'react'
import { Star, CornerRightDown, Archive, Trash2, Repeat, ChevronRight, Sparkles, Check, RotateCw, Pencil } from 'lucide-react'
import { SeasonMoveSuggestions } from '@/components/planning/SeasonMoveSuggestions'
import { useBenchAudit } from '@/hooks/useBenchAudit'
import type { Task } from '@/types/task'
import { PICK_CAP } from '@/lib/planning/betPulse'

/** The bench: open quarter items that aren't picks. Every row can be promoted
 *  ("Pick it") — at the cap, promoting expands an inline swap picker so one
 *  gesture replaces a current pick. The other exits re-grade or retire.
 *  `collapsible` renders it as a closed drawer (season-spread bottom) —
 *  subordinate by interaction, not just by muting. */
export function OverflowTray({ items, picks, onPick, onSwap, onMakeMove, onShelf, onLetGo, onRename, onMakeGoal, onFirstMove, onShelfLinked, onApplySlate, collapsible = false }: {
  items: readonly Task[]
  /** Current picks, for the at-cap swap picker. */
  picks: readonly Task[]
  onPick: (id: string) => void
  /** Swap: benchId becomes a pick, replacedPickId returns to the bench. */
  onSwap: (benchId: string, replacedPickId: string) => void
  onMakeMove: (id: string) => void
  onShelf: (id: string) => void
  onLetGo: (id: string) => void
  /** Apply an audit rewrite: replace the item's title (user-confirmed). */
  onRename?: (id: string, title: string) => void
  /** Goal-sized verdicts: create a goal from this item; resolves to the new
   *  goal's id (null on failure). The row then prompts for the first move. */
  onMakeGoal?: (id: string, title: string) => Promise<string | null>
  /** Turn the original item INTO the goal's first season move. */
  onFirstMove?: (id: string, goalId: string, moveText: string) => void
  /** Skip the first move: shelf the item with the goal link stamped. */
  onShelfLinked?: (id: string, goalId: string) => void
  /** Apply the audit's recommended slate: these ids become the picks. */
  onApplySlate?: (ids: string[]) => void
  collapsible?: boolean
}) {
  const [swapFor, setSwapFor] = useState<string | null>(null)
  // Goal-conversion flow per row: taskId → created goalId (prompting for the
  // first move) ; moveDraft is the prompt's input.
  const [goalFlow, setGoalFlow] = useState<{ taskId: string; goalId: string } | null>(null)
  const [moveDraft, setMoveDraft] = useState('')
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const auditItems = useMemo(() => items.map((t) => ({ id: t.id, title: t.title })), [items])
  const auditPicks = useMemo(() => picks.map((t) => ({ id: t.id, title: t.title })), [picks])
  const { audit, reauditAll, results, slate, uncachedCount, loading: auditing, error: auditError } = useBenchAudit(auditItems, auditPicks)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const titleById = useMemo(() => new Map([...items, ...picks].map((t) => [t.id, t.title])), [items, picks])
  const [open, setOpen] = useState(!collapsible)
  if (items.length === 0) return null
  const atCap = picks.length >= PICK_CAP
  return (
    <section className="mt-10 pt-4 border-t border-neutral-200/70">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center gap-2 py-1 text-left group"
        >
          <ChevronRight aria-hidden="true" className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="text-sm font-medium text-neutral-500 group-hover:text-neutral-700 transition-colors">
            On the bench ({items.length})
          </span>
          {!open && (
            <span className="text-[12px] text-neutral-400">— waiting for a slot, a month, or a decision</span>
          )}
        </button>
      ) : (
        <h3 className="text-sm font-medium text-neutral-500">On the bench ({items.length})</h3>
      )}
      {!open ? null : (<>
      <div className="flex items-center gap-3 mt-0.5 mb-3">
        <p className="text-[12px] text-neutral-400">
          A season holds 5–8 picks. Pick one up, turn it into a month move, shelf it, or let it go.
        </p>
        <button type="button"
          onClick={() => void (uncachedCount > 0 ? audit() : reauditAll())}
          disabled={auditing}
          className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 transition-colors">
          <Sparkles aria-hidden="true" className="w-3 h-3" />
          {auditing ? 'Auditing…'
            : uncachedCount === 0 ? 'Re-audit'
            : results ? `Audit ${uncachedCount} new` : 'Audit the bench'}
        </button>
        {results && uncachedCount > 0 && (
          <button type="button" onClick={() => void reauditAll()} disabled={auditing}
            aria-label="Re-audit everything" title="Re-audit everything"
            className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-primary-600 disabled:opacity-50 transition-colors">
            <RotateCw aria-hidden="true" className="w-3 h-3" />
          </button>
        )}
      </div>
      {auditError && <p className="text-[11px] text-amber-700 mb-2">{auditError}</p>}
      {/* The audit's season-system read: its recommended slate across picks AND
          bench. One tap applies it (recommended become the picks, the rest
          bench); every id resolves to a live item or the button hides. */}
      {slate && (
        <div className="mb-3 rounded-xl border border-primary-100 bg-primary-50/30 px-4 py-3">
          <p className="text-[11px] font-medium tracking-wide uppercase text-primary-700 mb-1">Recommended slate ({slate.ids.length})</p>
          {slate.rationale && <p className="text-[12px] text-neutral-500 mb-2">{slate.rationale}</p>}
          <ol className="space-y-0.5 mb-2">
            {slate.ids.map((id, i) => (
              <li key={id} className="text-[12.5px] text-neutral-700">
                <span className="text-neutral-400 mr-1.5">{i + 1}.</span>
                {titleById.get(id) ?? '(no longer here)'}
                {picks.some((pk) => pk.id === id) && <span className="ml-1.5 text-[10px] text-primary-600">already picked</span>}
              </li>
            ))}
          </ol>
          {onApplySlate && (
            <button type="button"
              onClick={() => onApplySlate(slate.ids.filter((id) => titleById.has(id)))}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md text-white bg-primary-600 hover:bg-primary-700 transition-colors">
              <Star aria-hidden="true" className="w-3 h-3" /> Use this slate
            </button>
          )}
        </div>
      )}
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t.id} className="rounded-lg bg-neutral-50/80 border border-neutral-100 px-3 py-2">
            <div className="flex items-center gap-2">
              {editingId === t.id && onRename ? (
                <input type="text" autoFocus value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = editDraft.trim()
                      if (v && v !== t.title) onRename(t.id, v)
                      setEditingId(null)
                    }
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={() => {
                    const v = editDraft.trim()
                    if (v && v !== t.title) onRename(t.id, v)
                    setEditingId(null)
                  }}
                  className="flex-1 min-w-0 text-sm text-neutral-700 bg-white border border-primary-200 rounded-md px-2 py-1 focus:outline-none focus:border-primary-400"
                />
              ) : (
                <span className="flex-1 min-w-0 text-sm text-neutral-600 truncate">{t.title}</span>
              )}
              {onRename && editingId !== t.id && (
                <button type="button"
                  onClick={() => { setEditingId(t.id); setEditDraft(t.title) }}
                  aria-label="Edit title" title="Edit title"
                  className="shrink-0 p-1 rounded-md text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
                  <Pencil aria-hidden="true" className="w-3 h-3" />
                </button>
              )}
              <button type="button"
                onClick={() => (atCap ? setSwapFor(swapFor === t.id ? null : t.id) : onPick(t.id))}
                aria-expanded={atCap ? swapFor === t.id : undefined}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md text-white bg-primary-600 hover:bg-primary-700 transition-colors">
                <Star aria-hidden="true" className="w-3 h-3" /> Pick it
              </button>
              <button type="button" onClick={() => onMakeMove(t.id)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                <CornerRightDown aria-hidden="true" className="w-3 h-3" /> Month move
              </button>
              <button type="button" onClick={() => onShelf(t.id)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 transition-colors">
                <Archive aria-hidden="true" className="w-3 h-3" /> Shelf
              </button>
              <button type="button" onClick={() => onLetGo(t.id)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-neutral-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                <Trash2 aria-hidden="true" className="w-3 h-3" /> Let it go
              </button>
            </div>
            {/* Audit verdict — the season-grain read on this item, with the
                recommended exit named and any rewrite one tap from applying. */}
            {(() => {
              const v = results?.get(t.id)
              if (!v) return null
              const CHIP: Record<string, { label: string; cls: string }> = {
                ready: { label: 'season-ready', cls: 'text-primary-700 bg-primary-50' },
                rephrase: { label: 'rephrase', cls: 'text-amber-700 bg-amber-50' },
                month: { label: 'month-sized', cls: 'text-sky-700 bg-sky-50' },
                goal: { label: 'goal-sized', cls: 'text-violet-700 bg-violet-50' },
              }
              const chip = CHIP[v.verdict]
              return (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${chip.cls}`}>{chip.label}</span>
                  <span className="text-neutral-400">{v.reason}</span>
                  {v.verdict === 'rephrase' && v.suggestion && onRename && (
                    <button type="button"
                      onClick={() => onRename(t.id, v.suggestion as string)}
                      className="inline-flex items-center gap-1 font-medium text-primary-700 hover:text-primary-800 transition-colors">
                      <Check aria-hidden="true" className="w-3 h-3" /> Use "{v.suggestion}"
                    </button>
                  )}
                  {v.verdict === 'month' && (
                    <button type="button" onClick={() => onMakeMove(t.id)}
                      className="inline-flex items-center gap-1 font-medium text-sky-700 hover:text-sky-800 transition-colors">
                      <CornerRightDown aria-hidden="true" className="w-3 h-3" /> Make it a month move
                    </button>
                  )}
                  {v.verdict === 'goal' && onMakeGoal && (
                    <button type="button"
                      disabled={convertingId === t.id}
                      onClick={async () => {
                        setConvertingId(t.id)
                        const goalId = await onMakeGoal(t.id, t.title)
                        setConvertingId(null)
                        if (goalId) { setGoalFlow({ taskId: t.id, goalId }); setMoveDraft('') }
                      }}
                      className="inline-flex items-center gap-1 font-medium text-violet-700 hover:text-violet-800 disabled:opacity-50 transition-colors">
                      <Star aria-hidden="true" className="w-3 h-3" />
                      {convertingId === t.id ? 'Creating goal…' : 'Make it a goal'}
                    </button>
                  )}
                  {v.verdict === 'goal' && (
                    <button type="button" onClick={() => onShelf(t.id)}
                      className="inline-flex items-center gap-1 font-medium text-neutral-500 hover:text-neutral-700 transition-colors">
                      <Archive aria-hidden="true" className="w-3 h-3" /> Shelf it
                    </button>
                  )}
                  {/* The upgrade path — disagree with the demotion and keep it
                      at season level, with the audit's season-grade wording. */}
                  {(v.verdict === 'month' || v.verdict === 'goal') && v.seasonVersion && onRename && (
                    <button type="button"
                      onClick={() => onRename(t.id, v.seasonVersion as string)}
                      title="Keep it at season level with this wording"
                      className="inline-flex items-center gap-1 font-medium text-primary-700 hover:text-primary-800 transition-colors">
                      <Star aria-hidden="true" className="w-3 h-3" /> Season-size it: "{v.seasonVersion}"
                    </button>
                  )}
                </div>
              )
            })()}
            {/* Goal conversion step 2 — the goal exists; the item becomes its
                first season-sized move (or shelves, linked, if skipped). */}
            {goalFlow?.taskId === t.id && onFirstMove && onShelfLinked && (
              <div className="mt-2 rounded-md border border-violet-100 bg-violet-50/40 px-3 py-2">
                <p className="text-[11px] font-medium text-violet-800 mb-1.5">
                  Goal created. What's the first season-sized move on "{t.title}"?
                </p>
                <div className="flex items-center gap-2">
                  <input type="text" autoFocus value={moveDraft}
                    placeholder="An outcome finishable this season…"
                    onChange={(e) => setMoveDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && moveDraft.trim()) {
                        onFirstMove(t.id, goalFlow.goalId, moveDraft.trim()); setGoalFlow(null)
                      }
                      if (e.key === 'Escape') { onShelfLinked(t.id, goalFlow.goalId); setGoalFlow(null) }
                    }}
                    className="flex-1 min-w-0 text-sm bg-white border border-violet-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400"
                  />
                  <button type="button" disabled={!moveDraft.trim()}
                    onClick={() => { onFirstMove(t.id, goalFlow.goalId, moveDraft.trim()); setGoalFlow(null) }}
                    className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-md text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 transition-colors">
                    Make it the first move
                  </button>
                  <button type="button"
                    onClick={() => { onShelfLinked(t.id, goalFlow.goalId); setGoalFlow(null) }}
                    className="shrink-0 text-xs px-2 py-1.5 text-neutral-500 hover:text-neutral-700 transition-colors">
                    Shelf instead
                  </button>
                </div>
                <SeasonMoveSuggestions goalName={t.title} onPick={setMoveDraft} />
              </div>
            )}
            {/* At the cap, "Pick it" becomes a swap: choose which current pick
                this one replaces. One gesture, no orphaned ninth pick. */}
            {atCap && swapFor === t.id && (
              <div className="mt-2 rounded-md border border-primary-100 bg-primary-50/40 px-3 py-2">
                <p className="text-[11px] font-medium text-primary-800 mb-1.5 inline-flex items-center gap-1">
                  <Repeat aria-hidden="true" className="w-3 h-3" /> All {PICK_CAP} spots are taken — replace which pick?
                </p>
                <ul className="space-y-1">
                  {picks.map((p) => (
                    <li key={p.id}>
                      <button type="button"
                        onClick={() => { onSwap(t.id, p.id); setSwapFor(null) }}
                        className="w-full text-left text-[12px] text-neutral-700 truncate px-2 py-1 rounded hover:bg-white hover:text-primary-800 transition-colors">
                        {p.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
      </>)}
    </section>
  )
}
