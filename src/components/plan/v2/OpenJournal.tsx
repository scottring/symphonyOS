// src/components/plan/v2/OpenJournal.tsx
//
// Open journal (Scott chose it, 2026-10-08): a planning page laid out as
// sections, each line of the period above on the left — "This Fall: Garden
// beds ready" — and on the right what this period writes for it, with its own
// add box. The whole horizon is on one page; nothing drills one goal down to
// Today. Work for nothing above sits in its own general section. One onward
// step for the whole page, in the footer. On a phone each line stands above
// its entries.
//
// Layout only: the rows are the page's own (PlanLine on a month, the week's
// row on a week), so every existing control — done, people, area, when, ⋯,
// the month link — is the same as in the lists.

import { useId, useRef, type ReactNode } from 'react'
import { Check, Plus } from 'lucide-react'
import { useSafeAdd } from './useSafeAdd'

export interface JournalComposerProps {
  /** "What would move this forward in October?" */
  label: string
  placeholder: string
  /** Resolves false (or throws) when it did not store: the words stay.
   *  true — or nothing — counts as stored. Page adapters return an explicit
   *  boolean. */
  onAdd: (title: string) => Promise<boolean | void> | boolean | void
}

export function JournalComposer({ label, placeholder, onAdd, context }: JournalComposerProps & { context: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const box = useSafeAdd(onAdd, inputRef)
  return (
    <form className="oj-compose" onSubmit={(e) => { e.preventDefault(); void box.submit() }}>
      <label className="oj-compose-label" htmlFor={id}>{label}</label>
      <div className="oj-compose-row">
        {/* Typing is never blocked while a save runs; a second add waits for it. */}
        <input id={id} ref={inputRef} value={box.draft} onChange={(e) => box.setDraft(e.target.value)} placeholder={placeholder}
          aria-label={`${label} — ${context}`} aria-busy={box.saving || undefined} maxLength={300} autoComplete="off" />
        <button type="submit" className="oj-add" aria-label={box.saving ? `Adding to ${context}…` : `Add to ${context}`} aria-busy={box.saving || undefined}>
          {box.saving ? <span className="oj-add-busy" aria-hidden="true">…</span> : <Plus className="h-4 w-4" aria-hidden="true" />}
          <span className="oj-add-text">{box.saving ? 'Adding' : 'Add'}</span>
        </button>
      </div>
      <p className="oj-compose-note" aria-live="polite">{box.saving ? 'Saving…' : 'Enter to add · keep typing to add another'}</p>
      {box.failed && <p className="oj-compose-fail" role="alert">That didn’t save — your words are still in the box. Press Enter to try again.</p>}
    </form>
  )
}

export interface JournalSection {
  key: string
  /** "This Fall", "For October". */
  eyebrow: string
  title: string
  /** The line above is done — its own state, never its entries'. */
  done?: boolean
  /** Controls for the line above itself (its own done check). */
  parentControls?: ReactNode
  /** The entries, as <li> rows. */
  rows: ReactNode[]
  /** Shown when there are no rows yet. */
  empty: string
  composer: JournalComposerProps
}

export function OpenJournal({ label, periodKey, intro, sections, general, footer }: {
  label: string
  /** The destination period ("2026-10-01"). Every section and its add box is
   *  keyed by it, so a draft or a save still running in October never shows,
   *  clears or lands in November's box (2026-10-08 review). */
  periodKey: string
  intro?: ReactNode
  sections: JournalSection[]
  general: JournalSection
  footer?: ReactNode
}) {
  const section = (s: JournalSection, isGeneral = false) => (
    <section key={`${periodKey}:${s.key}`} className={`oj-section${isGeneral ? ' is-general' : ''}${s.done ? ' is-done' : ''}`} aria-label={isGeneral ? s.title : `${s.eyebrow}: ${s.title}`}>
      <div className="oj-parent">
        <div className="oj-eyebrow">{s.eyebrow}</div>
        <h3 className="oj-title">{s.title}{s.done && <span className="oj-done"><Check className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" /> done</span>}</h3>
        {s.parentControls}
      </div>
      <div className="oj-linked">
        {s.rows.length ? <ul className="pv2-list oj-rows">{s.rows}</ul> : <p className="oj-empty">{s.empty}</p>}
        <JournalComposer {...s.composer} context={s.title} />
      </div>
    </section>
  )
  return (
    <section className="oj" aria-label={label}>
      {intro}
      {sections.map((s) => section(s))}
      {section(general, true)}
      {footer && <footer className="oj-footer">{footer}</footer>}
    </section>
  )
}

/** Lists (the page as it was) or Open journal — a planning view, remembered
 *  on this device only. Never an account setting. */
export function PlanLayoutSwitch({ value, onChange }: { value: 'lists' | 'journal'; onChange: (v: 'lists' | 'journal') => void }) {
  return (
    <div className="oj-switch" role="group" aria-label="Planning view">
      <span>View</span>
      <button type="button" aria-pressed={value === 'lists'} className={value === 'lists' ? 'is-on' : undefined} onClick={() => onChange('lists')}>Lists</button>
      <button type="button" aria-pressed={value === 'journal'} className={value === 'journal' ? 'is-on' : undefined} onClick={() => onChange('journal')}>Open journal</button>
    </div>
  )
}
