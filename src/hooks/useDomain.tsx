import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { TaskContext } from '@/types/task'

export type Domain = TaskContext | 'universal'

interface DomainContextType {
  currentDomain: Domain
  setDomain: (domain: Domain) => void
}

const DomainContext = createContext<DomainContextType | undefined>(undefined)

interface DomainProviderProps {
  children: ReactNode
}

export function DomainProvider({ children }: DomainProviderProps) {
  const [currentDomain, setCurrentDomain] = useState<Domain>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('symphony-current-domain')
    return (saved as Domain) || 'universal'
  })

  useEffect(() => {
    // Persist to localStorage whenever domain changes
    localStorage.setItem('symphony-current-domain', currentDomain)
  }, [currentDomain])

  return (
    <DomainContext.Provider value={{ currentDomain, setDomain: setCurrentDomain }}>
      {children}
    </DomainContext.Provider>
  )
}

export function useDomain() {
  const context = useContext(DomainContext)
  if (!context) {
    throw new Error('useDomain must be used within DomainProvider')
  }
  return context
}
