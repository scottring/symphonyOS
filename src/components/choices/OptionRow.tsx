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
  /** Opens the option's files; left out when files aren't available. */
  onFiles?: (o: ChoiceOption) => void
}

/** A row's verbs, shared by the table and the cards: Choose this, Follow up
 *  on… (when Contacted), Status, files, and ⋯ (Delete, after a confirm). */
export function OptionActions({ option, onChoose, onStatus, onFollowUp, onDelete, onFiles }: OptionActionHandlers & { option: ChoiceOption }) {
  const [followingUp, setFollowingUp] = useState(false)
  const [confirming, setConfirming] = useState(false)

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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap text-[13px]">
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
        <StatusMenu status={option.status} onPick={(s) => void pickStatus(s)} />
        {onFiles && (
          <button type="button" aria-label={`Files for ${option.name}`} onClick={() => onFiles(option)}
            className="text-neutral-400 hover:text-neutral-700">
            <Paperclip className="h-3.5 w-3.5" />
          </button>
        )}
        <PopMenu label="More" trigger="⋯" items={[{ label: 'Delete option', danger: true, onPick: () => setConfirming(true) }]} />
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
