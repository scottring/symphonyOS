import { useState } from 'react'
import { PanelSection } from './PanelSection'

interface PanelIngredientsProps {
  ingredients: string[] | undefined
}

export function PanelIngredients({ ingredients }: PanelIngredientsProps) {
  const list = ingredients ?? []
  const [checked, setChecked] = useState<Set<number>>(new Set())
  if (list.length === 0) return null

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  return (
    <PanelSection id="ingredients" label="Ingredients" preview={`${list.length} item${list.length === 1 ? '' : 's'}`}>
      <ul className="space-y-1">
        {list.map((item, i) => (
          <li key={`${item}-${i}`} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={item}
              checked={checked.has(i)}
              onChange={() => toggle(i)}
              className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
            />
            <span className={`text-sm ${checked.has(i) ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </PanelSection>
  )
}
