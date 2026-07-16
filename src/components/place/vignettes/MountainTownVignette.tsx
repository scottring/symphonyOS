/** Small Mountain Town — one road in, peaks over every rooftop.
 *  Flat-vector medallion in the place-theme style. Decorative. */
export function MountainTownVignette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img"
      aria-label="A small mountain town with peaks, a church, and a winding road" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="mt-clip"><circle cx="100" cy="100" r="96" /></clipPath>
      </defs>
      <g clipPath="url(#mt-clip)">
        {/* sky */}
        <rect width="200" height="200" fill="hsl(208 55% 80%)" />
        {/* far peaks */}
        <path d="M0 96 L36 44 L64 84 L100 20 L138 78 L166 50 L200 92 V140 H0 Z" fill="hsl(214 32% 62%)" />
        {/* alpenglow faces + snow caps */}
        <path d="M100 20 L124 57 L100 62 L84 46 Z" fill="hsl(22 55% 74%)" />
        <path d="M100 20 L110 36 L103 40 L96 34 L90 36 Z" fill="hsl(40 40% 96%)" />
        <path d="M36 44 L48 61 L40 64 L32 56 L28 56 Z" fill="hsl(40 40% 96%)" />
        <path d="M166 50 L175 63 L168 66 L160 59 Z" fill="hsl(40 40% 96%)" />
        {/* shadow ridges */}
        <path d="M100 20 L138 78 L110 84 L100 62 Z" fill="hsl(216 35% 52%)" opacity="0.55" />
        <path d="M36 44 L64 84 L44 88 Z" fill="hsl(216 35% 52%)" opacity="0.45" />
        {/* forest band */}
        <path d="M0 106 Q50 92 100 102 T200 100 V150 H0 Z" fill="hsl(200 30% 42%)" />
        <g fill="hsl(202 32% 34%)">
          <path d="M20 108 l6 -14 l6 14 Z M40 104 l6 -14 l6 14 Z M150 104 l6 -14 l6 14 Z M172 108 l6 -14 l6 14 Z" />
        </g>
        {/* church */}
        <g>
          <rect x="118" y="92" width="18" height="28" fill="hsl(40 42% 90%)" />
          <path d="M116 92 L127 82 L138 92 Z" fill="hsl(212 26% 38%)" />
          <rect x="124" y="70" width="7" height="24" fill="hsl(40 42% 90%)" />
          <path d="M122 72 L127.5 58 L133 72 Z" fill="hsl(212 26% 38%)" />
          <rect x="126.8" y="52" width="1.6" height="7" fill="hsl(212 26% 30%)" />
          <rect x="124" y="98" width="6" height="10" rx="3" fill="hsl(42 88% 68%)" />
        </g>
        {/* houses left */}
        <g>
          <rect x="18" y="112" width="30" height="24" fill="hsl(40 45% 88%)" />
          <path d="M15 112 L33 96 L51 112 Z" fill="hsl(212 25% 40%)" />
          <rect x="24" y="118" width="7" height="8" rx="1" fill="hsl(42 88% 68%)" />
          <rect x="37" y="118" width="7" height="8" rx="1" fill="hsl(42 88% 68%)" />
          <rect x="30" y="100" width="4" height="8" fill="hsl(20 30% 45%)" />
          <rect x="56" y="118" width="26" height="20" fill="hsl(18 45% 72%)" />
          <path d="M53 118 L69 104 L85 118 Z" fill="hsl(214 28% 34%)" />
          <rect x="61" y="123" width="6" height="7" rx="1" fill="hsl(42 88% 68%)" />
          <rect x="72" y="123" width="6" height="7" rx="1" fill="hsl(42 88% 68%)" />
        </g>
        {/* houses right */}
        <g>
          <rect x="146" y="114" width="34" height="24" fill="hsl(36 30% 80%)" />
          <path d="M142 114 L163 98 L184 114 Z" fill="hsl(210 24% 36%)" />
          <rect x="152" y="120" width="7" height="8" rx="1" fill="hsl(42 88% 68%)" />
          <rect x="166" y="120" width="7" height="8" rx="1" fill="hsl(42 88% 68%)" />
          <rect x="160" y="102" width="4" height="8" fill="hsl(20 30% 45%)" />
        </g>
        {/* meadow */}
        <path d="M0 136 Q60 128 100 134 T200 132 V200 H0 Z" fill="hsl(140 26% 56%)" />
        <path d="M0 152 Q70 144 200 150 V200 H0 Z" fill="hsl(138 28% 48%)" />
        {/* winding road */}
        <path d="M88 200 C86 178 96 166 110 158 C124 150 128 144 126 136 L134 136 C138 148 128 156 116 163 C102 171 98 180 102 200 Z"
          fill="hsl(215 12% 58%)" />
        <path d="M96 196 C96 180 104 170 114 162 M118 158 C126 152 131 145 130 138"
          stroke="hsl(45 35% 88%)" strokeWidth="1.6" strokeDasharray="5 5" fill="none" opacity="0.85" />
        {/* autumn trees */}
        <g>
          <rect x="34" y="146" width="3" height="12" fill="hsl(25 30% 32%)" />
          <circle cx="35.5" cy="141" r="9" fill="hsl(24 65% 54%)" />
          <rect x="62" y="152" width="3" height="12" fill="hsl(25 30% 32%)" />
          <circle cx="63.5" cy="147" r="8" fill="hsl(40 70% 58%)" />
          <rect x="152" y="148" width="3" height="12" fill="hsl(25 30% 32%)" />
          <circle cx="153.5" cy="143" r="9" fill="hsl(14 60% 50%)" />
          <rect x="176" y="156" width="3" height="12" fill="hsl(25 30% 32%)" />
          <circle cx="177.5" cy="151" r="8" fill="hsl(36 68% 56%)" />
        </g>
        {/* pines in meadow */}
        <g fill="hsl(165 30% 32%)">
          <path d="M12 168 l8 -18 l8 18 Z" />
          <path d="M14 158 l6 -13 l6 13 Z" />
          <path d="M130 172 l8 -18 l8 18 Z" />
          <path d="M132 162 l6 -13 l6 13 Z" />
        </g>
        {/* street lamps */}
        <g>
          <rect x="82" y="162" width="2.2" height="16" fill="hsl(212 25% 26%)" />
          <circle cx="83" cy="160" r="2.8" fill="hsl(42 95% 68%)" />
          <rect x="116" y="170" width="2.2" height="16" fill="hsl(212 25% 26%)" />
          <circle cx="117" cy="168" r="2.8" fill="hsl(42 95% 68%)" />
        </g>
      </g>
    </svg>
  )
}
