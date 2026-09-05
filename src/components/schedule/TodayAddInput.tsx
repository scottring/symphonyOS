// src/components/schedule/TodayAddInput.tsx
import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Plus, Check, X, Phone, Sparkles } from 'lucide-react'
import type { ParserContext } from '@/lib/quickInputParser'
import type { ResolverContext, ContactSuggestion } from '@/lib/entityResolver'
import { useQuickParse } from '@/hooks/useQuickParse'
import { useAssistantLauncher } from '@/contexts/AssistantLaunchContext'
import { DomainChooser } from '@/components/domain/DomainChooser'
import { AppliedDomainChip } from '@/components/capture/AppliedDomainChip'
import { ConceptIcon } from '@/lib/conceptIcons'
import type { ResolutionAction } from '@/hooks/useResolutionLearning'
import type { TaskCategory, TaskContext } from '@/types/task'

export type CaptureDestination = 'today' | 'inbox' | 'note'

export interface TodayCaptureResult {
  title: string
  scheduledFor: Date | null      // null → caller defaults to "today, all-day"
  /** Where this capture lands. Default 'today' (task on today). */
  destination?: CaptureDestination
  category?: TaskCategory
  /** Set only by an explicit #work/#family/#personal token — never the lens. */
  context?: TaskContext
  projectId?: string
  contactId?: string
  assignedMemberIds?: string[]
  phoneNumber?: string
  /** Present only when a suggestion was shown — feeds resolution_log. */
  resolution?: {
    inputText: string
    suggestion: ContactSuggestion
    action: ResolutionAction
  }
}

interface TodayAddInputProps {
  onAdd: (r: TodayCaptureResult) => void
  parserContext: ParserContext
  resolver: ResolverContext
  getRecentTaskForContact?: (contactId: string) => { title: string; date: Date } | null
}

/** Debounce a value — used to keep the suggestion line from flickering per keystroke. */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

const DESTINATIONS: { key: CaptureDestination; label: string; placeholder: string }[] = [
  { key: 'today', label: 'Today', placeholder: 'Add to today...' },
  { key: 'inbox', label: 'Inbox', placeholder: 'Capture to inbox — triage later...' },
  { key: 'note', label: 'Note', placeholder: 'Jot a note...' },
]

