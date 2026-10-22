import { useState } from 'react'
import { Paperclip } from 'lucide-react'
import type { ChoiceOption, OptionStatus } from '@/types/choice'
import { PopMenu, StatusMenu } from './StatusMenu'
import { FollowUpPicker } from './FollowUpPicker'

export interface OptionActionHandlers {
  onChoose: (o: ChoiceOption) => void
  onStatus: (o: ChoiceOption, status: OptionStatus) => Promise<boolean>
  onFollowUp: (o: ChoiceOption, on: Date) => Promise<boolean>
  onDelete: (o: ChoiceOption) => Promise<boolean>
  onRename: (o: ChoiceOption, name: string) => Promise<boolean>
  onNotes: (o: ChoiceOption, notes: string | null) => Promise<boolean>
  /** Opens the option's files; left out when files aren't available. */
  onFiles?: (o: ChoiceOption) => void
  /** Opens the Log dialog about this option. */
  onLog?: (o: ChoiceOption) => void
  /** Opens the option's log; left out when nothing is logged for it. */
  onHistory?: (o: ChoiceOption) => void
}

/** Rename or Notes, inline: one field, Save or Cancel. */
export function InlineEdit({ label, initial, multiline, onSave, onCancel }: {
  label: string
  initial: string
  multiline?: boolean
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const field = 'w-full min-w-[180px] rounded-md border border-neutral-200 bg-white px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500'
  return (
    <div className="mt-1 space-y-1.5">
      {multiline
        ? <textarea autoFocus aria-label={label} rows={2} value={text} onChange={(e) => setText(e.target.value)} className={field} />
        : <input autoFocus aria-label={label} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(text); if (e.key === 'Escape') onCancel() }} className={field} />}
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(text)}
          className="rounded-lg bg-primary-600 px-3 py-1 text-[13px] font-medium text-white hover:bg-primary-700">Save</button>
        <button type="button" onClick={onCancel}
          className="px-2 py-1 text-[13px] font-medium text-neutral-500 hover:text-neutral-700">Cancel</button>
      </div>
    </div>
  )
}

/** A row's verbs, shared by the table and the cards: Choose this, Follow up
 *  on… (when Contacted), Log, Status, files, and ⋯ (Rename, Notes, History,
 *  Delete after a confirm). */
export function OptionActions({ option, onChoose, onStatus, onFollowUp, onDelete, onFiles, onRename, onNotes, onLog, onHistory, nowrap }: OptionActionHandlers & {
  option: ChoiceOption
  /** One line (the table, which scrolls sideways); the cards let verbs wrap. */
  nowrap?: boolean
}) {
  const [followingUp, setFollowingUp] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState<'name' | 'notes' | null>(null)

  if (editing === 'name') {
    return (
      <InlineEdit label="Option name" initial={option.name} onCancel={() => setEditing(null)}
        onSave={async (text) => {
          const name = text.trim()
          if (!name || name === option.name) { setEditing(null); return }
          if (await onRename(option, name)) setEditing(null)
        }} />
    )
  }
  if (editing === 'notes') {
    return (
      <InlineEdit label="Notes" multiline initial={option.notes ?? ''} onCancel={() => setEditing(null)}
        onSave={async (text) => {
          const notes = text.trim() || null
          if (notes === (option.notes ?? null)) { setEditing(null); return }
          if (await onNotes(option, notes)) setEditing(null)
        }} />
    )
  }

  const pickStatus = async (s: OptionStatus) => {
    if (s === 'chosen') { onChoose(option); return }
    const ok = await onStatus(option, s)
    if (ok && s === 'contacted') setFollowingUp(true)
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-neutral-600">{`Delete ${option.name}?`}</span>
        <button type="button" onClick={async () => { if (await onDelete(option)) setConfirming(false) }}
          className="rounded-lg bg-red-500 px-3 py-1 text-[13px] font-medium text-white hover:bg-red-600">Delete</button>
        <button type="button" onClick={() => setConfirming(false)}
          className="px-2 py-1 text-[13px] font-medium text-neutral-500 hover:text-neutral-700">Cancel</button>
      </div>
    )
  }

  return (
    <div>
      <div className={`flex ${nowrap ? 'flex-nowrap' : 'flex-wrap'} items-center gap-x-3 gap-y-1 whitespace-nowrap text-[13px]`}>
        {option.status !== 'ruled_out' && option.status !== 'chosen' && (
          <button type="button" onClick={() => onChoose(option)} className="font-medium text-primary-600 hover:text-primary-700">
            Choose this
          </button>
        )}
        {option.status === 'contacted' && !followingUp && (
          <button type="button" onClick={() => setFollowingUp(true)} className="text-primary-600 hover:text-primary-700">
            Follow up on…
          </button>
        )}
        {onLog && (
          <button type="button" onClick={() => onLog(option)} className="text-primary-600 hover:text-primary-700">
            Log
          </button>
        )}
        <StatusMenu status={option.status} onPick={(s) => void pickStatus(s)} />
        {onFiles && (
          <button type="button" aria-label={`Files for ${option.name}`} onClick={() => onFiles(option)}
            className="text-neutral-400 hover:text-neutral-700">
            <Paperclip className="h-3.5 w-3.5" />
          </button>
        )}
        <PopMenu label="More" trigger="⋯" items={[
          { label: 'Rename', onPick: () => setEditing('name') },
          { label: 'Notes', onPick: () => setEditing('notes') },
          ...(onHistory ? [{ label: 'History', onPick: () => onHistory(option) }] : []),
          { label: 'Delete option', danger: true, onPick: () => setConfirming(true) },
        ]} />
      </div>
      {followingUp && (
        <FollowUpPicker
          onCancel={() => setFollowingUp(false)}
          onSave={async (on) => { if (await onFollowUp(option, on)) setFollowingUp(false) }}
        />
      )}
    </div>
  )
}
