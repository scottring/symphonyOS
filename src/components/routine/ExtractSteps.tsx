// "Extract steps" — the glue between a document attached to a routine and
// the routine's actual steps. Finds the first parseable attachment (PDF or
// photo), runs it through the routine-from-doc edge fn, and proposes the
// steps for THIS routine: reps verbatim, nothing invented, nothing written
// until you tap Add. Closes the loop of "I attached my PT sheet and nothing
// happened."
import { useEffect, useState } from 'react'
import { Sparkles, Loader2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAttachments } from '@/hooks/useAttachments'
import { parseRoutineProposal, type StepProposal } from '@/lib/routineImport'
import type { Routine } from '@/types/actionable'

const PARSEABLE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_BYTES = 5 * 1024 * 1024

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function ExtractSteps({ routine, onAddSteps }: {
  routine: Routine
  /** Batch-create steps under this routine (name + instructions), in order. */
  onAddSteps: (steps: { name: string; detail?: string }[]) => Promise<unknown> | void
}) {
  const { getAttachments, fetchAttachments, getSignedUrl } = useAttachments()
  const [phase, setPhase] = useState<'idle' | 'reading' | 'preview' | 'adding' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepProposal[]>([])

  useEffect(() => {
    fetchAttachments('routine', routine.id)
  }, [routine.id, fetchAttachments])

  const doc = getAttachments('routine', routine.id).find((a) => PARSEABLE.has(a.fileType))
  if (!doc || phase === 'done') {
    return phase === 'done'
      ? <p className="text-xs text-primary-700 mb-3">✓ Steps added — they're listed on this routine now.</p>
      : null
  }

  const extract = async () => {
    setPhase('reading'); setError(null)
    try {
      if (doc.fileSize > MAX_BYTES) throw new Error('Document is over 5MB — too large to parse.')
      const url = await getSignedUrl(doc.storagePath)
      if (!url) throw new Error('Could not read the document from storage.')
      const blob = await (await fetch(url)).blob()
      const { data, error: fnError } = await supabase.functions.invoke('routine-from-doc', {
        body: { file: { mediaType: doc.fileType, base64: await blobToBase64(blob) } },
      })
      if (fnError) throw new Error(fnError.message)
      const proposal = data?.proposal ? parseRoutineProposal(data.proposal) : null
      if (!proposal || proposal.steps.length === 0) {
        setError(data?.note || "Couldn't find steps in that document.")
        setPhase('idle')
        return
      }
      setSteps(proposal.steps)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction is offline — you can still add steps by hand.')
      setPhase('idle')
    }
  }

  const addAll = async () => {
    setPhase('adding')
    await onAddSteps(steps.map((s) => ({ name: s.name, detail: s.detail })))
    setPhase('done')
  }

  return (
    <div className="mb-3">
      {phase === 'idle' || phase === 'reading' ? (
        <>
          <button type="button" onClick={extract} disabled={phase === 'reading'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800 disabled:opacity-60">
            {phase === 'reading'
              ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading {doc.fileName}…</>)
              : (<><Sparkles className="w-3.5 h-3.5 text-amber-500" /> Extract steps from {doc.fileName}</>)}
          </button>
          {error && <p className="text-xs text-amber-700 mt-1">{error}</p>}
        </>
      ) : (
        <div className="rounded-xl border border-neutral-200 p-3">
          <p className="text-xs font-bold tracking-wider uppercase text-neutral-400 mb-2">
            Found {steps.length} step{steps.length === 1 ? '' : 's'} — nothing is added until you say so
          </p>
          <ul className="space-y-1.5 mb-3">
            {steps.map((s, i) => (
              <li key={i} className="text-sm text-neutral-800">
                {s.name}
                {s.detail && <span className="block text-xs text-neutral-500">{s.detail}</span>}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button type="button" onClick={addAll} disabled={phase === 'adding'}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60">
              {phase === 'adding'
                ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding…</>)
                : (<><Plus className="w-3.5 h-3.5" /> Add {steps.length} steps</>)}
            </button>
            <button type="button" onClick={() => setPhase('idle')}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-700 px-2 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
