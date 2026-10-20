// "Photo of a school paper" (spec 2026-10-20-school-papers-on-the-wall-design.md).
// Take a photo → Claude reads it → one confirm card → Save. The paper lands on
// the wall already claimed by whoever took the photo (they are holding it). If
// it is a paper the digest already put on the wall, that one is claimed
// instead of adding a second.
import { useEffect, useState } from 'react'
import { Camera, FileText, X } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'
import { supabase } from '@/lib/supabase'
import { readSchoolPaper } from '@/lib/paperPlan/api'
import { prepareImages } from '@/lib/paperPlan/images'
import { loadOpenPapers, matchOpenPaper, saveSchoolPaper, uploadPaperPhoto } from '@/lib/paperPlan/schoolPaper'
import type { SchoolPaperRead } from '../../../supabase/functions/plan-from-paper/lib/plan'

interface Props {
  userId: string
  /** The signed-in person's family member: they took the photo, they have it. */
  holderId: string
  kids: FamilyMember[]
  onClose: () => void
  /** YYYY-MM-DD, the phone's local day. */
  today: string
}

type Step =
  | { kind: 'photo' }
  | { kind: 'reading' }
  | { kind: 'confirm'; photo: Blob; read: SchoolPaperRead; open: Task[] }
  | { kind: 'saved'; photoAttached: boolean }

export function SchoolPaperCapture({ userId, holderId, kids, onClose, today }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'photo' })
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [money, setMoney] = useState('')
  const [kidIds, setKidIds] = useState<string[]>([])
  const [different, setDifferent] = useState(false)
  const [saving, setSaving] = useState(false)

  async function onPhoto(file: File | undefined) {
    if (!file) return
    setError(null)
    setStep({ kind: 'reading' })
    try {
      const [whole] = await prepareImages(file)
      const photo = whole?.blob ?? file
      const path = await uploadPaperPhoto(userId, photo)
      if (!path) throw new Error('upload')
      const [{ paper }, open] = await Promise.all([
        readSchoolPaper([path], {
          today, year: Number(today.slice(0, 4)), seasons: [], yearGoals: [], periodGoals: [], openTasks: [], routines: [],
          members: kids.map((k) => ({ id: k.id, name: k.name, role: 'child' })),
        }),
        loadOpenPapers(),
      ])
      if (!paper) {
        setError('Couldn’t read a school paper in that photo. Try again in better light, or closer.')
        setStep({ kind: 'photo' })
        return
      }
      setTitle(paper.title)
      setDue(paper.due ?? '')
      setMoney(paper.money ?? '')
      // A named child is preselected; a paper for "everyone" asks whose copy this is.
      setKidIds(paper.for === 'everyone' ? [] : kids.filter((k) => (paper.for as string[]).some((n) => n.toLowerCase() === k.name.split(' ')[0].toLowerCase())).map((k) => k.id))
      setDifferent(false)
      setStep({ kind: 'confirm', photo, read: paper, open })
    } catch {
      setError('The photo didn’t go through. Check your connection and try again.')
      setStep({ kind: 'photo' })
    }
  }

  const matches = step.kind === 'confirm' && !different
    ? kidIds.map((id) => ({ id, task: matchOpenPaper({ title: step.read.title, due: step.read.due }, step.open, id) })).filter((m) => m.task)
    : []

  async function save() {
    if (step.kind !== 'confirm' || kidIds.length === 0 || !title.trim()) return
    setSaving(true)
    const notes = ['Photographed', money && `Money: ${money}`, step.read.detail].filter(Boolean).join('\n\n')
    const results = await Promise.all(kidIds.map((kid) => saveSchoolPaper(supabase as never, {
      userId, kidIds: [kid], title: title.trim(), due: due || undefined, notes, holderId, photo: step.photo, today,
      existing: matches.find((m) => m.id === kid)?.task ?? undefined,
    })))
    setSaving(false)
    // A paper that saved is never saved again: the card closes even if its
    // photo didn't attach, rather than offering a Save that would duplicate it.
    if (results.some((r) => r.saved)) setStep({ kind: 'saved', photoAttached: results.every((r) => r.saved && r.photoAttached) })
    if (results.some((r) => !r.saved)) setError('Couldn’t save — try again.')
  }

  useEffect(() => {
    if (step.kind !== 'saved') return
    const t = setTimeout(onClose, step.photoAttached ? 1200 : 3500)
    return () => clearTimeout(t)
  }, [step, onClose])

  const toggleKid = (id: string) => setKidIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" role="dialog" aria-label="Photo of a school paper">
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl text-neutral-900"><FileText className="h-5 w-5 text-primary-600" />School paper</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full hover:bg-neutral-100"><X className="h-5 w-5" /></button>
        </div>

        {error && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>}

        {step.kind === 'photo' && (
          <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 text-neutral-600">
            <Camera className="h-7 w-7 text-primary-600" />
            <span className="text-sm font-medium">Take a photo of the paper</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo of the paper"
              onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
        )}

        {step.kind === 'reading' && <p className="py-10 text-center text-sm text-neutral-600">Reading the paper…</p>}

        {step.kind === 'confirm' && (
          <div className="flex flex-col gap-3">
            {matches.length > 0 && (
              <div className="rounded-xl bg-primary-50 px-3 py-2 text-sm text-neutral-800">
                <div className="font-semibold">Already on the wall:</div>
                {matches.map((m) => (
                  <div key={m.id}>
                    {kids.find((k) => k.id === m.id)?.name}’s: {m.task!.title}{m.task!.neededOn ? `, due ${m.task!.neededOn.toLocaleDateString('en-US', { weekday: 'short' })}` : ''}
                  </div>
                ))}
                <button type="button" onClick={() => setDifferent(true)} className="mt-1 font-semibold text-primary-700 underline">It’s a different paper</button>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Whose paper?</div>
              <div className="flex gap-2">
                {kids.map((k) => (
                  <button key={k.id} type="button" aria-pressed={kidIds.includes(k.id)} onClick={() => toggleKid(k.id)}
                    className={`min-h-[44px] rounded-full px-4 text-sm font-semibold ${kidIds.includes(k.id) ? 'bg-primary-600 text-white' : 'border border-neutral-300 text-neutral-700'}`}>
                    {k.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-sm text-neutral-700">Paper
              <input aria-label="Paper" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-base" />
            </label>
            <div className="flex gap-3">
              <label className="flex-1 text-sm text-neutral-700">Due
                <input aria-label="Due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-base" />
              </label>
              <label className="w-28 text-sm text-neutral-700">Money
                <input aria-label="Money" value={money} onChange={(e) => setMoney(e.target.value)} placeholder="—" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-base" />
              </label>
            </div>
            <button type="button" onClick={() => void save()} disabled={saving || kidIds.length === 0 || !title.trim()}
              className="mt-1 min-h-[48px] rounded-xl bg-primary-600 font-semibold text-white disabled:opacity-40">
              Save
            </button>
            <p className="text-center text-xs text-neutral-500">It goes on the wall as yours — you have it.</p>
          </div>
        )}

        {step.kind === 'saved' && (
          <div className="py-10 text-center text-sm">
            <p className="font-semibold text-neutral-800">On the wall.</p>
            {!step.photoAttached && <p className="mt-1 text-neutral-600">The photo didn’t attach — the paper is saved without it.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
