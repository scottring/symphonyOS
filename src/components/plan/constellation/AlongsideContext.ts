import { createContext, useContext } from 'react'
/** Coordinates the opt-in workspace with the existing Today renderer: inside
 *  it, AlongsideDay folds the week beside the day (paper-style horizons,
 *  2026-11-04), so Today draws no fold of its own. `routinesSlot` is the
 *  place on that sheet, under the week's tasks, where Today draws the day's
 *  routines (it holds the day's plan and its writers). `driveWeek` lets Today
 *  open the week for a while (the guide's Today step) without it being
 *  remembered; undefined hands it back to the reader (PaperFold `drive`). */
export interface AlongsideWorkspace {
  weekFolded: true
  routinesSlot: HTMLElement | null
  driveWeek: (open: boolean | undefined) => void
}
export const AlongsideContext = createContext<AlongsideWorkspace | null>(null)
export const useAlongsideWorkspace = () => useContext(AlongsideContext)
