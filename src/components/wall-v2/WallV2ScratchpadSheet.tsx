// src/components/wall-v2/WallV2ScratchpadSheet.tsx
//
// The scratchpad, full screen (Scott, 2026-10-07; mockup "Wall Scratchpad").
// Left: jot a note on the wall keyboard — a plain note or something to talk
// about, and optionally who's writing. Right: the open notes, each sorted to
// Done (a talk-about asks "what did we decide?", skippable) or to someone's
// Inbox; then the week's sorted notes.
//
// Presentational: the Shell owns the data and every write. Touch-first, and
// no browser dialogs (a modal dialog blocks the wall until someone dismisses
// it) — delete is a two-tap inline confirm.

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, MoreHorizontal, Send, Undo2, X } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import { useDragScroll } from '@/hooks/useDragScroll'
import { rowByline, type ScratchpadKind, type ScratchpadNote, type ScratchpadRow } from '@/lib/wall/scratchpad'
import { useTint, Chip } from './moments/tint'
import { NOTE_ICON } from './moments/ScratchpadCard'

interface Props {
  rows: ScratchpadRow[]
  sorted: ScratchpadNote[]
  members: FamilyMember[]
  /** Whose Inbox a note can go to — the adults with accounts. */
  inboxPeople: FamilyMember[]
  now: Date
  /** Opened from a note on the face: that note is ringed and in view. */
  focusKey: string | null
  onAdd: (body: string, kind: ScratchpadKind, authorMemberId: string | null) => Promise<boolean>
  onDone: (row: ScratchpadRow, resolution: string) => void
  onSendToInbox: (row: ScratchpadRow, memberId: string) => void
  onEdit: (row: ScratchpadRow, body: string) => void
  onDelete: (row: ScratchpadRow) => void
  onReopen: (noteId: string) => void
  onClose: () => void
}

function sortedNote(n: ScratchpadNote, nameOf: (id: string) => string | undefined): string {
  if (n.status === 'sent') {
    const name = n.sentToMemberId ? nameOf(n.sentToMemberId) : undefined
    return name ? `To ${name}’s Inbox` : 'To the Inbox'
  }
  return n.resolution ? `Decided: ${n.resolution}` : ''
}

type Tray = { key: string; mode: 'done' | 'inbox' | 'menu' | 'edit' | 'confirm-delete' } | null

const btn = 'inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border px-5 text-[1.1rem] font-semibold'
const plain = `${btn} border-[#33465b] bg-[#1f2b38] text-[#e6edf4] active:bg-[#283748]`
const go = `${btn} border-[#2f6b4a] bg-[#1d3a2b] text-[#bff0d2] active:bg-[#244a36]`
const kicker = 'text-[0.95rem] font-semibold uppercase tracking-[0.12em] text-[#93a3b5]'

