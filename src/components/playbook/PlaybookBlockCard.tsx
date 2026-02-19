import { useState, useMemo, memo } from 'react'
import type { PlaybookInstance, QuickReact } from '@/types/playbook'
import { BLOCK_TYPE_CONFIG, QUICK_REACT_CONFIG } from '@/types/playbook'
import { PlaybookItemRow } from './PlaybookItemRow'
import { QuickReactBar } from './QuickReactBar'
import { QuickTagBubbles, generateTagsForBlock } from './QuickTagBubbles'

// Accent bar color by block type (module-level to avoid re-creation each render)
const ACCENT_COLORS: Record<string, string> = {
  connection: 'bg-sage-500',
  routine: 'bg-amber-500',
  transition: 'bg-stone-400',
  solo: 'bg-stone-300',
  together: 'bg-blue-400',
  buffer: 'bg-neutral-300',
  departure: 'bg-orange-400',
}

interface PlaybookBlockCardProps {
  instance: PlaybookInstance
  isCurrentBlock?: boolean
  onToggleItem: (instanceId: string, itemId: string) => void
  onMarkDone: (instanceId: string, completed?: boolean) => void
  onReact: (instanceId: string, react: QuickReact | null) => void
  onTag: (instanceId: string, tags: string[]) => void
  onNote: (instanceId: string, notes: string | null) => void
  onEdit?: (block: PlaybookInstance['block']) => void
  onDelete?: (blockId: string) => void
  onSuppress?: (blockId: string, date: string) => void
}

