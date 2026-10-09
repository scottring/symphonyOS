import { createContext, useContext } from 'react'
/** Coordinates the opt-in workspace with the existing Today renderer. */
export const AlongsideContext = createContext<{showWeek:()=>void}|null>(null)
export const useAlongsideWorkspace = () => useContext(AlongsideContext)
