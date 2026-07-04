import { useState } from 'react'
import type { Symptom, Severity } from '@/types/symptom'
import { SEVERITY_LABELS } from '@/types/symptom'

interface Props {
  symptoms: Symptom[]
  onLog: (symptomId: string, severity: Severity) => void
}

export function SymptomQuickLog({ symptoms, onLog }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const active = symptoms.filter((s) => s.active)
  if (active.length === 0) return null

  return (
    <div className="card p-4">
      <div className="font-medium mb-2">Log a symptom</div>
      <div className="flex flex-wrap gap-2">
        {active.map((s) => (
          <button key={s.id}
            className={`px-3 py-1 rounded-full text-sm ${pendingId === s.id ? 'btn-primary' : 'card'}`}
            onClick={() => setPendingId(pendingId === s.id ? null : s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      {pendingId && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-neutral-500">Severity:</span>
          {([1, 2, 3] as Severity[]).map((sev) => (
            <button key={sev} className="card px-3 py-1 text-sm"
              onClick={() => { onLog(pendingId, sev); setPendingId(null) }}>
              {SEVERITY_LABELS[sev]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
