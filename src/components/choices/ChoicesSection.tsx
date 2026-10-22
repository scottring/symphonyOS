import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PanelSection } from '@/components/surface/sections/PanelSection'
import { useGoalChoices, CHOICES_UPDATED } from '@/hooks/useChoices'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { choiceSummary, decidedSummary } from '@/lib/choices/facts'
import { deleteChoice } from '@/lib/choices/db'
import { supabase } from '@/lib/supabase'
import type { GoalRef } from '@/types/choice'

/** The summary string comes whole; only the "N waiting …" fragment is amber. */
function Summary({ text }: { text: string }) {
  const parts = text.split(' · ')
  const at = parts.findIndex((p) => /^\d+ waiting\b/.test(p))
  if (at < 0) return <>{text}</>
  const before = parts.slice(0, at).join(' · ')
  const after = parts.slice(at + 1).join(' · ')
  return (
    <>
      {before && `${before} · `}
      <span className="text-amber-700">{parts[at]}</span>
      {after && ` · ${after}`}
    </>
  )
}

export function ChoicesSection({ goal }: { goal: GoalRef }) {
  const { rows, create } = useGoalChoices(goal)
  const navigate = useNavigate()
  const { run } = useCanvasActivity()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    let createdId: string | null = null
    const ok = await run(
      'Add choice',
      async () => {
        const c = await create(t)
        if (!c) return false
        createdId = c.id
        return true
      },
      {
        undo: async () => {
          if (!createdId) return false
          const done = await deleteChoice(supabase, createdId)
          window.dispatchEvent(new Event(CHOICES_UPDATED))
          return done
        },
      },
    )
    if (ok && createdId) {
      setTitle('')
      setAdding(false)
      navigate(`/choice/${createdId}`)
    }
  }

  const now = new Date()
  return (
    <PanelSection
      id="choices"
      label="Choices"
      actions={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[13px] text-primary-600 hover:text-primary-700"
          >
            + Choice
          </button>
        )
      }
    >
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map(({ choice, options, followUps }) => (
            <li key={choice.id}>
              <button
                type="button"
                onClick={() => navigate(`/choice/${choice.id}`)}
                className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-neutral-50 transition-colors"
              >
                <div className="text-sm font-medium text-neutral-800">
                  {choice.status === 'decided' ? '✓ ' : ''}{choice.title}
                </div>
                <div className="text-[13px] text-neutral-500">
                  <Summary
                    text={choice.status === 'decided'
                      ? decidedSummary(choice, options)
                      : choiceSummary(options, followUps, now)}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') { setTitle(''); setAdding(false) }
          }}
          placeholder="What are you choosing? e.g. Contractor"
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      )}
    </PanelSection>
  )
}
