// src/components/canvas/prep/ReadinessSection.tsx
//
// "What you'll need" — the top of a task's details. Every resource the task
// carries, each with the tool that uses it (Call, Message, Directions, Open, a
// step's checkbox), then what the broader plan above it carries ("From
// October: Back to school"), read in place and never copied down.
//
// Nothing is demanded: a kind the task doesn't carry is not listed, only
// offered as one quiet chip that opens the panel's existing editor for it.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Phone, Mail, MapPin, Link as LinkIcon, FileText, ListChecks, StickyNote, Sparkles } from 'lucide-react'
import type { Task, TaskLink } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Contact } from '@/types/contact'
import { listAttachments, type Attachment } from '@/lib/taskAttachments'
import { useAssistantLauncher } from '@/contexts/AssistantLaunchContext'
import { readinessOf, notesExcerpt, type InheritedResources, type ReadinessKind } from '@/lib/prep/readiness'

/** The panel's existing editors a chip can open. */
export type PrepField = 'person' | 'link' | 'location' | 'notes' | 'subtask' | 'photo'

const ADD_CHIPS: { kind: ReadinessKind; field: PrepField; label: string }[] = [
  { kind: 'contact', field: 'person', label: '+ Contact' },
  { kind: 'link', field: 'link', label: '+ Link' },
  { kind: 'place', field: 'location', label: '+ Place' },
  { kind: 'notes', field: 'notes', label: '+ Note' },
  { kind: 'steps', field: 'subtask', label: '+ Supplies or steps' },
  { kind: 'file', field: 'photo', label: '+ File' },
]

export const ASK_WHAT_I_NEED = 'What will I need when I come to do this?'

const STEP_PREVIEW = 4

