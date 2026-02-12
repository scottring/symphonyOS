// CascadingGoalWizard — Generate goals from the family manual via AI
// Shows: Generate button → loading → review proposed goals → import selected ones

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/hooks/useHousehold'
import { useManual } from '@/hooks/useManual'
import { DOMAIN_NAMES } from '@/types/manual'
import type { DomainId } from '@/types/manual'
import type { GoalArea, Quarter } from '@/types/goal'

interface GeneratedGoal {
  areaName: string
  goalName: string
  domain: string
  rationale: string
  notes: string
  actions: { quarter: string; description: string }[]
}

interface CascadingGoalWizardProps {
  year: number
  existingAreas: GoalArea[]
  onAddArea: (name: string) => Promise<GoalArea | null>
  onAddGoal: (areaId: string, name: string) => Promise<{ id: string } | null>
  onUpdateGoal: (id: string, updates: { notes?: string }) => void
  onAddAction: (goalId: string, description: string, quarter: Quarter) => Promise<unknown>
  onComplete: () => void
}

type WizardStep = 'idle' | 'generating' | 'review' | 'importing' | 'done'

export function CascadingGoalWizard({
  year,
  existingAreas,
  onAddArea,
  onAddGoal,
  onUpdateGoal,
  onAddAction,
  onComplete,
}: CascadingGoalWizardProps) {
  const { household } = useHousehold()
  const householdId = household?.id ?? null
  const { manuals } = useManual(householdId)

  const householdManual = manuals.find(m => m.type === 'household')

  const [step, setStep] = useState<WizardStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [generatedGoals, setGeneratedGoals] = useState<GeneratedGoal[]>([])
  const [selectedGoals, setSelectedGoals] = useState<Set<number>>(new Set())
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [importedCount, setImportedCount] = useState(0)

  const handleGenerate = useCallback(async () => {
    if (!householdManual || !householdId) return

    setStep('generating')
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-cascading-goals', {
        body: { householdId, manualId: householdManual.id, year },
      })

      if (fnError) throw new Error(fnError.message || 'Failed to generate goals')

      const goals = data.goals as GeneratedGoal[]
      setGeneratedGoals(goals)
      // Select all by default
      setSelectedGoals(new Set(goals.map((_, i) => i)))
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate goals')
      setStep('idle')
    }
  }, [householdManual, householdId, year])

  const toggleGoal = (index: number) => {
    setSelectedGoals(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleImport = useCallback(async () => {
    const goalsToImport = generatedGoals.filter((_, i) => selectedGoals.has(i))
    if (goalsToImport.length === 0) return

    setStep('importing')
    setImportTotal(goalsToImport.length)
    setImportProgress(0)

    let imported = 0

    for (const goal of goalsToImport) {
      try {
        // Find or create the area
        let area = existingAreas.find(a => a.name.toLowerCase() === goal.areaName.toLowerCase())
        if (!area) {
          area = await onAddArea(goal.areaName) ?? undefined
        }
        if (!area) continue

        // Create the goal
        const newGoal = await onAddGoal(area.id, goal.goalName)
        if (!newGoal) continue

        // Store domain + rationale in notes
        const notesText = `Domain: ${goal.domain} | ${goal.notes || goal.rationale}`
        onUpdateGoal(newGoal.id, { notes: notesText })

        // Create quarterly actions
        for (const action of goal.actions) {
          const quarter = action.quarter as Quarter
          if (['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
            await onAddAction(newGoal.id, action.description, quarter)
          }
        }

        imported++
      } catch (err) {
        console.error('Failed to import goal:', goal.goalName, err)
      }
      setImportProgress(prev => prev + 1)
    }

    setImportedCount(imported)
    setStep('done')
  }, [generatedGoals, selectedGoals, existingAreas, onAddArea, onAddGoal, onUpdateGoal, onAddAction])

  if (!householdManual) return null

  // Idle — just the button
  if (step === 'idle') {
    return (
      <div>
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium
                     hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm hover:shadow-md"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
          </svg>
          Generate from Manual
        </button>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>
    )
  }

  // Generating — loading state
  if (step === 'generating') {
    return (
      <div className="p-8 rounded-2xl bg-white border border-neutral-200 text-center">
        <div className="w-12 h-12 border-3 border-neutral-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold text-neutral-700 mb-1">Analyzing your manual...</h3>
        <p className="text-sm text-neutral-500">
          Identifying challenges, goals, and growth areas across all domains
        </p>
      </div>
    )
  }

  // Review — show generated goals for selection
  if (step === 'review') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold text-neutral-700">
              Proposed Goals for {year}
            </h3>
            <p className="text-sm text-neutral-500 mt-0.5">
              {generatedGoals.length} goals generated from your manual. Toggle to select which ones to import.
            </p>
          </div>
          <button
            onClick={() => { setStep('idle'); setGeneratedGoals([]); setError(null) }}
            className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="space-y-3">
          {generatedGoals.map((goal, i) => {
            const isSelected = selectedGoals.has(i)
            const domain = goal.domain as DomainId
            const quarters = ['Q1', 'Q2', 'Q3', 'Q4'] as const

            return (
              <div
                key={i}
                className={`rounded-2xl border p-5 transition-all ${
                  isSelected
                    ? 'border-amber-200 bg-amber-50/50'
                    : 'border-neutral-100 bg-white opacity-60'
                }`}
              >
                {/* Toggle + title */}
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleGoal(i)}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'border-neutral-300 hover:border-amber-400'
                    }`}
                  >
                    {isSelected && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-neutral-800">{goal.goalName}</span>
                      {DOMAIN_NAMES[domain] && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-50 text-primary-600">
                          {DOMAIN_NAMES[domain]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">{goal.rationale}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Area: {goal.areaName}</p>

                    {/* Quarterly actions preview */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {quarters.map(q => {
                        const qActions = goal.actions.filter(a => a.quarter === q)
                        if (qActions.length === 0) return null

                        return (
                          <div key={q} className="text-xs">
                            <span className="font-semibold text-neutral-500">{q}:</span>
                            <ul className="mt-0.5 space-y-0.5">
                              {qActions.map((a, j) => (
                                <li key={j} className="text-neutral-600 pl-2">
                                  {a.description}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Import button */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => { setStep('idle'); setGeneratedGoals([]) }}
            className="px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={selectedGoals.size === 0}
            className="px-6 py-2.5 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            Import {selectedGoals.size} goal{selectedGoals.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    )
  }

  // Importing — progress
  if (step === 'importing') {
    return (
      <div className="p-8 rounded-2xl bg-white border border-neutral-200 text-center">
        <div className="w-12 h-12 border-3 border-neutral-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold text-neutral-700 mb-1">Importing goals...</h3>
        <p className="text-sm text-neutral-500">
          {importProgress} of {importTotal} goals imported
        </p>
      </div>
    )
  }

  // Done
  if (step === 'done') {
    return (
      <div className="p-8 rounded-2xl bg-white border border-emerald-200 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-display text-lg font-semibold text-neutral-700 mb-1">
          {importedCount} goal{importedCount !== 1 ? 's' : ''} imported
        </h3>
        <p className="text-sm text-neutral-500 mb-4">
          Your cascading goals are ready with quarterly actions
        </p>
        <button
          onClick={() => { setStep('idle'); setGeneratedGoals([]); onComplete() }}
          className="px-5 py-2.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
        >
          Done
        </button>
      </div>
    )
  }

  return null
}
