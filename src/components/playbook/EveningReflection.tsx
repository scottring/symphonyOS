import { useState } from 'react'

interface EveningReflectionProps {
  onSave: (reflection: { highlight: string; notes: string }) => void
  initialHighlight?: string
  initialNotes?: string
}

export function EveningReflection({ onSave, initialHighlight = '', initialNotes = '' }: EveningReflectionProps) {
  const [highlight, setHighlight] = useState(initialHighlight)
  const [notes, setNotes] = useState(initialNotes)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onSave({ highlight, notes })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const hasContent = highlight.trim() || notes.trim()

  return (
    <div className="mt-8 mb-4 px-1">
      <div className="bg-amber-50/60 border border-amber-200/40 rounded-2xl p-5">
        <h3 className="font-display text-lg text-neutral-800 mb-4">
          How was today?
        </h3>

        {/* One highlight */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">
            One highlight
          </label>
          <input
            type="text"
            value={highlight}
            onChange={(e) => setHighlight(e.target.value)}
            placeholder="The best moment from today..."
            className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-amber-200/60 text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 transition-all"
          />
        </div>

        {/* Free text */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">
            Anything else on your mind?
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observations, wins, things to try tomorrow..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-amber-200/60 text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 transition-all resize-none"
          />
        </div>

        {/* Save button */}
        {hasContent && (
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              saved
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
            }`}
          >
            {saved ? 'Saved' : 'Save reflection'}
          </button>
        )}
      </div>
    </div>
  )
}
