// Planning the week, step 2 (spec 2026-11-01): read the month. The month's
// lines, each with where it stands and what is planned under it, so it is
// plain which lines have nothing yet. For reading only: nothing here writes.
// The same reading as Month's "Read the season list" (ReadAbove).

import type { ChooseLineView } from '@/components/plan/choose/ChoosePlan'
import { ReadAbove } from '../month/ReadAbove'

export function ReadMonth({ monthWord, lines, doneLines }: {
  monthWord: string
  /** The month's open lines (useChooseWeek), already filtered as the page is. */
  lines: readonly ChooseLineView[]
  doneLines: readonly ChooseLineView[]
}) {
  return <ReadAbove aboveWord={monthWord} lines={lines} doneLines={doneLines} />
}
