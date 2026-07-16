/** Densely Urban — steel towers, an elevated train, streetlight amber.
 *  Flat-vector medallion in the place-theme style. Decorative. */
export function DenselyUrbanVignette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img"
      aria-label="A dense city with towers and an elevated train" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="du-clip"><circle cx="100" cy="100" r="96" /></clipPath>
        <pattern id="du-win-lt" width="7" height="9" patternUnits="userSpaceOnUse">
          <rect width="7" height="9" fill="hsl(216 22% 70%)" />
          <rect x="1.5" y="2" width="3" height="4" fill="hsl(214 30% 82%)" />
        </pattern>
        <pattern id="du-win-md" width="8" height="10" patternUnits="userSpaceOnUse">
          <rect width="8" height="10" fill="hsl(217 26% 52%)" />
          <rect x="2" y="2.5" width="3.5" height="4.5" fill="hsl(212 35% 78%)" />
        </pattern>
        <pattern id="du-win-dk" width="9" height="11" patternUnits="userSpaceOnUse">
          <rect width="9" height="11" fill="hsl(219 32% 32%)" />
          <rect x="2" y="2.5" width="4" height="5" fill="hsl(45 80% 72%)" opacity="0.9" />
        </pattern>
      </defs>
      <g clipPath="url(#du-clip)">
        {/* sky */}
        <rect width="200" height="200" fill="hsl(213 35% 88%)" />
        {/* far skyline */}
        <g fill="hsl(215 22% 76%)">
          <rect x="8" y="52" width="16" height="80" />
          <rect x="30" y="34" width="20" height="98" />
          <rect x="56" y="44" width="14" height="88" />
          <rect x="126" y="30" width="18" height="100" />
          <rect x="150" y="48" width="15" height="84" />
          <rect x="170" y="38" width="22" height="94" />
          <rect x="74" y="26" width="22" height="106" />
          <rect x="100" y="40" width="20" height="92" />
        </g>
        {/* mid towers with windows */}
        <g>
          <rect x="16" y="64" width="24" height="72" fill="url(#du-win-md)" />
          <rect x="16" y="60" width="24" height="5" fill="hsl(217 26% 46%)" />
          <rect x="46" y="50" width="28" height="86" fill="url(#du-win-md)" />
          <rect x="46" y="46" width="28" height="5" fill="hsl(217 26% 46%)" />
          <rect x="58" y="38" width="4" height="9" fill="hsl(217 26% 46%)" />
          <rect x="132" y="56" width="26" height="80" fill="url(#du-win-md)" />
          <rect x="132" y="52" width="26" height="5" fill="hsl(217 26% 46%)" />
          <rect x="164" y="66" width="24" height="70" fill="url(#du-win-md)" />
          <rect x="164" y="62" width="24" height="5" fill="hsl(217 26% 46%)" />
          <rect x="84" y="42" width="34" height="94" fill="url(#du-win-lt)" />
          <rect x="84" y="38" width="34" height="5" fill="hsl(216 22% 62%)" />
          <rect x="98" y="28" width="5" height="11" fill="hsl(216 22% 62%)" />
        </g>
        {/* foreground blocks, lit windows */}
        <g>
          <rect x="2" y="88" width="30" height="52" fill="url(#du-win-dk)" />
          <rect x="2" y="84" width="30" height="5" fill="hsl(219 34% 24%)" />
          <rect x="120" y="92" width="34" height="48" fill="url(#du-win-dk)" />
          <rect x="120" y="88" width="34" height="5" fill="hsl(219 34% 24%)" />
          <rect x="160" y="98" width="38" height="42" fill="url(#du-win-dk)" />
          <rect x="160" y="94" width="38" height="5" fill="hsl(219 34% 24%)" />
          <rect x="40" y="96" width="42" height="44" fill="url(#du-win-dk)" />
          <rect x="40" y="92" width="42" height="5" fill="hsl(219 34% 24%)" />
        </g>
        {/* elevated rail */}
        <rect x="0" y="138" width="200" height="7" fill="hsl(219 30% 30%)" />
        <rect x="0" y="145" width="200" height="2.5" fill="hsl(219 30% 22%)" />
        <g fill="hsl(219 28% 34%)">
          <rect x="22" y="147" width="6" height="26" />
          <rect x="74" y="147" width="6" height="26" />
          <rect x="126" y="147" width="6" height="26" />
          <rect x="178" y="147" width="6" height="26" />
        </g>
        {/* train */}
        <g>
          <rect x="30" y="124" width="112" height="15" rx="6" fill="hsl(210 20% 92%)" />
          <path d="M142 124 h6 a8 8 0 0 1 8 8 v7 h-14 Z" fill="hsl(210 20% 92%)" />
          <rect x="30" y="128" width="112" height="4" fill="hsl(213 45% 55%)" />
          <g fill="hsl(218 35% 40%)">
            <rect x="38" y="127" width="9" height="6" rx="1.5" />
            <rect x="53" y="127" width="9" height="6" rx="1.5" />
            <rect x="68" y="127" width="9" height="6" rx="1.5" />
            <rect x="83" y="127" width="9" height="6" rx="1.5" />
            <rect x="98" y="127" width="9" height="6" rx="1.5" />
            <rect x="113" y="127" width="9" height="6" rx="1.5" />
            <rect x="128" y="127" width="9" height="6" rx="1.5" />
            <rect x="145" y="127" width="7" height="6" rx="1.5" />
          </g>
          <circle cx="153" cy="133" r="2" fill="hsl(45 90% 70%)" />
        </g>
        {/* street */}
        <rect x="0" y="168" width="200" height="32" fill="hsl(218 18% 46%)" />
        <g fill="hsl(45 25% 88%)" opacity="0.9">
          <rect x="96" y="170" width="8" height="26" transform="skewX(-12)" />
          <rect x="112" y="170" width="8" height="26" transform="skewX(-12)" />
          <rect x="128" y="170" width="8" height="26" transform="skewX(-12)" />
          <rect x="144" y="170" width="8" height="26" transform="skewX(-12)" />
        </g>
        {/* cars */}
        <g>
          <rect x="58" y="176" width="26" height="9" rx="3" fill="hsl(354 45% 42%)" />
          <path d="M63 176 q4 -6 10 -6 t10 6 Z" fill="hsl(354 45% 42%)" />
          <circle cx="65" cy="186" r="3.2" fill="hsl(219 30% 18%)" />
          <circle cx="78" cy="186" r="3.2" fill="hsl(219 30% 18%)" />
          <rect x="112" y="180" width="24" height="8" rx="3" fill="hsl(213 40% 60%)" />
          <path d="M116 180 q4 -5 9 -5 t9 5 Z" fill="hsl(213 40% 60%)" />
          <circle cx="118" cy="189" r="3" fill="hsl(219 30% 18%)" />
          <circle cx="130" cy="189" r="3" fill="hsl(219 30% 18%)" />
        </g>
        {/* street trees + lamps */}
        <g>
          <rect x="49" y="158" width="2.5" height="12" fill="hsl(25 25% 32%)" />
          <circle cx="50" cy="155" r="7" fill="hsl(155 22% 42%)" />
          <rect x="119" y="158" width="2.5" height="12" fill="hsl(25 25% 32%)" />
          <circle cx="120" cy="155" r="7" fill="hsl(155 22% 42%)" />
          <rect x="167" y="152" width="2" height="18" fill="hsl(219 25% 25%)" />
          <circle cx="168" cy="150" r="2.6" fill="hsl(40 85% 68%)" />
        </g>
      </g>
    </svg>
  )
}
