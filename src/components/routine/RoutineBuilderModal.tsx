// src/components/routine/RoutineBuilderModal.tsx
//
// The AI routine builder: paste instructions or drop a PDF/photo (a PT
// exercise sheet, a coach's plan), get ONE editable routine proposal —
// name, schedule, ordered steps with reps/details — and confirm to create
// the whole tree (parent + steps) with the source document attached.
// The invariant everywhere today: AI proposes, only your tap writes.
import { useState, useCallback, useRef } from 'react'
import { X, Sparkles, FileText, Trash2, Plus, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  parseRoutineProposal, scheduleSummary, createFromProposal, fileToBase64,
  type RoutineProposal,
} from '@/lib/routineImport'
import { useRoutines } from '@/hooks/useRoutines'
import { useAttachments } from '@/hooks/useAttachments'
import { useDomain } from '@/hooks/useDomain'

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp'
const MAX_BYTES = 5 * 1024 * 1024

export function RoutineBuilderModal({ onClose, onCreated }: {
  onClose: () => void
  /** Called with the new parent routine id so the host can open it. */
  onCreated: (routineId: string) => void
}) {
  const { addRoutine } = useRoutines()
  const { uploadAttachment } = useAttachments()
  const { currentDomain } = useDomain()
  const fileRef = useRef<HTMLInputElement>(null)

  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<'input' | 'thinking' | 'preview' | 'creating'>('input')
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<RoutineProposal | null>(null)
  const [note, setNote] = useState('')

  const propose = useCallback(async () => {
    if (!text.trim() && !file) return
    setPhase('thinking'); setError(null)
    try {
      const body: Record<string, unknown> = { text: text.trim() || undefined }
      if (file) {
        if (file.size > MAX_BYTES) throw new Error('File is over 5MB — try a photo of the sheet instead.')
        body.file = { mediaType: file.type, base64: await fileToBase64(file) }
      }
      const { data, error: fnError } = await supabase.functions.invoke('routine-from-doc', { body })
      if (fnError) throw new Error(fnError.message)
      const parsed = data?.proposal ? parseRoutineProposal(data.proposal) : null
      if (!parsed) {
        setError(data?.note || "Couldn't find a routine in that — try adding a line about what it is and how often.")
        setPhase('input')
        return
      }
      setProposal(parsed)
      setNote(typeof data.note === 'string' ? data.note : '')
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The builder is offline — you can still create the routine by hand.')
      setPhase('input')
    }
  }, [text, file])

  const create = useCallback(async () => {
    if (!proposal || proposal.steps.length === 0) return
    setPhase('creating'); setError(null)
    const ctx = currentDomain !== 'universal' ? currentDomain : undefined
    const parentId = await createFromProposal(proposal, addRoutine, ctx)
    if (!parentId) {
      setError('Creating the routine failed — nothing was saved.')
      setPhase('preview')
      return
    }
    // Source document rides along on the parent, where the panels show it.
    if (file) await uploadAttachment('routine', parentId, file)
    onCreated(parentId)
  }, [proposal, currentDomain, addRoutine, file, uploadAttachment, onCreated])

  const patchStep = (i: number, name: string) =>
    setProposal((p) => p && { ...p, steps: p.steps.map((s, j) => (j === i ? { ...s, name } : s)) })
  const removeStep = (i: number) =>
    setProposal((p) => p && { ...p, steps: p.steps.filter((_, j) => j !== i) })
  const addStep = () =>
    setProposal((p) => p && { ...p, steps: [...p.steps, { name: '' }] })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-5"
        role="dialog" aria-label="Build routine with AI" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl text-neutral-800 inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" /> Build a routine
          </h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase === 'input' || phase === 'thinking' ? (
          <>
            <p className="text-sm text-neutral-500 mb-3">
              Paste instructions or drop the document — a PT sheet, a workout plan, a med schedule.
              You'll review everything before anything is created.
            </p>
            <textarea value={text} onChange={(e) => setText(e.target.value)}
              placeholder="e.g. paste your therapist's email, or describe it: shoulder exercises every morning — pendulums 2×10, wall slides 3×12…"
              className="w-full min-h-[110px] text-sm border border-neutral-200 rounded-xl p-3 focus:outline-none focus:border-primary-400 mb-2"
            />
            <div className="flex items-center gap-2 mb-3">
              <input ref={fileRef} type="file" accept={ACCEPT} className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:border-neutral-300">
                <FileText className="w-3.5 h-3.5" /> {file ? file.name : 'Attach PDF or photo'}
              </button>
              {file && (
                <button type="button" onClick={() => setFile(null)} aria-label="Remove file"
                  className="text-xs text-neutral-400 hover:text-neutral-600">✕</button>
              )}
            </div>
            {error && <p className="text-xs text-amber-700 mb-3">{error}</p>}
            <button type="button" onClick={propose} disabled={phase === 'thinking' || (!text.trim() && !file)}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 transition-colors">
              {phase === 'thinking'
                ? (<><Loader2 className="w-4 h-4 animate-spin" /> Reading it…</>)
                : (<><Sparkles className="w-4 h-4" /> Propose the routine</>)}
            </button>
          </>
        ) : proposal && (
          <>
            <input value={proposal.name} aria-label="Routine name"
              onChange={(e) => setProposal({ ...proposal, name: e.target.value })}
              className="w-full font-display text-lg text-neutral-800 border-b border-neutral-200 focus:border-primary-400 focus:outline-none pb-1 mb-2"
            />
            <p className="text-xs text-neutral-500 mb-3">{scheduleSummary(proposal)} <span className="text-neutral-300">· editable after create</span></p>
            {note && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">⚠ {note}</p>}

            <div className="text-[11px] font-bold tracking-wider uppercase text-neutral-400 mb-1.5">Steps — edit before creating</div>
            <ul className="space-y-1.5 mb-2">
              {proposal.steps.map((s, i) => (
                <li key={i} className="rounded-lg border border-neutral-200 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <input value={s.name} aria-label={`Step ${i + 1} name`}
                      onChange={(e) => patchStep(i, e.target.value)}
                      className="flex-1 min-w-0 text-sm text-neutral-800 focus:outline-none"
                    />
                    <button type="button" onClick={() => removeStep(i)} aria-label={`Remove step ${i + 1}`}
                      className="p-1 rounded text-neutral-300 hover:text-rose-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {s.detail && <p className="text-xs text-neutral-500 mt-0.5">{s.detail}</p>}
                </li>
              ))}
            </ul>
            <button type="button" onClick={addStep}
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-primary-700 mb-4">
              <Plus className="w-3 h-3" /> Add step
            </button>

            {error && <p className="text-xs text-amber-700 mb-3">{error}</p>}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPhase('input')}
                className="text-sm font-medium px-3 py-2.5 rounded-xl text-neutral-500 hover:bg-neutral-100">
                Back
              </button>
              <button type="button" onClick={create}
                disabled={phase === 'creating' || proposal.steps.length === 0 || proposal.steps.some((s) => !s.name.trim()) || !proposal.name.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 transition-colors">
                {phase === 'creating'
                  ? (<><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>)
                  : (<>Create routine — {proposal.steps.length} step{proposal.steps.length === 1 ? '' : 's'}{file ? ' + attach source' : ''}</>)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
