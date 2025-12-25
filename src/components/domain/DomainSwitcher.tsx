import { Briefcase, Users, User, Globe } from 'lucide-react'
import { useDomain, type Domain } from '@/hooks/useDomain'

const DOMAINS = [
  {
    value: 'universal' as Domain,
    label: 'Universal',
    icon: Globe,
    color: 'text-neutral-700',
    activeColor: 'text-neutral-800',
    accentColor: 'bg-neutral-300',
    shadowColor: 'shadow-neutral-200/50'
  },
  {
    value: 'work' as Domain,
    label: 'Work',
    icon: Briefcase,
    color: 'text-blue-600',
    activeColor: 'text-blue-700',
    accentColor: 'bg-blue-400',
    shadowColor: 'shadow-blue-200/40'
  },
  {
    value: 'family' as Domain,
    label: 'Family',
    icon: Users,
    color: 'text-amber-600',
    activeColor: 'text-amber-700',
    accentColor: 'bg-amber-400',
    shadowColor: 'shadow-amber-200/40'
  },
  {
    value: 'personal' as Domain,
    label: 'Personal',
    icon: User,
    color: 'text-purple-600',
    activeColor: 'text-purple-700',
    accentColor: 'bg-purple-400',
    shadowColor: 'shadow-purple-200/40'
  },
]

export function DomainSwitcher() {
  const { currentDomain, setDomain } = useDomain()

  return (
    <div
      className="inline-flex items-stretch bg-bg-elevated/90 backdrop-blur-sm rounded-lg overflow-hidden"
      style={{
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4)',
      }}
    >
      {DOMAINS.map((domain, index) => {
        const Icon = domain.icon
        const isActive = domain.value === currentDomain
        const isFirst = index === 0

        return (
          <button
            key={domain.value}
            onClick={() => setDomain(domain.value)}
            title={domain.label}
            className={`
              group relative px-3 py-2.5 transition-all duration-300 ease-out
              ${isActive ? domain.activeColor : 'text-neutral-400'}
              ${!isFirst ? 'border-l border-neutral-200/40' : ''}
              hover:bg-neutral-50/50
            `}
            style={{
              transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
            }}
          >
            {/* Icon */}
            <Icon
              className={`
                w-[18px] h-[18px] transition-all duration-300
                ${isActive ? 'scale-100' : 'scale-90 opacity-70 group-hover:scale-95 group-hover:opacity-85'}
              `}
              strokeWidth={isActive ? 2.5 : 2}
            />

            {/* Active indicator - refined accent bar */}
            {isActive && (
              <div
                className={`
                  absolute left-1/2 -translate-x-1/2 bottom-0 w-3 h-[3px] rounded-full
                  ${domain.accentColor}
                  transition-all duration-300 ease-out
                `}
                style={{
                  boxShadow: `0 2px 8px ${domain.color.replace('text-', 'rgb(')}/0.4)`,
                }}
              />
            )}

            {/* Subtle hover glow */}
            <div
              className={`
                absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
                ${isActive ? 'opacity-0' : ''}
              `}
              style={{
                background: `radial-gradient(circle at center, ${domain.color.replace('text-', 'rgb(')}/0.05) 0%, transparent 70%)`,
              }}
            />
          </button>
        )
      })}
    </div>
  )
}
