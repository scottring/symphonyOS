/** Farm — barn red, wheat gold, rows to the horizon.
 *  Flat-vector medallion in the place-theme style. Decorative. */
export function FarmVignette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img"
      aria-label="A farm with a red barn, silo, windmill, and fields" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="fm-clip"><circle cx="100" cy="100" r="96" /></clipPath>
      </defs>
      <g clipPath="url(#fm-clip)">
        {/* sky + clouds */}
        <rect width="200" height="200" fill="hsl(205 60% 83%)" />
        <g fill="hsl(40 30% 97%)">
          <ellipse cx="46" cy="38" rx="18" ry="7" />
          <ellipse cx="60" cy="34" rx="12" ry="5.5" />
          <ellipse cx="152" cy="28" rx="16" ry="6" />
          <ellipse cx="164" cy="24" rx="10" ry="4.5" />
        </g>
        {/* distant hills + tree line */}
        <path d="M0 92 Q50 78 100 88 T200 84 V130 H0 Z" fill="hsl(140 28% 64%)" />
        <g fill="hsl(140 30% 52%)">
          <circle cx="16" cy="92" r="8" />
          <circle cx="28" cy="90" r="6.5" />
          <circle cx="182" cy="88" r="8" />
          <circle cx="192" cy="92" r="6" />
        </g>
        {/* windmill */}
        <g>
          <path d="M62 66 L66 112 H54 L58 66 Z" fill="hsl(210 15% 60%)" />
          <path d="M56 112 h8 M57 100 h7 M58 88 h6" stroke="hsl(210 15% 48%)" strokeWidth="1.5" />
          <circle cx="60" cy="64" r="2.6" fill="hsl(210 18% 40%)" />
          <g fill="hsl(40 25% 92%)" stroke="hsl(210 15% 55%)" strokeWidth="0.8">
            <path d="M60 64 L60 40 L65 46 Z" />
            <path d="M60 64 L84 64 L78 69 Z" />
            <path d="M60 64 L60 88 L55 82 Z" />
            <path d="M60 64 L36 64 L42 59 Z" />
          </g>
        </g>
        {/* silo */}
        <g>
          <rect x="146" y="62" width="18" height="52" rx="2" fill="hsl(45 32% 86%)" />
          <path d="M146 64 a9 8 0 0 1 18 0 Z" fill="hsl(10 45% 40%)" />
          <path d="M150 66 v46" stroke="hsl(42 25% 74%)" strokeWidth="1.6" />
        </g>
        {/* barn */}
        <g>
          <rect x="96" y="84" width="48" height="32" fill="hsl(5 58% 45%)" />
          <path d="M92 84 L100 72 L140 72 L148 84 Z" fill="hsl(8 48% 33%)" />
          <path d="M100 72 L110 62 L130 62 L140 72 Z" fill="hsl(8 48% 33%)" />
          <rect x="112" y="94" width="16" height="22" rx="1.5" fill="hsl(8 45% 30%)" />
          <path d="M112 94 L128 116 M128 94 L112 116" stroke="hsl(40 30% 92%)" strokeWidth="1.8" />
          <rect x="112" y="94" width="16" height="22" rx="1.5" fill="none" stroke="hsl(40 30% 92%)" strokeWidth="1.8" />
          <rect x="116" y="76" width="8" height="6" rx="1" fill="hsl(40 30% 92%)" />
          <path d="M120 76 v6 M116 79 h8" stroke="hsl(8 48% 33%)" strokeWidth="1.1" />
        </g>
        {/* farmhouse */}
        <g>
          <rect x="18" y="96" width="34" height="22" fill="hsl(40 30% 94%)" />
          <path d="M15 96 L35 80 L55 96 Z" fill="hsl(200 22% 46%)" />
          <rect x="24" y="102" width="7" height="8" rx="1" fill="hsl(42 85% 64%)" />
          <rect x="38" y="102" width="7" height="8" rx="1" fill="hsl(42 85% 64%)" />
          <rect x="31" y="84" width="4" height="8" fill="hsl(10 40% 42%)" />
          {/* porch */}
          <rect x="16" y="116" width="38" height="3" fill="hsl(35 25% 70%)" />
          <rect x="19" y="110" width="2.5" height="7" fill="hsl(35 25% 70%)" />
          <rect x="48" y="110" width="2.5" height="7" fill="hsl(35 25% 70%)" />
        </g>
        {/* fields */}
        <path d="M0 118 H200 V200 H0 Z" fill="hsl(38 42% 64%)" />
        {/* crop rows converging */}
        <g fill="hsl(110 32% 46%)">
          <path d="M0 130 L82 124 L80 128 L0 138 Z" />
          <path d="M0 148 L78 132 L76 137 L0 160 Z" />
          <path d="M0 172 L74 140 L72 146 L0 190 Z" />
          <path d="M200 132 L128 126 L130 130 L200 140 Z" />
          <path d="M200 152 L132 134 L134 139 L200 164 Z" />
          <path d="M200 178 L136 142 L138 148 L200 196 Z" />
        </g>
        {/* dirt road */}
        <path d="M92 200 C94 176 98 152 102 128 L118 128 C114 152 112 176 114 200 Z" fill="hsl(30 35% 58%)" />
        <path d="M103 196 C104 174 106 150 109 132 M110 132 C108 152 107 176 107 196"
          stroke="hsl(35 30% 68%)" strokeWidth="1.4" fill="none" opacity="0.8" />
        {/* fence */}
        <g stroke="hsl(28 30% 44%)" strokeWidth="2" strokeLinecap="round">
          <path d="M8 136 v10 M24 138 v10 M40 141 v10 M6 141 L44 146" />
          <path d="M162 142 v10 M178 139 v10 M194 137 v10 M160 147 L196 142" />
        </g>
        {/* hay bales */}
        <g>
          <circle cx="150" cy="166" r="8" fill="hsl(45 62% 62%)" />
          <path d="M144 164 a6 6 0 0 1 8 -4 M146 170 a6 6 0 0 1 8 -4" stroke="hsl(43 55% 48%)" strokeWidth="1.4" fill="none" />
          <circle cx="170" cy="178" r="9" fill="hsl(45 62% 62%)" />
          <path d="M163 176 a7 7 0 0 1 9 -5 M165 183 a7 7 0 0 1 9 -5" stroke="hsl(43 55% 48%)" strokeWidth="1.4" fill="none" />
        </g>
        {/* tractor */}
        <g>
          <rect x="30" y="164" width="26" height="11" rx="2.5" fill="hsl(130 38% 34%)" />
          <rect x="46" y="154" width="11" height="12" rx="2" fill="hsl(130 38% 34%)" />
          <rect x="48.5" y="156.5" width="6" height="6" rx="1" fill="hsl(200 40% 80%)" />
          <rect x="27" y="168" width="7" height="4" rx="1.5" fill="hsl(130 32% 28%)" />
          <circle cx="36" cy="180" r="8" fill="hsl(215 20% 22%)" />
          <circle cx="36" cy="180" r="4" fill="hsl(45 40% 78%)" />
          <circle cx="56" cy="182" r="5.5" fill="hsl(215 20% 22%)" />
          <circle cx="56" cy="182" r="2.6" fill="hsl(45 40% 78%)" />
          <rect x="52" y="148" width="2.5" height="7" fill="hsl(215 20% 30%)" />
        </g>
        {/* foreground wheat tufts */}
        <g stroke="hsl(45 60% 52%)" strokeWidth="1.6" strokeLinecap="round">
          <path d="M12 196 v-8 M16 197 v-10 M20 196 v-8" />
          <path d="M186 194 v-8 M190 195 v-10 M194 194 v-8" />
        </g>
      </g>
    </svg>
  )
}
