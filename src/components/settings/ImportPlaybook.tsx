import { useState, useCallback } from 'react'
import type { CreateBlockInput, BlockType, DayType } from '@/types/playbook'
import { BLOCK_TYPE_CONFIG } from '@/types/playbook'

interface ImportPlaybookProps {
  onImport: (blocks: CreateBlockInput[]) => Promise<void>
}

interface ParsedBlock {
  timeSlot: string
  label: string
  blockType: BlockType
  narrative: string
  coachingNote?: string | null
  items: { who: string; action: string; context?: string; coaching?: string }[]
  dayTypes: DayType[]
}

function validateBlock(block: unknown, index: number): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const b = block as Record<string, unknown>

  if (!b.label || typeof b.label !== 'string') errors.push(`Block ${index + 1}: missing label`)
  if (!b.timeSlot || typeof b.timeSlot !== 'string') errors.push(`Block ${index + 1}: missing timeSlot`)
  if (!b.blockType || typeof b.blockType !== 'string') errors.push(`Block ${index + 1}: missing blockType`)
  if (!b.narrative || typeof b.narrative !== 'string') errors.push(`Block ${index + 1}: missing narrative`)
  if (!Array.isArray(b.dayTypes) || b.dayTypes.length === 0) errors.push(`Block ${index + 1}: missing dayTypes`)

  return { valid: errors.length === 0, errors }
}

export function ImportPlaybook({ onImport }: ImportPlaybookProps) {
  const [jsonText, setJsonText] = useState('')
  const [parsedBlocks, setParsedBlocks] = useState<ParsedBlock[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleParse = useCallback(() => {
    setParseError(null)
    setParsedBlocks(null)

    try {
      const data = JSON.parse(jsonText)
      const blocks: unknown[] = Array.isArray(data) ? data : data.blocks
      if (!Array.isArray(blocks)) {
        setParseError('Expected an array of blocks, or an object with a "blocks" array.')
        return
      }

      const allErrors: string[] = []
      const validated: ParsedBlock[] = []

      for (let i = 0; i < blocks.length; i++) {
        const { valid, errors } = validateBlock(blocks[i], i)
        if (valid) {
          const b = blocks[i] as ParsedBlock
          validated.push({
            timeSlot: b.timeSlot,
            label: b.label,
            blockType: b.blockType,
            narrative: b.narrative,
            coachingNote: b.coachingNote || null,
            items: Array.isArray(b.items) ? b.items.map(item => ({
              who: item.who || 'self',
              action: item.action || '',
              ...(item.context && { context: item.context }),
              ...(item.coaching && { coaching: item.coaching }),
            })) : [],
            dayTypes: b.dayTypes,
          })
        } else {
          allErrors.push(...errors)
        }
      }

      if (allErrors.length > 0) {
        setParseError(allErrors.join('\n'))
      }

      if (validated.length > 0) {
        setParsedBlocks(validated)
      }
    } catch {
      setParseError('Invalid JSON. Please check your input.')
    }
  }, [jsonText])

  const handleImport = useCallback(async () => {
    if (!parsedBlocks) return

    setImporting(true)
    try {
      const inputs: CreateBlockInput[] = parsedBlocks.map((block, i) => ({
        timeSlot: block.timeSlot,
        label: block.label,
        blockType: block.blockType,
        narrative: block.narrative,
        coachingNote: block.coachingNote,
        items: block.items,
        dayTypes: block.dayTypes,
        sortOrder: 100 + i, // High sort order so they go after existing blocks
      }))

      await onImport(inputs)
      setSuccess(true)
      setJsonText('')
      setParsedBlocks(null)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setParseError('Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }, [parsedBlocks, onImport])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setJsonText(text)
      setParsedBlocks(null)
      setParseError(null)
    }
    reader.readAsText(file)
  }, [])

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-700 mb-2">Import Playbook</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Import playbook blocks from a JSON file. Imported blocks are added alongside existing ones.
      </p>

      {/* File upload */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <span className="px-3 py-1.5 rounded-lg border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors">
          Upload JSON
        </span>
        <input
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="hidden"
        />
        <span className="text-xs text-neutral-400">or paste below</span>
      </label>

      {/* JSON textarea */}
      <textarea
        value={jsonText}
        onChange={(e) => { setJsonText(e.target.value); setParsedBlocks(null); setParseError(null) }}
        placeholder='[{"timeSlot": "7:00", "label": "Morning Routine", "blockType": "routine", "narrative": "...", "dayTypes": ["school-day"], "items": []}]'
        rows={6}
        className="w-full px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200 text-sm font-mono text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-300/50 transition-all resize-y"
      />

      {/* Parse button */}
      {jsonText.trim() && !parsedBlocks && (
        <button
          onClick={handleParse}
          className="mt-3 px-4 py-2 rounded-xl bg-neutral-100 text-sm font-medium text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          Preview
        </button>
      )}

      {/* Parse errors */}
      {parseError && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 whitespace-pre-line">
          {parseError}
        </div>
      )}

      {/* Preview of parsed blocks */}
      {parsedBlocks && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Preview ({parsedBlocks.length} block{parsedBlocks.length !== 1 ? 's' : ''})
          </h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {parsedBlocks.map((block, i) => {
              const config = BLOCK_TYPE_CONFIG[block.blockType]
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200/60">
                  <span className="text-xs text-neutral-400 tabular-nums w-12">{block.timeSlot}</span>
                  {config && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${config.bgColor} ${config.color}`}>
                      {config.label}
                    </span>
                  )}
                  <span className="text-sm text-neutral-700 truncate flex-1">{block.label}</span>
                  <span className="text-[10px] text-neutral-400">
                    {block.dayTypes.join(', ')}
                  </span>
                </div>
              )
            })}
          </div>

          <button
            onClick={handleImport}
            disabled={importing}
            className="w-full mt-3 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {importing ? 'Importing...' : `Import ${parsedBlocks.length} Block${parsedBlocks.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700">
          Blocks imported successfully!
        </div>
      )}
    </section>
  )
}
