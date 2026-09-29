// src/components/plan/v2/AddArea.tsx
//
// The life area a new line is written in, chosen on the add row itself. A
// line written with every area in view used to get none, so its first
// Someday or Drop stopped to ask "Which domain?" (audit, 2026-09-29). The
// area filter wins when it shows one area; otherwise the last one chosen
// here, remembered on this device.

import { useState, type ReactNode } from 'react'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { useDomain } from '@/hooks/useDomain'
import type { TaskContext } from '@/types/task'

const KEY = 'symphony-plan-v2.add-area'
function read(): TaskContext | null {
  try { const v = localStorage.getItem(KEY); return v === 'work' || v === 'family' || v === 'personal' ? v : null } catch { return null }
}
function write(c: TaskContext | null) {
  try { if (c) localStorage.setItem(KEY, c); else localStorage.removeItem(KEY) } catch { /* private mode: not remembered */ }
}

export function useAddArea(): { area: TaskContext | undefined; picker: ReactNode } {
  const { soleDomain } = useDomain()
  const [stored, setStored] = useState<TaskContext | null>(read)
  const area = soleDomain ?? stored ?? undefined
  const picker = (
    <span className="pv2-addarea" title="Life area for what you add">
      <ContextPicker size="sm" value={area ?? null} onChange={(c) => { setStored(c ?? null); write(c ?? null) }} />
    </span>
  )
  return { area, picker }
}
