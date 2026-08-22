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

const DOMAIN_KEY = 'symphony-current-domain'
const DOMAIN_DAY_KEY = 'symphony-current-domain-day'

/** Local calendar day, not UTC — the lens should reset when YOUR day turns. */
export function localDayKey(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * The domain the app should open with.
 *
 * The lens used to persist forever. That is fine as a VIEW — but quick capture
 * stamps `context: currentDomain` onto whatever you type
 * (useShellChrome.ts:107), so a lens left on Personal three weeks ago quietly
 * labels every capture since as personal. That is how "Weekdays after camp:
 * kids unpack bags" — a household routine — ended up tagged `personal` and
 * therefore `scope: 'individual'`, invisible to the rest of the house.
 *
 * A choice is worth remembering for the rest of the day you made it in and no
 * longer. Come back tomorrow and you are looking at your whole life again,
 * which is the only default that cannot silently mislabel anything.
 */
export function resolveInitialDomain(
  stored: string | null,
  storedDay: string | null,
  today: string,
): Domain {
  if (!stored) return 'universal'
  if (storedDay !== today) return 'universal'
  return stored as Domain
}

export function DomainProvider({ children }: DomainProviderProps) {
  const [currentDomain, setCurrentDomain] = useState<Domain>(() => {
    try {
      return resolveInitialDomain(
        localStorage.getItem(DOMAIN_KEY),
        localStorage.getItem(DOMAIN_DAY_KEY),
        localDayKey(new Date()),
      )
    } catch {
      return 'universal'
    }
  })

  useEffect(() => {
    // Stamp the day alongside the choice, so tomorrow's load can tell that
    // this was yesterday's lens rather than a fresh one.
    try {
      localStorage.setItem(DOMAIN_KEY, currentDomain)
      localStorage.setItem(DOMAIN_DAY_KEY, localDayKey(new Date()))
    } catch { /* ignore */ }
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
