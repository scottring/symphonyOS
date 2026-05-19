import { useLocation, useNavigate } from 'react-router-dom'

const TABS: { key: 'plan' | 'today' | 'recipes' | 'habits'; path: string; label: string }[] = [
  { key: 'plan',    path: '/meals/plan',   label: 'Plan'    },
  { key: 'today',   path: '/meals/today',  label: 'Today'   },
  { key: 'recipes', path: '/meals/shelf',  label: 'Recipes' },
  { key: 'habits',  path: '/meals/habits', label: 'Habits'  },
]

/** Editorial-calm tab strip used at the top of every meals surface. */
export function MealsTabs() {
  const location = useLocation()
  const navigate = useNavigate()

  const active: typeof TABS[number]['key'] =
    location.pathname.startsWith('/meals/today') ? 'today'
    : location.pathname.startsWith('/meals/shelf') ? 'recipes'
    : location.pathname.startsWith('/meals/habits') ? 'habits'
    : 'plan'

  return (
    <nav aria-label="Meals sections" className="mb-6 flex items-center gap-1 border-b border-neutral-200">
      {TABS.map(t => {
        const isActive = t.key === active
        return (
          <button
            key={t.key}
            onClick={() => navigate(t.path)}
            className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px ${
              isActive
                ? 'text-primary-700 border-b-2 border-primary-500'
                : 'text-neutral-500 hover:text-neutral-700 border-b-2 border-transparent'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
