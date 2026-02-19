import { useState, useMemo, useCallback } from 'react'
import type { PlaybookBlock, CreateBlockInput, UpdateBlockInput, DayType } from '@/types/playbook'
import { BLOCK_TYPE_CONFIG } from '@/types/playbook'
import { BlockEditor } from './BlockEditor'

interface WeeklyPlannerGridProps {
  blocks: PlaybookBlock[]
  onAddBlock: (input: CreateBlockInput) => Promise<PlaybookBlock | null>
  onUpdateBlock: (id: string, updates: UpdateBlockInput) => Promise<void>
  onDeleteBlock: (id: string) => Promise<void>
  onBack: () => void
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

// Map day index to which day types they belong to
function dayIndexToDayTypes(dayIndex: number): DayType[] {
  // 0-4 = Mon-Fri (school days), 5-6 = Sat-Sun (weekend)
  if (dayIndex >= 5) return ['weekend']
  return ['school-day']
}

// Parse time slot string to get start hour (for row positioning)
function parseTimeSlot(timeSlot: string): { startHour: number; startMinute: number } {
  const match = timeSlot.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return { startHour: 7, startMinute: 0 }
  return { startHour: parseInt(match[1]), startMinute: parseInt(match[2]) }
}

// Generate time slots from 6am to 9pm
function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = 6; h <= 21; h++) {
    slots.push(`${h}:00`)
    slots.push(`${h}:30`)
  }
  return slots
}

// Check if a block should appear on a given day
function blockMatchesDay(block: PlaybookBlock, dayIndex: number): boolean {
  const dayTypes = dayIndexToDayTypes(dayIndex)
  return block.dayTypes.some(dt => dayTypes.includes(dt))
  // Also support blocks with 'holiday' or 'half-day' on any day
}

// Accent colors by block type
const ACCENT_COLORS: Record<string, string> = {
  connection: 'bg-sage-400',
  routine: 'bg-amber-400',
  transition: 'bg-stone-300',
  solo: 'bg-stone-200',
  together: 'bg-blue-300',
  buffer: 'bg-neutral-200',
  departure: 'bg-orange-300',
  partner: 'bg-rose-300',
  sibling: 'bg-violet-300',
  household: 'bg-teal-300',
}

