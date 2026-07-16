/** Woodsy Cabin — pines, a stream, smoke from the chimney.
 *  Flat-vector medallion in the place-theme style. Decorative. */
export function WoodsyCabinVignette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img"
      aria-label="A log cabin among pines beside a stream" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="wc-clip"><circle cx="100" cy="100" r="96" /></clipPath>
      </defs>
      <g clipPath="url(#wc-clip)">
        {/* sky + far ridge */}
        <rect width="200" height="200" fill="hsl(205 45% 82%)" />
        <path d="M0 88 L44 52 L84 84 L128 46 L172 82 L200 66 V130 H0 Z" fill="hsl(210 30% 62%)" />
        <path d="M128 46 L150 64 L136 70 Z" fill="hsl(40 35% 94%)" />
        <path d="M44 52 L58 64 L48 68 Z" fill="hsl(40 35% 94%)" />
        {/* back pines */}
        <g fill="hsl(175 26% 30%)">
          <path d="M8 112 l11 -26 l11 26 Z M12 98 l7 -18 l7 18 Z" />
          <path d="M34 108 l10 -24 l10 24 Z M38 96 l6 -16 l6 16 Z" />
          <path d="M148 108 l11 -26 l11 26 Z M152 94 l7 -18 l7 18 Z" />
          <path d="M176 112 l10 -24 l10 24 Z M180 100 l6 -16 l6 16 Z" />
          <path d="M62 104 l9 -22 l9 22 Z" />
          <path d="M126 104 l9 -22 l9 22 Z" />
        </g>
        {/* ground */}
        <path d="M0 116 Q60 106 110 112 T200 110 V200 H0 Z" fill="hsl(150 24% 44%)" />
        {/* tall foreground pines */}
        <g>
          <g fill="hsl(160 30% 26%)">
            <path d="M16 130 l14 -34 l14 34 Z" />
            <path d="M20 112 l10 -26 l10 26 Z" />
            <path d="M24 96 l6 -18 l6 18 Z" />
          </g>
          <rect x="28" y="130" width="4" height="12" fill="hsl(22 32% 28%)" />
          <g fill="hsl(158 32% 22%)">
            <path d="M154 134 l15 -36 l15 36 Z" />
            <path d="M158 114 l11 -28 l11 28 Z" />
            <path d="M162 98 l7 -20 l7 20 Z" />
          </g>
          <rect x="167" y="134" width="4" height="12" fill="hsl(22 32% 28%)" />
        </g>
        {/* smoke */}
        <g fill="hsl(35 20% 90%)" opacity="0.85">
          <circle cx="121" cy="74" r="4" />
          <circle cx="125" cy="66" r="5" />
          <circle cx="131" cy="57" r="6" />
        </g>
        {/* cabin */}
        <g>
          <rect x="116" y="76" width="7" height="16" fill="hsl(210 12% 58%)" />
          <rect x="115" y="74" width="9" height="3" fill="hsl(210 12% 48%)" />
          {/* roof */}
          <path d="M66 100 L101 74 L136 100 Z" fill="hsl(162 26% 30%)" />
          <path d="M62 101 L101 72 L140 101 L136 104 L101 78 L66 104 Z" fill="hsl(160 28% 24%)" />
          {/* log walls */}
          <rect x="70" y="100" width="62" height="30" fill="hsl(26 36% 34%)" />
          <g stroke="hsl(24 34% 27%)" strokeWidth="1.6">
            <path d="M70 106 h62 M70 112 h62 M70 118 h62 M70 124 h62" />
          </g>
          {/* porch */}
          <rect x="66" y="130" width="70" height="4" fill="hsl(25 35% 26%)" />
          <rect x="70" y="122" width="3" height="9" fill="hsl(25 32% 24%)" />
          <rect x="129" y="122" width="3" height="9" fill="hsl(25 32% 24%)" />
          {/* door + windows */}
          <rect x="95" y="110" width="12" height="20" rx="1.5" fill="hsl(22 34% 22%)" />
          <rect x="97" y="112" width="8" height="16" rx="1" fill="hsl(42 88% 64%)" />
          <rect x="76" y="108" width="12" height="10" rx="1" fill="hsl(42 88% 64%)" />
          <path d="M82 108 v10 M76 113 h12" stroke="hsl(24 34% 24%)" strokeWidth="1.4" />
          <rect x="114" y="108" width="12" height="10" rx="1" fill="hsl(42 88% 64%)" />
          <path d="M120 108 v10 M114 113 h12" stroke="hsl(24 34% 24%)" strokeWidth="1.4" />
        </g>
        {/* autumn accents */}
        <g>
          <rect x="52" y="122" width="3" height="10" fill="hsl(25 30% 30%)" />
          <circle cx="53.5" cy="117" r="8" fill="hsl(28 62% 52%)" />
          <rect x="143" y="126" width="3" height="10" fill="hsl(25 30% 30%)" />
          <circle cx="144.5" cy="121" r="7" fill="hsl(40 65% 55%)" />
        </g>
        {/* stream */}
        <path d="M58 200 C60 176 72 166 92 160 C116 153 132 148 140 138 L158 138 C152 154 132 162 110 168 C88 174 80 184 82 200 Z"
          fill="hsl(204 52% 56%)" />
        <path d="M92 160 C100 157 110 155 118 152 L122 158 C112 162 102 164 96 166 Z" fill="hsl(202 55% 66%)" />
        <g stroke="hsl(200 60% 82%)" strokeWidth="1.8" strokeLinecap="round" opacity="0.9">
          <path d="M100 170 q6 -3 12 -4 M118 156 q6 -3 12 -5 M86 182 q6 -4 12 -6" />
        </g>
        {/* rocks */}
        <g fill="hsl(210 12% 62%)">
          <ellipse cx="66" cy="180" rx="9" ry="6" />
          <ellipse cx="148" cy="146" rx="8" ry="5.5" />
          <ellipse cx="94" cy="192" rx="10" ry="6.5" />
          <ellipse cx="126" cy="166" rx="7" ry="5" />
        </g>
        <g fill="hsl(210 14% 50%)">
          <ellipse cx="72" cy="186" rx="7" ry="4.5" />
          <ellipse cx="138" cy="154" rx="6" ry="4" />
        </g>
        {/* grass tufts */}
        <g stroke="hsl(145 30% 34%)" strokeWidth="1.6" strokeLinecap="round">
          <path d="M44 150 v-6 M47 150 v-8 M50 150 v-6" />
          <path d="M160 160 v-6 M163 160 v-8 M166 160 v-6" />
        </g>
      </g>
    </svg>
  )
}