export function TodayAddInput({ onAdd, parserContext, resolver, getRecentTaskForContact }: TodayAddInputProps) {
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState('')
  const [destination, setDestination] = useState<CaptureDestination>('today')
  const inputRef = useRef<HTMLInputElement>(null)
  const { openAssistant } = useAssistantLauncher()

  // Stable ctx identity for useQuickParse's parse memo.
  const ctx = useMemo(
    () => parserContext,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parserContext.projects, parserContext.contacts, parserContext.familyMembers],
  )

  const debouncedValue = useDebouncedValue(value, 150)
  const qp = useQuickParse(debouncedValue, ctx, resolver)
  const { suggestion, suggestionState, suggestionApplied } = qp
  const p = qp.effectiveParsed

  const recentTask = useMemo(
    () => (suggestion && getRecentTaskForContact ? getRecentTaskForContact(suggestion.contactId) : null),
    [suggestion, getRecentTaskForContact],
  )

  const expand = useCallback(() => {
    setExpanded(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const reset = useCallback(() => {
    setValue('')
    setExpanded(false)
    setDestination('today')
    qp.resetOverrides()
    qp.resetSuggestion()
  }, [qp])

  // Escalation: hand the raw text to the fenced assistant, which can set up
  // something bigger than one task (project, subtasks, schedule) and verify it.
  const handleAskSymphony = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    openAssistant({ message: `Set this up and schedule it for today: ${trimmed}`, autoSend: true })
    reset()
  }, [value, openAssistant, reset])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    const attachPhone = suggestionApplied && suggestion?.callIntent && suggestion.phone
      ? suggestion.phone
      : undefined
    const action: ResolutionAction | null = !suggestion
      ? null
      : suggestionApplied
        ? (suggestionState === 'accepted' ? 'accepted' : 'auto_applied')
        : suggestionState === 'dismissed' ? 'dismissed' : 'ignored'
    onAdd({
      title: p.title?.trim() || trimmed,
      scheduledFor: p.dueDate ?? null,
      destination,
      category: p.category,
      context: p.context,
      projectId: p.projectId,
      contactId: p.contactId,
      assignedMemberIds: p.assignedMemberIds,
      phoneNumber: attachPhone,
      resolution: suggestion && action ? { inputText: trimmed, suggestion, action } : undefined,
    })
    reset()
  }, [value, qp, suggestion, suggestionState, suggestionApplied, destination, onAdd, reset])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      // Esc cascade: dismiss a visible suggestion first; second Esc clears/collapses.
      if (suggestion && suggestionState !== 'dismissed') {
        qp.dismissSuggestion()
        return
      }
      reset()
      inputRef.current?.blur()
    }
  }, [handleSubmit, suggestion, suggestionState, qp, reset])

  const handleBlur = useCallback(() => {
    if (!value.trim()) setExpanded(false)
  }, [value])

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={expand}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all duration-150"
        aria-label="Add to today"
      >
        <Plus className="w-4 h-4" />
        Add to today
      </button>
    )
  }

  const showSuggestion = !!suggestion && suggestionState !== 'dismissed'

  return (
    <div className="rounded-lg border border-primary-300 bg-white shadow-sm transition-all duration-200">
      <div className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2">
        <span className="text-lg leading-none text-primary-500">+</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={DESTINATIONS.find((d) => d.key === destination)!.placeholder}
          className="flex-1 bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 outline-none"
        />
        {/* Destination chips — one input, every capture. Mousedown-preventDefault
            keeps the input focused while switching. */}
        <div role="radiogroup" aria-label="Capture destination" className="flex items-center gap-0.5">
          {DESTINATIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={destination === d.key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDestination(d.key)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                destination === d.key
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {value.trim() && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSubmit}
            className="px-2.5 py-1 rounded-lg bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 transition-colors"
          >
            Add
          </button>
        )}
      </div>

      {/* Domain row — the same chips as ⌘K and the Inbox's "Where does this
          belong?" gate, so a capture can be filed here instead of coming back
          to it in triage. Typing #work sets the context too, which swaps the
          chooser for the applied chip. Mousedown-preventDefault everywhere:
          losing the caret mid-capture would break the type → tag → Enter run.
          Hidden for a typed "note:" — that path has its own shape. */}
      {value.trim() && !p.isNote && (
        <div
          className="flex items-center gap-2 px-3 pb-2 md:px-4"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-base"><ConceptIcon name="context" size={16} decorative /></span>
          {p.context ? (
            <AppliedDomainChip context={p.context} onClear={qp.clearContext} />
          ) : (
            <>
              <span className="text-xs text-neutral-400">Add to</span>
              <DomainChooser
                size="sm"
                onChoose={(d) => { qp.applyContext(d); inputRef.current?.focus() }}
              />
            </>
          )}
        </div>
      )}

      {showSuggestion && (
        <div
          className={`flex items-start gap-2 px-3 pb-2 md:px-4 min-h-[44px] ${suggestionApplied ? '' : 'opacity-60'}`}
        >
          {suggestionApplied ? (
            <Check className="w-3.5 h-3.5 mt-0.5 text-primary-500 shrink-0" />
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => qp.acceptSuggestion()}
              className="text-xs text-primary-600 font-medium shrink-0 mt-0.5"
            >
              tap to link
            </button>
          )}
          <div className="flex-1 text-xs text-neutral-600 leading-snug">
            <span className="font-medium text-neutral-800">{suggestion.contactName}</span>
            {suggestion.phone && (
              <span className="ml-1.5 inline-flex items-center gap-0.5">
                <Phone className="w-3 h-3 inline" /> {suggestion.phone}
              </span>
            )}
            {recentTask && (
              <div className="text-neutral-400">
                last: {recentTask.title} · {recentTask.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
          {suggestionApplied && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => qp.dismissSuggestion()}
              aria-label="Unlink suggestion"
              className="p-1 text-neutral-400 hover:text-neutral-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Escalation to the fenced assistant — explicit, one tap, never automatic */}
      {value.trim() && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAskSymphony}
          className="flex items-center gap-1.5 px-3 pb-2 md:px-4 text-xs text-primary-600 hover:text-primary-700 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" /> Set this up with Symphony
        </button>
      )}
    </div>
  )
}
