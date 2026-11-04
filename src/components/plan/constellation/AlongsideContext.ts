import { createContext, useContext } from 'react'
/** Coordinates the opt-in workspace with the existing Today renderer: inside
 *  it, AlongsideDay folds the week beside the day (paper-style horizons,
 *  2026-11-04), so Today draws no fold of its own. */
export interface AlongsideWorkspace { weekFolded: true }
export const AlongsideContext = createContext<AlongsideWorkspace | null>(null)
export const useAlongsideWorkspace = () => useContext(AlongsideContext)
