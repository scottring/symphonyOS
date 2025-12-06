import type { TravelMode } from '@/types/directions'

interface TravelModeSelectorProps {
  mode: TravelMode
  onChange: (mode: TravelMode) => void
}

const modes: { value: TravelMode; label: string; icon: React.ReactNode }[] = [
  {
    value: 'driving',
    label: 'Car',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M8 16.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z" />
        <path fillRule="evenodd" d="M4 4a4 4 0 014-4h4a4 4 0 014 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm4-2a2 2 0 00-2 2v.5h8V4a2 2 0 00-2-2H8zm6 4.5H6V14h8V6.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    value: 'walking',
    label: 'Walk',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 3.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM10 5l-4 8h2l2-4v8h2v-8l2 4h2L10 5z" />
      </svg>
    ),
  },
  {
    value: 'transit',
    label: 'Transit',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 2a4 4 0 00-4 4v8a4 4 0 004 4h10a4 4 0 004-4V6a4 4 0 00-4-4H5zm0 2h10a2 2 0 012 2v3H3V6a2 2 0 012-2zm5 7a1 1 0 100 2 1 1 0 000-2zm-4 0a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
      </svg>
    ),
  },
]

export function TravelModeSelector({ mode, onChange }: TravelModeSelectorProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
      {modes.map(({ value, label, icon }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`
            flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all
            ${mode === value
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-700'
            }
          `}
          title={label}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
