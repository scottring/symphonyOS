import { useTheme } from '@/hooks/useTheme'
import type { ThemeVariant } from '@/config/theme'

export function ThemeSelector() {
  const { theme, setTheme, themes } = useTheme()

  const themeOptions: Array<{
    id: ThemeVariant
    name: string
    description: string
    preview: string
  }> = [
    {
      id: 'nordic',
      name: themes.nordic.name,
      description: themes.nordic.description,
      preview: 'bg-gradient-to-br from-warmCream-100 to-warmCream-50',
    },
    {
      id: 'kinetic',
      name: themes.kinetic.name,
      description: themes.kinetic.description,
      preview: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
    },
  ]

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-700 mb-2">Appearance</h2>
      <p className="text-sm text-neutral-500 mb-6">
        Choose your preferred design system. This will reload the page to apply changes.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {themeOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => setTheme(option.id)}
            className={`
              relative p-4 rounded-xl border-2 transition-all text-left
              ${theme === option.id
                ? 'border-primary-500 bg-primary-50 shadow-md'
                : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'
              }
            `}
          >
            {/* Preview box */}
            <div className={`w-full h-24 rounded-lg mb-3 ${option.preview} shadow-inner`}>
              {/* Show checkmark if selected */}
              {theme === option.id && (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Theme info */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-neutral-800">{option.name}</h3>
                {theme === option.id && (
                  <span className="text-xs px-2 py-0.5 bg-primary-500 text-white rounded-full font-medium">
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-500">{option.description}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
