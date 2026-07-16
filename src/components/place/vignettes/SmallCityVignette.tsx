/** Small City — a river, a clock tower, dusk coming on.
 *  Flat-vector medallion in the place-theme style. Decorative. */
export function SmallCityVignette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img"
      aria-label="A small city at dusk with a clock tower and a bridge" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="sc-clip"><circle cx="100" cy="100" r="96" /></clipPath>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(268 40% 78%)" />
          <stop offset="0.55" stopColor="hsl(300 35% 82%)" />
          <stop offset="1" stopColor="hsl(25 75% 84%)" />
        </linearGradient>
        <linearGradient id="sc-river" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(255 35% 48%)" />
          <stop offset="1" stopColor="hsl(250 40% 36%)" />
        </linearGradient>
      </defs>
      <g clipPath="url(#sc-clip)">
        <rect width="200" height="200" fill="url(#sc-sky)" />
        {/* distant hills + skyline */}
        <path d="M0 84 L30 62 L58 82 L96 56 L134 80 L168 60 L200 78 V120 H0 Z" fill="hsl(266 28% 70%)" />
        <g fill="hsl(264 24% 60%)">
          <rect x="6" y="72" width="14" height="42" />
          <rect x="24" y="64" width="16" height="50" />
          <rect x="150" y="66" width="15" height="48" />
          <rect x="170" y="74" width="18" height="40" />
        </g>
        {/* clock tower */}
        <g>
          <rect x="88" y="46" width="20" height="66" fill="hsl(30 35% 74%)" />
          <rect x="86" y="42" width="24" height="6" rx="1" fill="hsl(262 30% 42%)" />
          <path d="M86 42 Q98 22 110 42 Z" fill="hsl(262 32% 38%)" />
          <rect x="96.5" y="16" width="3" height="10" fill="hsl(262 32% 38%)" />
          <circle cx="98" cy="14" r="2.5" fill="hsl(40 85% 66%)" />
          <circle cx="98" cy="60" r="8.5" fill="hsl(45 60% 92%)" stroke="hsl(262 30% 42%)" strokeWidth="1.6" />
          <path d="M98 60 V54.5 M98 60 L102 62" stroke="hsl(262 35% 30%)" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="93" y="76" width="4.5" height="8" rx="2" fill="hsl(262 28% 48%)" />
          <rect x="99.5" y="76" width="4.5" height="8" rx="2" fill="hsl(262 28% 48%)" />
          <rect x="93" y="92" width="4.5" height="8" rx="2" fill="hsl(42 90% 70%)" />
          <rect x="99.5" y="92" width="4.5" height="8" rx="2" fill="hsl(42 90% 70%)" />
        </g>
        {/* church spire */}
        <g>
          <rect x="146" y="72" width="13" height="42" fill="hsl(28 30% 70%)" />
          <path d="M144 72 L152.5 48 L161 72 Z" fill="hsl(262 32% 38%)" />
          <rect x="151.5" y="42" width="2" height="8" fill="hsl(262 32% 38%)" />
          <rect x="150" y="80" width="5" height="9" rx="2.5" fill="hsl(42 90% 70%)" />
        </g>
        {/* rowhouses */}
        <g>
          <rect x="6" y="88" width="26" height="30" fill="hsl(28 42% 78%)" />
          <path d="M4 88 L19 76 L34 88 Z" fill="hsl(262 30% 40%)" />
          <rect x="34" y="92" width="24" height="26" fill="hsl(350 35% 76%)" />
          <path d="M34 92 L46 82 L58 92 Z" fill="hsl(258 28% 44%)" />
          <rect x="60" y="90" width="24" height="28" fill="hsl(40 45% 80%)" />
          <path d="M60 90 L72 79 L84 90 Z" fill="hsl(266 30% 38%)" />
          <rect x="112" y="90" width="26" height="28" fill="hsl(20 40% 78%)" />
          <path d="M112 90 L125 79 L138 90 Z" fill="hsl(258 30% 42%)" />
          <rect x="162" y="92" width="30" height="26" fill="hsl(32 40% 76%)" />
          <path d="M162 92 L177 81 L192 92 Z" fill="hsl(264 28% 40%)" />
          {/* lit windows */}
          <g fill="hsl(42 90% 70%)">
            <rect x="12" y="96" width="5" height="7" rx="1" />
            <rect x="22" y="96" width="5" height="7" rx="1" />
            <rect x="40" y="98" width="5" height="7" rx="1" />
            <rect x="49" y="98" width="5" height="7" rx="1" />
            <rect x="66" y="97" width="5" height="7" rx="1" />
            <rect x="75" y="97" width="5" height="7" rx="1" />
            <rect x="118" y="97" width="5" height="7" rx="1" />
            <rect x="128" y="97" width="5" height="7" rx="1" />
            <rect x="169" y="98" width="5" height="7" rx="1" />
            <rect x="180" y="98" width="5" height="7" rx="1" />
          </g>
        </g>
        {/* embankment + bridge */}
        <rect x="0" y="118" width="200" height="10" fill="hsl(270 20% 66%)" />
        <g>
          <rect x="0" y="128" width="200" height="14" fill="hsl(268 18% 58%)" />
          <path d="M22 142 a16 14 0 0 1 32 0 Z M84 142 a16 14 0 0 1 32 0 Z M146 142 a16 14 0 0 1 32 0 Z"
            fill="hsl(255 35% 45%)" />
          <rect x="0" y="126" width="200" height="3.5" fill="hsl(270 22% 72%)" />
        </g>
        {/* river with reflections */}
        <rect x="0" y="142" width="200" height="58" fill="url(#sc-river)" />
        <g stroke="hsl(280 40% 72%)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7">
          <path d="M28 152 h18 M60 160 h14 M120 154 h18 M156 164 h14 M84 170 h20 M40 176 h14 M132 178 h16" />
        </g>
        <g stroke="hsl(42 90% 70%)" strokeWidth="1.8" strokeLinecap="round" opacity="0.8">
          <path d="M52 148 v10 M148 148 v10" />
        </g>
        {/* lampposts on bridge */}
        <g>
          <rect x="51" y="112" width="2.2" height="16" fill="hsl(262 30% 26%)" />
          <circle cx="52" cy="110" r="3" fill="hsl(42 95% 68%)" />
          <rect x="147" y="112" width="2.2" height="16" fill="hsl(262 30% 26%)" />
          <circle cx="148" cy="110" r="3" fill="hsl(42 95% 68%)" />
          <rect x="99" y="110" width="2.2" height="18" fill="hsl(262 30% 26%)" />
          <circle cx="100" cy="108" r="3" fill="hsl(42 95% 68%)" />
        </g>
        {/* dusk trees */}
        <g>
          <rect x="14" y="108" width="3" height="12" fill="hsl(262 25% 30%)" />
          <circle cx="15.5" cy="103" r="9" fill="hsl(285 30% 62%)" />
          <rect x="183" y="108" width="3" height="12" fill="hsl(262 25% 30%)" />
          <circle cx="184.5" cy="103" r="9" fill="hsl(285 30% 62%)" />
          <rect x="103" y="112" width="2.5" height="8" fill="hsl(262 25% 30%)" />
          <circle cx="104" cy="108" r="6.5" fill="hsl(290 28% 58%)" />
        </g>
      </g>
    </svg>
  )
}
