import { useState, useRef, useEffect, useMemo } from 'react'
import type { ParserContext } from '@/lib/quickInputParser'
import { useQuickParse } from '@/hooks/useQuickParse'
import { ParsedFieldChips } from '@/components/capture/ParsedFieldChips'

export interface TimelineCaptureResult {
  title: string
  scheduledFor: Date | null
  category?: 'task' | 'chore' | 'errand' | 'event' | 'activity'
  projectId?: string
  contactId?: string
  assignedMemberIds?: string[]
}

type Domain = 'work' | 'family' | 'personal' | 'universal'
interface Props {
  kind: 'task' | 'event' | 'routine'
  anchorTime: Date | null
  parserContext: ParserContext
  currentDomain: Domain
  onSubmit: (r: TimelineCaptureResult) => void
  onCancel: () => void
}

export function TimelineQuickInput({ kind, anchorTime, parserContext, currentDomain, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  // useQuickParse requires a referentially-stable ctx (its parse memo keys on identity)
  const ctx = useMemo<ParserContext>(
    () => parserContext,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parserContext.projects, parserContext.contacts, parserContext.familyMembers],
  )
  const qp = useQuickParse(title, ctx, currentDomain)

  const timeLabel = anchorTime
    ? anchorTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  const placeholder = `New ${kind}${timeLabel ? ` · ${timeLabel}` : ''}`

  const submit = () => {
    const t = title.trim()
    if (!t) return
    const p = qp.effectiveParsed
    onSubmit({
      title: p.title?.trim() || t,
      scheduledFor: p.dueDate ?? anchorTime,
      category: p.category,
      projectId: p.projectId,
      contactId: p.contactId,
      assignedMemberIds: p.assignedMemberIds,
    })
  }

  return (
    <div className="w-full px-1 py-1">
      <input
        ref={ref}
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        onBlur={onCancel}
        placeholder={placeholder}
        className="w-full bg-transparent text-lg md:text-2xl font-display text-neutral-800 placeholder:text-neutral-400 outline-none"
      />
      <ParsedFieldChips
        parsed={qp.effectiveParsed}
        projectName={qp.projectName}
        contactName={qp.contactName}
        onClearDate={qp.clearDate}
        onClearProject={qp.clearProject}
        onClearContact={qp.clearContact}
        onClearCategory={qp.clearCategory}
        onClearContext={qp.clearContext}
      />
    </div>
  )
}
