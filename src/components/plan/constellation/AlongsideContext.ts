import { createContext, useContext } from 'react'
/** Coordinates the opt-in workspace with the existing Today renderer: inside
 *  it, AlongsideDay folds the week beside the day (paper-style horizons,
 *  2026-11-04), so Today draws no fold of its own. `routinesSlot` is the
 *  place on that sheet, under the week's tasks, where Today draws the day's
 *  routines (it holds the day's plan and its writers). `driveWeek` lets Today
 *  open the week for a while (the guide's Today step) without it being
 *  remembered; undefined hands it back to the reader (PaperFold `drive`).
 *  `listenPlaced` lets Today hear a placement from the sheet that saved (+,
 *  or a drop on the day), so the Day session's Pick step counts it as a
 *  pick; it returns the way to stop listening. */
export interface AlongsideWorkspace {
  weekFolded: true
  routinesSlot: HTMLElement | null
  driveWeek: (open: boolean | undefined) => void
  listenPlaced: (listener: () => void) => () => void
}
export const AlongsideContext = createContext<AlongsideWorkspace | null>(null)
export const useAlongsideWorkspace = () => useContext(AlongsideContext)