export const PlaybookBlockCard = memo(function PlaybookBlockCard({
  instance,
  isCurrentBlock,
  onToggleItem,
  onMarkDone,
  onReact,
  onTag,
  onNote,
  onEdit,
  onDelete,
  onSuppress,
}: PlaybookBlockCardProps) {
  const block = instance.block
  if (!block) return null

  const [showAddNote, setShowAddNote] = useState(false)
  const [noteText, setNoteText] = useState(instance.notes || '')
  const [expanded, setExpanded] = useState(!instance.completed)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const config = BLOCK_TYPE_CONFIG[block.blockType]

  const accentColor = ACCENT_COLORS[block.blockType] || 'bg-neutral-300'

  // Check if all items are done
  const allItemsDone = useMemo(() => {
    if (block.items.length === 0) return false
    return block.items.every(item => instance.itemsState?.[item.id])
  }, [block.items, instance.itemsState])

  // Available tags for this block
  const availableTags = useMemo(() => generateTagsForBlock(block.items), [block.items])

  // Handle note save
  const handleSaveNote = () => {
    onNote(instance.id, noteText.trim() || null)
    setShowAddNote(false)
  }

  const handleToggleTag = (tag: string) => {
    const newTags = instance.tags.includes(tag)
      ? instance.tags.filter(t => t !== tag)
      : [...instance.tags, tag]
    onTag(instance.id, newTags)
  }

  // ── COLLAPSED STATE (completed + reacted) ──
  if (instance.completed && !expanded) {
    const reactConfig = instance.react ? QUICK_REACT_CONFIG[instance.react] : null

    return (
      <div
        className="group cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50/40 border border-amber-100/60 hover:bg-amber-50/60 transition-colors">
          {/* Time */}
          <span className="text-xs text-neutral-400 tabular-nums w-10 flex-shrink-0">
            {block.timeSlot.split('-')[0]}
          </span>

          {/* Check */}
          <div className="w-5 h-5 rounded-full bg-sage-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Label */}
          <span className="text-sm font-medium text-neutral-500 flex-1 truncate">
            {block.label}
          </span>

          {/* React emoji */}
          {reactConfig && (
            <span className="text-base">{reactConfig.emoji}</span>
          )}
        </div>

        {/* Tags row */}
        {instance.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 ml-[4.25rem]">
            {instance.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-sage-50 text-sage-600 text-[10px]">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Note link */}
        {!instance.notes && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(true)
              setShowAddNote(true)
            }}
            className="ml-[4.25rem] mt-1 text-[11px] text-neutral-400 hover:text-neutral-500 transition-colors"
          >
            + add a note
          </button>
        )}
      </div>
    )
  }

  // ── EXPANDED STATE ──
  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
      isCurrentBlock
        ? 'bg-amber-50/70 border-amber-200/60 shadow-sm'
        : 'bg-amber-50/40 border-amber-100/50'
    }`}>
      {/* Accent bar + content */}
      <div className="flex">
        {/* Left accent bar */}
        <div className={`w-1 ${accentColor} flex-shrink-0`} />

        <div className="flex-1 p-4">
          {/* Header: time + type badge + collapse */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-neutral-400 tabular-nums">
              {block.timeSlot}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${config.bgColor} ${config.color}`}>
              {config.label}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {/* Overflow menu */}
              {(onEdit || onDelete || onSuppress) && (
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
                    title="Actions"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-white rounded-xl shadow-lg border border-neutral-200/60 py-1 animate-fade-in-scale">
                        {onEdit && (
                          <button
                            onClick={() => { setShowMenu(false); onEdit(block) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                            Edit
                          </button>
                        )}
                        {onSuppress && (
                          <button
                            onClick={() => { setShowMenu(false); onSuppress(block.id, instance.date) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Skip Today
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {instance.completed && (
                <button
                  onClick={() => setExpanded(false)}
                  className="text-xs text-neutral-400 hover:text-neutral-500"
                >
                  collapse
                </button>
              )}
            </div>
          </div>

          {/* Block label */}
          <h3 className="font-display text-lg font-semibold text-neutral-800 mb-2 leading-tight">
            {block.label}
          </h3>

          {/* Narrative — italic serif to feel coached, not clinical */}
          <p className="font-display text-sm italic text-neutral-600 leading-relaxed mb-3">
            {block.narrative}
          </p>

          {/* Coaching note */}
          {block.coachingNote && (
            <div className="mb-3 px-3 py-2.5 rounded-xl bg-sage-50/80 border border-sage-100/60">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-sage-500 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                </svg>
                <p className="text-xs text-sage-700 leading-relaxed">
                  {block.coachingNote}
                </p>
              </div>
            </div>
          )}

          {/* Per-kid items */}
          {block.items.length > 0 && (
            <div className="space-y-0.5 mb-3">
              {block.items.map((item) => (
                <PlaybookItemRow
                  key={item.id}
                  item={item}
                  checked={!!instance.itemsState?.[item.id]}
                  onToggle={() => onToggleItem(instance.id, item.id)}
                  categoryColor={accentColor}
                />
              ))}
            </div>
          )}

          {/* Done button (if not already completed) */}
          {!instance.completed && (
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => onMarkDone(instance.id, true)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  allItemsDone
                    ? 'bg-sage-500 text-white hover:bg-sage-600'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {allItemsDone ? 'All done!' : 'Mark as done'}
              </button>
            </div>
          )}

          {/* Quick react (shown after completion) */}
          {instance.completed && (
            <div className="mt-3 space-y-3">
              <QuickReactBar
                selected={instance.react}
                onSelect={(react) => onReact(instance.id, react)}
              />

              {/* Quick tags (shown after react) */}
              {instance.react && (
                <QuickTagBubbles
                  tags={instance.tags}
                  availableTags={availableTags}
                  onToggleTag={handleToggleTag}
                />
              )}

              {/* Note section */}
              {showAddNote ? (
                <div className="space-y-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="What happened? What would you try next time?"
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl bg-white/80 border border-amber-200/60 text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 transition-all resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveNote}
                      className="px-3 py-1.5 rounded-lg bg-sage-100 text-sage-700 text-xs font-medium hover:bg-sage-200 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowAddNote(false)}
                      className="px-3 py-1.5 rounded-lg text-neutral-400 text-xs hover:text-neutral-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddNote(true)}
                  className="text-[11px] text-neutral-400 hover:text-neutral-500 transition-colors"
                >
                  {instance.notes ? 'Edit note' : '+ add a note'}
                </button>
              )}

              {/* Existing note display */}
              {instance.notes && !showAddNote && (
                <p className="text-xs text-neutral-500 italic bg-white/50 px-3 py-2 rounded-lg">
                  {instance.notes}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && onDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5">
            <h3 className="text-base font-semibold text-neutral-800 mb-2">Delete block?</h3>
            <p className="text-sm text-neutral-500 mb-4">
              This will permanently remove &ldquo;{block.label}&rdquo; and all its instances.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 rounded-xl border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(block.id); setShowDeleteConfirm(false) }}
                className="flex-1 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
