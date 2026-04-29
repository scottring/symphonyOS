import { useNavigate } from 'react-router-dom'

type TabKey = 'plan' | 'groceries' | 'habits'

interface MobileTabBarProps {
  active: TabKey
}

interface TabItem {
  key: TabKey
  label: string
  /** Glyph used in the read-only design system. */
  glyph: string
  path: string
}

// TODO: Groceries tab points at /meals/shelf because there's no dedicated mobile
// groceries page yet. Swap to /meals/groceries (or a mobile-specific route) once
// that surface ships.
const TABS: TabItem[] = [
  { key: 'plan',      label: 'Plan',      glyph: '◍', path: '/meals/plan'   },
  { key: 'groceries', label: 'Groceries', glyph: '✓', path: '/meals/shelf'  },
  { key: 'habits',    label: 'Habits',    glyph: '◐', path: '/meals/habits' },
]

/** Sticky bottom navigation for the mobile meals surfaces. */
export function MobileTabBar({ active }: MobileTabBarProps) {
  const navigate = useNavigate()

  return (
    <nav
      aria-label="Meals sections"
      className="fixed bottom-0 left-0 right-0 z-30 bg-bg-elevated border-t border-neutral-200"
    >
      <ul className="flex items-stretch">
        {TABS.map(tab => {
          const isActive = tab.key === active
          return (
            <li key={tab.key} className="flex-1">
              <button
                type="button"
                onClick={() => navigate(tab.path)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full flex-col items-center justify-center gap-0.5 py-3 transition-colors ${
                  isActive
                    ? 'text-primary-700'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <span aria-hidden="true" className="text-[18px] leading-none">
                  {tab.glyph}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.18em]">
                  {tab.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