export function WallV2ScratchpadSheet(p: Props) {
  const t = useTint(p.members)
  const [draft, setDraft] = useState('')
  const [kind, setKind] = useState<ScratchpadKind>('note')
  const [who, setWho] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tray, setTray] = useState<Tray>(null)
  const [trayText, setTrayText] = useState('')
  const [showSorted, setShowSorted] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useDragScroll<HTMLDivElement>()
  const nameOf = (id: string) => p.members.find((m) => m.id === id)?.name

  useEffect(() => {
    if (p.focusKey) {
      listRef.current?.querySelector(`[data-key="${CSS.escape(p.focusKey)}"]`)?.scrollIntoView({ block: 'nearest' })
    } else {
      inputRef.current?.focus()
    }
    // Only on open: later renders must not steal focus from a tray input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p])

  // A primed delete disarms itself, so the next person through the kitchen
  // can't finish someone else's half-tap.
  useEffect(() => {
    if (tray?.mode !== 'confirm-delete') return
    const timer = setTimeout(() => setTray(null), 4000)
    return () => clearTimeout(timer)
  }, [tray])

  const submit = async () => {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    const ok = await p.onAdd(text, kind, who)
    setSaving(false)
    if (ok) { setDraft(''); setKind('note'); setWho(null); inputRef.current?.focus() }
  }

  const openTray = (key: string, mode: NonNullable<Tray>['mode'], text = '') => { setTray({ key, mode }); setTrayText(text) }
  const close = () => setTray(null)

  const done = (r: ScratchpadRow) => {
    // A plain note or a flag from the app is simply done; a talk-about asks
    // what was decided first.
    if (r.source === 'note' && r.kind === 'talk') openTray(r.key, 'done')
    else p.onDone(r, '')
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-[rgba(5,9,13,0.72)] p-12 font-sans text-[#e8edf2]" onClick={p.onClose}>
      <div role="dialog" aria-label="Scratchpad" onClick={(e) => e.stopPropagation()}
        className="relative grid min-h-0 w-full grid-cols-[560px_minmax(0,1fr)] overflow-hidden rounded-[28px] border border-[#2d3d50] bg-[#131c26]">
        <button type="button" onClick={p.onClose} aria-label="Close"
          className="absolute right-5 top-5 grid h-[60px] w-[60px] place-items-center rounded-2xl border border-[#33465b] bg-[#1f2b38]">
          <X className="h-7 w-7" />
        </button>

        <div className="flex flex-col gap-6 border-r border-[#2d2a40] bg-[#1a1727] p-9">
          <h2 className="m-0 font-display text-[2.6rem] font-medium leading-none text-[#f3f5f8]">Scratchpad</h2>
          <textarea ref={inputRef} value={draft} maxLength={500} aria-label="New note"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }}
            placeholder="Jot a note or something to talk about…"
            className="min-h-[150px] w-full resize-none rounded-[18px] border-2 border-[#c9a3ff] bg-[#0f1520] px-5 py-4 text-[1.7rem] text-[#eef2f6] outline-none placeholder:text-[#5f6c7d]" />
          <div>
            <div className={`${kicker} mb-2.5`}>What is it</div>
            <div className="flex gap-2.5" role="group" aria-label="What is it">
              {(['note', 'talk'] as const).map((k) => {
                const Icon = NOTE_ICON[k]
                const on = kind === k
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => setKind(k)}
                    className={`inline-flex min-h-[64px] flex-1 items-center justify-center gap-2 rounded-2xl border text-[1.25rem] font-semibold ${on ? 'border-[#c9a3ff] bg-[#c9a3ff] text-[#1a1030]' : 'border-[#33465b] bg-[#1f2b38] text-[#e6edf4]'}`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />{k === 'note' ? 'Note' : 'Talk about'}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <div className={`${kicker} mb-2.5`}>Who’s writing <span className="font-normal normal-case tracking-normal">(optional)</span></div>
            <div className="flex flex-wrap gap-3" role="group" aria-label="Who’s writing">
              {p.members.map((m) => (
                <button key={m.id} type="button" aria-pressed={who === m.id} aria-label={m.name}
                  onClick={() => setWho(who === m.id ? null : m.id)}
                  className={`grid h-16 w-16 place-items-center rounded-full border-[3px] text-[1.1rem] font-bold ${t.chip(m.id)} ${who === m.id ? 'border-white' : 'border-transparent'}`}>
                  {t.initial(m.id)}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => void submit()} disabled={!draft.trim() || saving}
            className="min-h-[72px] rounded-2xl bg-[#f2b65a] text-[1.4rem] font-semibold text-[#1b1406] disabled:opacity-40">
            Add to scratchpad
          </button>
          <p className="m-0 text-[1rem] leading-snug text-[#8d9cad]">Enter adds it too. Anything flagged “Bring up” in the app shows here as well.</p>
        </div>

        <div className="flex min-h-0 flex-col gap-3.5 px-10 pb-8 pt-8">
          <div className="flex items-baseline gap-4 pr-20">
            <h3 className="m-0 font-display text-[2rem] font-medium text-[#f3f5f8]">Open</h3>
            <span className="text-[1rem] text-[#93a3b5]">{p.rows.length === 0 ? 'Nothing open' : `${p.rows.length} open`}</span>
          </div>
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
            {p.rows.length === 0 && <p className="font-display text-[1.6rem] italic text-[#8d9cad]">The scratchpad is clear.</p>}
            {p.rows.map((r) => {
              const Icon = NOTE_ICON[r.source === 'note' ? r.kind : r.source]
              const open = tray?.key === r.key ? tray.mode : null
              return (
                <div key={r.key} data-key={r.key}
                  className={`grid shrink-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-4 rounded-[18px] bg-[#1d2835] px-5 py-3.5 ${p.focusKey === r.key ? 'ring-2 ring-[#c9a3ff]' : ''}`}>
                  <Icon className={`h-6 w-6 ${r.kind === 'talk' ? 'text-[#c9a3ff]' : 'text-[#8d9cad]'}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="break-words text-[1.45rem] font-medium leading-tight text-[#eef2f6]">{r.text}</div>
                    <div className="mt-0.5 text-[1rem] text-[#8d9cad]">{rowByline(r, nameOf, p.now)}</div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {r.authorMemberId && <Chip id={r.authorMemberId} t={t} />}
                    <button type="button" className={go} onClick={() => done(r)}>
                      <Check className="h-5 w-5" strokeWidth={3} />{r.source === 'note' ? 'Done' : 'Discussed'}
                    </button>
                    {r.source === 'note' && (
                      <>
                        <button type="button" className={plain} aria-expanded={open === 'inbox'} onClick={() => (open === 'inbox' ? close() : openTray(r.key, 'inbox'))}>
                          <Send className="h-5 w-5" />To Inbox
                        </button>
                        <button type="button" className={`${plain} px-4`} aria-label={`More for ${r.text}`} onClick={() => (open === 'menu' ? close() : openTray(r.key, 'menu'))}>
                          <MoreHorizontal className="h-6 w-6" />
                        </button>
                      </>
                    )}
                  </div>
                  {open && (
                    <div className="col-span-2 col-start-2 flex flex-wrap items-center gap-2.5 pt-1.5">
                      {open === 'inbox' && (
                        <>
                          <span className={kicker}>Whose Inbox?</span>
                          {p.inboxPeople.map((m) => (
                            <button key={m.id} type="button" className={plain} onClick={() => { close(); p.onSendToInbox(r, m.id) }}>{m.name}</button>
                          ))}
                          <button type="button" className={plain} onClick={close}>Cancel</button>
                        </>
                      )}
                      {(open === 'done' || open === 'edit') && (
                        <form className="flex flex-1 flex-wrap items-center gap-2.5" onSubmit={(e) => {
                          e.preventDefault(); close()
                          if (open === 'done') p.onDone(r, trayText)
                          else if (trayText.trim()) p.onEdit(r, trayText)
                        }}>
                          <input autoFocus value={trayText} onChange={(e) => setTrayText(e.target.value)} maxLength={500}
                            aria-label={open === 'done' ? 'What did we decide?' : 'Edit the note'}
                            placeholder={open === 'done' ? 'What did we decide? (optional)' : ''}
                            className="min-h-[56px] min-w-[280px] flex-1 rounded-[14px] border border-[#3a4c61] bg-[#0f1520] px-4 text-[1.2rem] text-[#eef2f6] outline-none" />
                          <button type="submit" className={open === 'done' ? go : plain}>{open === 'done' ? 'Done' : 'Save'}</button>
                          <button type="button" className={plain} onClick={close}>Cancel</button>
                        </form>
                      )}
                      {open === 'menu' && (
                        <>
                          <button type="button" className={plain} onClick={() => openTray(r.key, 'edit', r.text)}>Edit</button>
                          <button type="button" className={plain} onClick={() => openTray(r.key, 'confirm-delete')}>Delete</button>
                          <button type="button" className={plain} onClick={close}>Cancel</button>
                        </>
                      )}
                      {open === 'confirm-delete' && (
                        <>
                          <button type="button" className={`${btn} border-[#7a2f3b] bg-[#5a1f29] text-[#ffd6dc]`} onClick={() => { close(); p.onDelete(r) }}>Delete for good</button>
                          <button type="button" className={plain} onClick={close}>Keep it</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {p.sorted.length > 0 && (
            <div className="shrink-0 border-t border-[#223041] pt-3">
              <button type="button" aria-expanded={showSorted} onClick={() => setShowSorted((v) => !v)}
                className="flex min-h-[48px] items-center gap-2.5 text-[1.2rem] text-[#93a3b5]">
                {showSorted ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                Done this week ({p.sorted.length})
              </button>
              {showSorted && (
                <ul className="flex flex-col">
                  {p.sorted.slice(0, 5).map((n) => (
                    <li key={n.id} className="flex min-h-[52px] items-center gap-3.5 text-[1.15rem] text-[#a7b4c2]">
                      <span className={`rounded-full px-2.5 py-0.5 text-[0.85rem] font-bold ${n.status === 'sent' ? 'bg-[#213a52] text-[#bcd9f5]' : 'bg-[#1d3a2b] text-[#9fd8b5]'}`}>
                        {n.status === 'sent' ? 'Inbox' : 'Done'}
                      </span>
                      <span className="min-w-0 truncate">{n.body}</span>
                      <span className="min-w-0 flex-1 truncate text-[1rem] text-[#8d9cad]">
                        {sortedNote(n, nameOf)}
                      </span>
                      {n.status === 'done' && (
                        <button type="button" onClick={() => p.onReopen(n.id)} className={`${plain} min-h-[48px] px-4 text-[1rem]`}>
                          <Undo2 className="h-4 w-4" />Reopen
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
