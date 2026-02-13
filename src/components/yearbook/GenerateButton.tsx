// GenerateButton — Triggers yearbook content generation from the family manual

import { useState, useCallback } from 'react'
import { useHousehold } from '@/hooks/useHousehold'
import { useManual } from '@/hooks/useManual'
import { useYearbook } from '@/hooks/useYearbook'
import { useYearbookGeneration } from '@/hooks/useYearbookGeneration'

interface GenerateButtonProps {
  personId: string
  personName: string
}

export function GenerateButton({ personId, personName: _personName }: GenerateButtonProps) {
  const { household } = useHousehold()
  const householdId = household?.id ?? null
  const { manuals } = useManual(householdId)
  const { getOrCreateYearbook } = useYearbook(householdId)
  const { isGenerating, error, generateContent } = useYearbookGeneration(householdId)
  const [result, setResult] = useState<number | null>(null)

  const householdManual = manuals.find(m => m.type === 'household')

  const handleGenerate = useCallback(async () => {
    if (!householdManual || !householdId) return

    try {
      setResult(null)
      const yearbookId = await getOrCreateYearbook(personId)
      const count = await generateContent(personId, yearbookId, householdManual.id)
      setResult(count)
    } catch {
      // error is tracked in the hook
    }
  }, [householdManual, householdId, personId, getOrCreateYearbook, generateContent])

  if (!householdManual) {
    return (
      <p className="text-xs text-stone-400 italic">
        Complete onboarding first to generate entries.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isGenerating ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Generating this week's entries...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Generate this week
          </>
        )}
      </button>

      {result !== null && (
        <span className="text-sm text-emerald-600">{result} entries created</span>
      )}

      {error && (
        <span className="text-sm text-red-500">{error}</span>
      )}
    </div>
  )
}
