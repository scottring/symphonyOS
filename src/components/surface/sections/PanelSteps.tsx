interface PanelStepsProps {
  steps: string[] | undefined
}

/** Numbered cooking steps for a meal/recipe panel. Renders nothing when empty. */
export function PanelSteps({ steps }: PanelStepsProps) {
  const list = steps ?? []
  if (list.length === 0) return null

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Steps</div>
      <ol className="space-y-1.5 list-decimal list-inside text-sm text-neutral-700 marker:text-neutral-400">
        {list.map((step, i) => (
          <li key={i} className="pl-1 leading-snug">{step}</li>
        ))}
      </ol>
    </section>
  )
}