export function WeeklyPlannerGrid({
  blocks,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onBack,
}: WeeklyPlannerGridProps) {
  const [editingBlock, setEditingBlock] = useState<PlaybookBlock | null>(null)
  const [showNewBlockEditor, setShowNewBlockEditor] = useState(false)
  const [, setNewBlockPreset] = useState<{ timeSlot: string; dayTypes: DayType[] } | null>(null)

  const timeSlots = useMemo(() => generateTimeSlots(), [])

  // Group blocks by time slot for the grid
  const blocksByTimeAndDay = useMemo(() => {
    const map = new Map<string, Map<number, PlaybookBlock[]>>()
    for (const slot of timeSlots) {
      map.set(slot, new Map())
    }

    for (const block of blocks) {
      const { startHour, startMinute } = parseTimeSlot(block.timeSlot)
      // Find the nearest slot
      const slotKey = `${startHour}:${startMinute < 30 ? '00' : '30'}`

      if (!map.has(slotKey)) continue

      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        if (blockMatchesDay(block, dayIdx)) {
          const dayMap = map.get(slotKey)!
          if (!dayMap.has(dayIdx)) dayMap.set(dayIdx, [])
          dayMap.get(dayIdx)!.push(block)
        }
      }
    }

    return map
  }, [blocks, timeSlots])

  // Check if a time row has any blocks
  const activeSlots = useMemo(() => {
    return new Set(
      Array.from(blocksByTimeAndDay.entries())
        .filter(([, dayMap]) => {
          for (const blocks of dayMap.values()) {
            if (blocks.length > 0) return true
          }
          return false
        })
        .map(([slot]) => slot)
    )
  }, [blocksByTimeAndDay])

  // Only show slots that have blocks, plus a few surrounding
  const visibleSlots = useMemo(() => {
    if (activeSlots.size === 0) return timeSlots.slice(2, 10) // Default: 7am-10am

    const indices = new Set<number>()
    for (const slot of activeSlots) {
      const idx = timeSlots.indexOf(slot)
      if (idx >= 0) {
        // Add surrounding slots
        for (let i = Math.max(0, idx - 1); i <= Math.min(timeSlots.length - 1, idx + 1); i++) {
          indices.add(i)
        }
      }
    }
    // Fill gaps
    const sorted = Array.from(indices).sort((a, b) => a - b)
    if (sorted.length < 2) return sorted.map(i => timeSlots[i])
    const filled: number[] = []
    for (let i = sorted[0]; i <= sorted[sorted.length - 1]; i++) {
      filled.push(i)
    }
    return filled.map(i => timeSlots[i])
  }, [activeSlots, timeSlots])

  const handleCellClick = useCallback((timeSlot: string, dayIndex: number) => {
    const dayTypes = dayIndexToDayTypes(dayIndex)
    setNewBlockPreset({ timeSlot, dayTypes })
    setShowNewBlockEditor(true)
  }, [])

  const handleSaveBlock = useCallback(async (input: CreateBlockInput | { id: string; updates: UpdateBlockInput }) => {
    if ('id' in input) {
      await onUpdateBlock(input.id, input.updates)
    } else {
      await onAddBlock(input)
    }
    setEditingBlock(null)
    setShowNewBlockEditor(false)
    setNewBlockPreset(null)
  }, [onAddBlock, onUpdateBlock])

  const handleDeleteBlock = useCallback(async (id: string) => {
    await onDeleteBlock(id)
    setEditingBlock(null)
  }, [onDeleteBlock])

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h1 className="font-display text-xl font-semibold text-neutral-800">Weekly Playbook</h1>
            <p className="text-xs text-neutral-500">{blocks.length} block{blocks.length !== 1 ? 's' : ''} configured</p>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => { setNewBlockPreset(null); setShowNewBlockEditor(true) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add Block
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid grid-cols-[4rem_repeat(7,1fr)] gap-px mb-px">
              <div className="h-8" /> {/* Time column header */}
              {DAYS.map((day, i) => (
                <div
                  key={day}
                  className={`h-8 flex items-center justify-center text-xs font-semibold ${
                    i >= 5 ? 'text-amber-600 bg-amber-50/50' : 'text-neutral-600 bg-neutral-50/50'
                  } rounded-t-lg`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Time rows */}
            {visibleSlots.map((slot) => {
              const dayMap = blocksByTimeAndDay.get(slot)
              const isHourMark = slot.endsWith(':00')

              return (
                <div
                  key={slot}
                  className={`grid grid-cols-[4rem_repeat(7,1fr)] gap-px ${
                    isHourMark ? 'border-t border-neutral-200/60' : ''
                  }`}
                >
                  {/* Time label */}
                  <div className="h-14 flex items-start pt-1 pr-2 justify-end">
                    {isHourMark && (
                      <span className="text-[10px] text-neutral-400 tabular-nums">
                        {slot}
                      </span>
                    )}
                  </div>

                  {/* Day cells */}
                  {DAYS.map((_, dayIdx) => {
                    const dayBlocks = dayMap?.get(dayIdx) || []
                    return (
                      <div
                        key={dayIdx}
                        onClick={() => dayBlocks.length === 0 && handleCellClick(slot, dayIdx)}
                        className={`h-14 border-l border-neutral-100/60 px-0.5 py-0.5 ${
                          dayBlocks.length === 0 ? 'cursor-pointer hover:bg-neutral-50/80' : ''
                        } ${dayIdx >= 5 ? 'bg-amber-50/20' : ''}`}
                      >
                        {dayBlocks.map(block => {
                          const accent = ACCENT_COLORS[block.blockType] || 'bg-neutral-200'
                          return (
                            <button
                              key={block.id}
                              onClick={(e) => { e.stopPropagation(); setEditingBlock(block) }}
                              className={`w-full rounded-md px-1.5 py-1 text-left transition-colors hover:ring-1 hover:ring-amber-300 ${accent} bg-opacity-30`}
                            >
                              <p className="text-[10px] font-medium text-neutral-800 truncate leading-tight">
                                {block.label}
                              </p>
                              <p className="text-[9px] text-neutral-500 truncate">
                                {block.timeSlot}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Block list (compact, below grid) */}
        <div className="mt-6">
          <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">All Blocks</h2>
          <div className="space-y-1.5">
            {blocks.map(block => {
              const config = BLOCK_TYPE_CONFIG[block.blockType]
              return (
                <button
                  key={block.id}
                  onClick={() => setEditingBlock(block)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-neutral-200/60 hover:bg-neutral-50 transition-colors text-left"
                >
                  <span className="text-xs text-neutral-400 tabular-nums w-14 flex-shrink-0">{block.timeSlot.split('-')[0]}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${config.bgColor} ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-sm text-neutral-700 flex-1 truncate">{block.label}</span>
                  <div className="flex gap-1">
                    {block.dayTypes.map(dt => (
                      <span key={dt} className="px-1.5 py-0.5 rounded bg-neutral-100 text-[9px] text-neutral-400">{dt}</span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Block editor modal */}
      {(editingBlock || showNewBlockEditor) && (
        <BlockEditor
          block={editingBlock}
          onSave={handleSaveBlock}
          onDelete={handleDeleteBlock}
          onClose={() => { setEditingBlock(null); setShowNewBlockEditor(false); setNewBlockPreset(null) }}
        />
      )}
    </div>
  )
}
