import type { HomeViewType } from '@/types/homeView'

interface HomeViewSwitcherProps {
  currentView: HomeViewType
  onViewChange: (view: HomeViewType) => void
}

// Tri-fold brochure icons - tree logo that unfolds to reveal more panels
// Panel dimensions: 6 units wide x 14 units tall, consistent across all icons

// Tree logo component used in all icons
function TreeLogo({ x, scale = 1 }: { x: number; scale?: number }) {
  const cx = x + 3 // center of 6-unit panel
  return (
    <g transform={`translate(${cx}, 11) scale(${scale}) translate(${-cx}, -11)`}>
      {/* Two-tone circle background */}
      <clipPath id={`treeClip-${x}`}>
        <circle cx={cx} cy={9} r={2.5} />
      </clipPath>
      {/* Green half (top-left) */}
      <circle cx={cx} cy={9} r={2.5} fill="#94a89a" />
      {/* Blue half (bottom-right) */}
      <path d={`M ${cx} 6.5 L ${cx + 2.5} 9 L ${cx} 11.5 L ${cx - 2.5} 9 Z`} fill="#7a99a8" clipPath={`url(#treeClip-${x})`} transform={`rotate(45, ${cx}, 9)`} />
      {/* Tree trunk and branches */}
      <g stroke="#4a5a52" strokeWidth={0.6} strokeLinecap="round" fill="none">
        <line x1={cx} y1={8} x2={cx} y2={14} />
        <line x1={cx} y1={9.5} x2={cx - 1.2} y2={8} />
        <line x1={cx} y1={9.5} x2={cx + 1.2} y2={8} />
        <line x1={cx} y1={11} x2={cx - 1} y2={9.5} />
        <line x1={cx} y1={11} x2={cx + 1} y2={9.5} />
      </g>
    </g>
  )
}

// Map panel component
function MapPanel({ x }: { x: number }) {
  const cx = x + 3
  return (
    <g>
      {/* Simple map background */}
      <rect x={x + 0.5} y={6} width={5} height={8} rx={0.3} fill="#e8ebe8" />
      {/* Roads */}
      <path d={`M ${x + 1} 10 Q ${cx} 8 ${x + 5} 11`} stroke="#c5ccc5" strokeWidth={0.5} fill="none" />
      <line x1={x + 2.5} y1={6.5} x2={x + 2.5} y2={13.5} stroke="#c5ccc5" strokeWidth={0.4} />
      {/* Green areas */}
      <rect x={x + 1} y={7} width={1.5} height={1.2} rx={0.2} fill="#b5c4b5" />
      <rect x={x + 3.5} y={11} width={1.2} height={1.5} rx={0.2} fill="#b5c4b5" />
      {/* Location pin */}
      <circle cx={x + 4} cy={8.5} r={0.6} fill="#7a99a8" />
      <circle cx={x + 4} cy={8.5} r={0.25} fill="white" />
    </g>
  )
}

// Next steps / cycle panel component
function CyclePanel({ x }: { x: number }) {
  const cx = x + 3
  return (
    <g>
      {/* Circular arrows */}
      <path
        d={`M ${cx + 1.5} ${9 - 1.2} A 1.5 1.5 0 1 1 ${cx - 1.5} ${9 + 0.3}`}
        stroke="#94a89a"
        strokeWidth={0.6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - 1.5} ${9 + 1.2} A 1.5 1.5 0 1 1 ${cx + 1.5} ${9 - 0.3}`}
        stroke="#7a99a8"
        strokeWidth={0.6}
        fill="none"
        strokeLinecap="round"
      />
      {/* Arrow heads */}
      <polygon points={`${cx + 1.8},${9 - 1.5} ${cx + 1.2},${9 - 0.8} ${cx + 2.2},${9 - 0.9}`} fill="#94a89a" />
      <polygon points={`${cx - 1.8},${9 + 1.5} ${cx - 1.2},${9 + 0.8} ${cx - 2.2},${9 + 0.9}`} fill="#7a99a8" />
      {/* Center label placeholder lines */}
      <line x1={cx - 0.8} y1={8.5} x2={cx + 0.8} y2={8.5} stroke="#9ca3af" strokeWidth={0.3} />
      <line x1={cx - 0.5} y1={9.5} x2={cx + 0.5} y2={9.5} stroke="#9ca3af" strokeWidth={0.3} />
    </g>
  )
}

// Single panel - just the tree (Today)
function MapFoldOneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Single centered panel */}
      <rect x="9" y="4" width="6" height="14" rx="1" stroke="currentColor" strokeWidth={1.2} fill="white" />
      <TreeLogo x={9} />
    </svg>
  )
}

// Two panels - tree + map (Today + Context)
function MapFoldTwoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Left panel - tree */}
      <rect x="5" y="4" width="6" height="14" rx="1" stroke="currentColor" strokeWidth={1.2} fill="white" />
      <TreeLogo x={5} scale={0.85} />
      {/* Right panel - map */}
      <rect x="12" y="4" width="6" height="14" rx="1" stroke="currentColor" strokeWidth={1.2} fill="white" />
      <MapPanel x={12} />
    </svg>
  )
}

// Three panels - tree + map + cycle (Week)
function MapFoldThreeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Left panel - tree */}
      <rect x="1.5" y="4" width="6" height="14" rx="0.75" stroke="currentColor" strokeWidth={1.2} fill="white" />
      <TreeLogo x={1.5} scale={0.75} />
      {/* Center panel - map */}
      <rect x="8.5" y="4" width="6" height="14" rx="0.75" stroke="currentColor" strokeWidth={1.2} fill="white" />
      <MapPanel x={8.5} />
      {/* Right panel - cycle/next steps */}
      <rect x="15.5" y="4" width="6" height="14" rx="0.75" stroke="currentColor" strokeWidth={1.2} fill="white" />
      <CyclePanel x={15.5} />
    </svg>
  )
}

const views: { value: HomeViewType; label: string; icon: typeof MapFoldOneIcon }[] = [
  { value: 'today', label: 'Today', icon: MapFoldOneIcon },
  { value: 'today-context', label: 'Today + Context', icon: MapFoldTwoIcon },
  { value: 'week', label: 'Week', icon: MapFoldThreeIcon },
]

export function HomeViewSwitcher({ currentView, onViewChange }: HomeViewSwitcherProps) {
  return (
    <div className="inline-flex items-center bg-neutral-100/80 rounded-lg p-0.5 gap-0.5">
      {views.map((view) => {
        const isActive = currentView === view.value
        const Icon = view.icon
        return (
          <button
            key={view.value}
            onClick={() => onViewChange(view.value)}
            title={view.label}
            aria-label={view.label}
            className={`
              relative p-2 rounded-md
              transition-all duration-200 ease-out
              ${isActive
                ? 'text-neutral-800 bg-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-600 hover:bg-white/50'
              }
            `}
          >
            <Icon className="w-5 h-5" />
          </button>
        )
      })}
    </div>
  )
}
