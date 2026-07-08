import { lazy, Suspense } from 'react'

const TiptapEditor = lazy(() =>
  import('@/components/notes/TiptapEditor').then(m => ({ default: m.TiptapEditor }))
)

interface Props {
  value: string
  onChange: (v: string) => void
}

export function StepConcerns({ value, onChange }: Props) {
  return (
    <div>
      <p className="text-sm text-neutral-500 mb-3">
        What do you need to talk about or keep an eye on this week? Shared with your
        household as you type, and saved to your vault on Finish.
      </p>
      <div className="rounded-md border border-neutral-200 bg-white p-3 min-h-[300px]">
        <Suspense fallback={null}>
          <TiptapEditor
            content={value}
            onChange={onChange}
            placeholder="Concerns, topics, things to discuss…"
          />
        </Suspense>
      </div>
    </div>
  )
}
