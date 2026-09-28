// src/components/plan/v2/FromPaper.tsx
//
// "Add from paper" on the list it belongs to (Scott, 2026-09-28: under
// "September's list"). The same photograph → review → commit flow the More
// menu opens (PageFromPaperFlow), already pointed at this list's horizon and
// period, so the page lands where you were looking.

import { useState } from 'react'
import { Camera } from 'lucide-react'
import { PageFromPaperFlow } from '@/components/capture/PageFromPaperFlow'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import type { PageAltitude } from '@/lib/planParse'
import type { Task } from '@/types/task'

export function FromPaper({ altitude, periodStart, tasks, label = 'Add from paper' }: {
  altitude: PageAltitude
  /** The period on screen: the review sheet defaults its month/season to it. */
  periodStart: Date
  tasks: readonly Task[]
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const { members } = useFamilyMembers()
  return (
    <>
      <button type="button" className="pv2-paper" onClick={() => setOpen(true)}>
        <Camera className="w-3.5 h-3.5" aria-hidden="true" />{label}
      </button>
      {open && (
        <PageFromPaperFlow
          members={members}
          onClose={() => setOpen(false)}
          existingTasks={tasks.filter((t) => !t.completed).map((t) => ({ id: t.id, title: t.title }))}
          initialAltitude={altitude}
          today={periodStart}
        />
      )}
    </>
  )
}