const linkLabel = (l: TaskLink) => {
  if (l.title?.trim()) return l.title.trim()
  try { return new URL(l.url).hostname.replace(/^www\./, '') } catch { return l.url }
}
const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`
const smsHref = (n: string) => `sms:${n.replace(/[^\d+]/g, '')}`

export interface ReadinessSectionProps {
  task: Task
  /** Loaded tasks (already filtered for the reader); the plan above is read from these. */
  allTasks: Task[]
  goals?: Goal[]
  contacts: Contact[]
  /** The task's own files, as the Photos & files section loaded them. */
  files: Attachment[]
  onToggleStep: (id: string) => void
  onOpenTask: (id: string) => void
  onDirections: () => void
  /** Open the panel's existing editor for a field. */
  onAdd: (field: PrepField) => void
  /** Editors already opened below; their chips are not offered again. */
  opened?: ReadonlySet<string>
}

export function ReadinessSection(p: ReadinessSectionProps) {
  const { task } = p
  const { openAssistant } = useAssistantLauncher()
  const [notesOpen, setNotesOpen] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)

  const byId = useMemo(() => {
    const m = new Map<string, Task>()
    for (const t of p.allTasks) { m.set(t.id, t); for (const s of t.subtasks ?? []) if (!m.has(s.id)) m.set(s.id, s) }
    return m
  }, [p.allTasks])
  const contactsById = useMemo(() => new Map(p.contacts.map((c) => [c.id, c])), [p.contacts])
  const goalsById = useMemo(() => new Map((p.goals ?? []).map((g) => [g.id, g])), [p.goals])

  // Files on the plan above (read-only, for counts and Open).
  const ancestorIds = readinessOf(task, { task: (id) => byId.get(id) }).inherited.filter((r) => r.entity === 'task').map((r) => r.id)
  const [ancestorFiles, setAncestorFiles] = useState<Record<string, Attachment[]>>({})
  const ancestorKey = ancestorIds.join('|')
  useEffect(() => {
    let live = true
    const ids = ancestorKey ? ancestorKey.split('|') : []
    void Promise.all(ids.map(async (id) => [id, await listAttachments('task', id).catch(() => [])] as const))
      .then((pairs) => { if (live) setAncestorFiles(Object.fromEntries(pairs)) })
    return () => { live = false }
  }, [ancestorKey])

  const readiness = readinessOf(task, {
    task: (id) => byId.get(id),
    goal: (id) => goalsById.get(id),
    files: (id) => id === task.id ? p.files.length : ancestorFiles[id]?.length,
    contactVisible: (id) => contactsById.has(id),
  })
  const has = new Set(readiness.kinds)
  const contact = task.contactId ? contactsById.get(task.contactId) : undefined
  const ownPhone = task.phoneNumber?.trim()
  const showPhone = has.has('phone') && ownPhone !== contact?.phone?.trim()
  const missing = ADD_CHIPS.filter((c) => !has.has(c.kind) && !p.opened?.has(c.field))
  const steps = task.subtasks ?? []
  const shownSteps = stepsOpen ? steps : steps.slice(0, STEP_PREVIEW)
  const notes = task.notes?.trim() ? notesExcerpt(task.notes) : null

  return <section className="prep" aria-label="What you’ll need">
    <div className="prep-head">
      <h3 className="prep-title">What you’ll need</h3>
      <button type="button" className="canvas-link prep-ask" onClick={() => openAssistant({ message: ASK_WHAT_I_NEED, autoSend: true })}>
        <Sparkles size={14} aria-hidden="true" />Ask what I’ll need
      </button>
    </div>

    {readiness.kinds.length > 0 && <ul className="prep-list">
      {contact && <li className="canvas-item prep-row" data-kind="contact">
        <User size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{contact.name}</span>
        <span className="prep-tools">
          {contact.phone && <a className="canvas-link" href={telHref(contact.phone)} aria-label={`Call ${contact.name}`}>Call</a>}
          {contact.phone && <a className="canvas-link" href={smsHref(contact.phone)} aria-label={`Message ${contact.name}`}>Message</a>}
          {contact.email && <a className="canvas-link" href={`mailto:${contact.email}`} aria-label={`Email ${contact.name}`}>Email</a>}
        </span>
      </li>}
      {showPhone && ownPhone && <li className="canvas-item prep-row" data-kind="phone">
        <Phone size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{ownPhone}</span>
        <span className="prep-tools">
          <a className="canvas-link" href={telHref(ownPhone)} aria-label={`Call ${ownPhone}`}>Call</a>
          <a className="canvas-link" href={smsHref(ownPhone)} aria-label={`Message ${ownPhone}`}>Message</a>
        </span>
      </li>}
      {has.has('email') && task.email && task.email.trim() !== contact?.email?.trim() && <li className="canvas-item prep-row" data-kind="email">
        <Mail size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{task.email}</span>
        <span className="prep-tools"><a className="canvas-link" href={`mailto:${task.email.trim()}`} aria-label={`Email ${task.email.trim()}`}>Email</a></span>
      </li>}
      {has.has('place') && <li className="canvas-item prep-row" data-kind="place">
        <MapPin size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{task.location || 'Saved place'}</span>
        <span className="prep-tools"><button type="button" className="canvas-link" onClick={p.onDirections}>Directions</button></span>
      </li>}
      {(task.links ?? []).map((l) => <li key={l.url} className="canvas-item prep-row" data-kind="link">
        <LinkIcon size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{linkLabel(l)}</span>
        <span className="prep-tools"><a className="canvas-link" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${linkLabel(l)}`}>Open</a></span>
      </li>)}
      {p.files.map((f) => <li key={f.id} className="canvas-item prep-row" data-kind="file">
        <FileText size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{f.documentLabel || f.fileName}</span>
        <span className="prep-tools"><a className="canvas-link" href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.documentLabel || f.fileName}`}>Open</a></span>
      </li>)}
      {steps.length > 0 && <li className="prep-block" data-kind="steps">
        <div className="canvas-item prep-row">
          <ListChecks size={14} aria-hidden="true" className="prep-icon" />
          <span className="canvas-item-title">Steps & supplies</span>
          <span className="canvas-item-meta">{readiness.steps.done} of {readiness.steps.total}</span>
        </div>
        <ul className="prep-steps" aria-label="Steps and supplies">
          {shownSteps.map((s) => <li key={s.id}>
            <label className={s.completed ? 'is-done' : undefined}>
              <input type="checkbox" checked={!!s.completed} onChange={() => p.onToggleStep(s.id)} />
              <span>{s.title}</span>
            </label>
          </li>)}
        </ul>
        {steps.length > STEP_PREVIEW && <button type="button" className="canvas-link" onClick={() => setStepsOpen((o) => !o)}>
          {stepsOpen ? 'Show fewer' : `Show all ${steps.length}`}
        </button>}
      </li>}
      {notes && <li className="prep-block" data-kind="notes">
        <div className="canvas-item prep-row">
          <StickyNote size={14} aria-hidden="true" className="prep-icon" />
          <span className="canvas-item-title prep-notes">{notesOpen ? task.notes!.trim() : notes.text}</span>
          {notes.more && <button type="button" className="canvas-link" aria-expanded={notesOpen} onClick={() => setNotesOpen((o) => !o)}>{notesOpen ? 'Less' : 'More'}</button>}
        </div>
      </li>}
    </ul>}

    {missing.length > 0 && <div className="prep-add" role="group" aria-label="Add what you’ll need">
      {missing.map((c) => <button key={c.field} type="button" className="canvas-chip" onClick={() => p.onAdd(c.field)}>{c.label}</button>)}
    </div>}

    {readiness.inherited.map((r) => <FromPlan key={r.id} resources={r} contacts={contactsById} files={ancestorFiles[r.id] ?? []} onOpenTask={p.onOpenTask} />)}
  </section>
}

function FromPlan({ resources: r, contacts, files, onOpenTask }: { resources: InheritedResources; contacts: Map<string, Contact>; files: Attachment[]; onOpenTask: (id: string) => void }) {
  const contact = r.contactId ? contacts.get(r.contactId) : undefined
  const notes = r.notes ? notesExcerpt(r.notes) : null
  const open = r.steps.filter((s) => !s.completed)
  return <div className="prep-from" role="group" aria-label={`From ${r.title}`}>
    <p className="prep-from-head">
      From{' '}
      {r.entity === 'task'
        ? <button type="button" className="canvas-link" onClick={() => onOpenTask(r.id)}>{r.title}</button>
        : <Link className="canvas-link" to={`/year?view=constellation&horizon=0&focus=0:${r.id}`}>{r.title}</Link>}
    </p>
    <ul className="prep-list is-inherited">
      {contact && <li className="canvas-item prep-row">
        <User size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{contact.name}</span>
        {contact.phone && <span className="prep-tools"><a className="canvas-link" href={telHref(contact.phone)} aria-label={`Call ${contact.name}`}>Call</a></span>}
      </li>}
      {r.location && <li className="canvas-item prep-row">
        <MapPin size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{r.location}</span>
      </li>}
      {r.links.map((l) => <li key={l.url} className="canvas-item prep-row">
        <LinkIcon size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{linkLabel(l)}</span>
        <span className="prep-tools"><a className="canvas-link" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${linkLabel(l)}`}>Open</a></span>
      </li>)}
      {files.map((f) => <li key={f.id} className="canvas-item prep-row">
        <FileText size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{f.documentLabel || f.fileName}</span>
        <span className="prep-tools"><a className="canvas-link" href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.documentLabel || f.fileName}`}>Open</a></span>
      </li>)}
      {r.steps.length > 0 && <li className="canvas-item prep-row">
        <ListChecks size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title">{open.slice(0, 4).map((s) => s.title).join(', ') || 'All done'}{open.length > 4 ? '…' : ''}</span>
        <span className="canvas-item-meta">{open.length} of {r.steps.length} open</span>
      </li>}
      {notes && <li className="canvas-item prep-row">
        <StickyNote size={14} aria-hidden="true" className="prep-icon" />
        <span className="canvas-item-title prep-notes">{notes.text}{notes.more ? '…' : ''}</span>
      </li>}
    </ul>
  </div>
}
