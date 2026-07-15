// src/components/planning/guided/GuidedScene.tsx
//
// The sense of place behind a guided session: one illustrated mountainside,
// 340vh tall, from summit (the year, all twelve months visible) down to a
// house in the valley (today). Each horizon walks a slice of the same world —
// the annual session descends the whole thing; the daily is the last few
// steps to the door. The camera eases downward as the session progresses, so
// progress is something you FEEL, not a bar you read.
//
// Pure presentation: pointer-events none, no data, no handlers. The veil
// keeps step text readable on top. Camera motion respects reduced-motion.
// Camera math lives in altitude.ts.

import { cameraOffset, type SceneHorizon } from './altitude'

export function GuidedScene({ horizon, progress }: { horizon: SceneHorizon; progress: number }) {
  const y = cameraOffset(horizon, progress)
  return (
    <div aria-hidden className="fixed inset-0 overflow-hidden pointer-events-none select-none"
      style={{ background: 'linear-gradient(#dcebf5, #f6efe0 62%, #efe7d3 62.5%, #e9e0ca)' }}>
      <div
        className="absolute left-0 right-0 top-0 will-change-transform motion-safe:transition-transform motion-safe:duration-[1600ms] motion-safe:ease-[cubic-bezier(.45,.05,.2,1)]"
        style={{ height: '340vh', transform: `translateY(-${y}vh)` }}
      >
        <svg viewBox="0 0 1440 3400" preserveAspectRatio="xMidYMin slice" className="w-full h-full block">
          {/* sun */}
          <circle cx="1150" cy="180" r="62" fill="#f3d9a4" opacity=".85" />
          <circle cx="1150" cy="180" r="92" fill="#f3d9a4" opacity=".22" />
          {/* far ranges (summit view) */}
          <path d="M0 430 L180 300 L340 420 L520 240 L720 400 L900 260 L1100 420 L1280 320 L1440 410 L1440 700 L0 700 Z" fill="#c9d6c5" opacity=".7" />
          <path d="M0 520 L240 380 L460 520 L700 340 L940 520 L1180 400 L1440 520 L1440 900 L0 900 Z" fill="#a9bfa6" opacity=".8" />
          {/* summit cairn + flag */}
          <g transform="translate(700,560)">
            <path d="M0 60 L28 0 L56 60 Z" fill="#6f8a6f" />
            <path d="M18 60 L28 22 L38 60 Z" fill="#5c775c" />
            <line x1="28" y1="0" x2="28" y2="-46" stroke="#4c5a4c" strokeWidth="3" />
            <path d="M28 -46 L64 -36 L28 -26 Z" fill="#d97706" />
          </g>
          {/* mid slopes + switchback trail */}
          <path d="M0 900 L1440 900 L1440 1750 L0 1750 Z" fill="#b9c9ae" />
          <path d="M0 880 Q 360 800 720 880 T 1440 880 L1440 1000 L0 1000 Z" fill="#9fb896" opacity=".65" />
          <path d="M180 950 Q 400 1030 340 1150 T 620 1330 T 480 1520 T 820 1690" fill="none" stroke="#f2ead6" strokeWidth="13" strokeLinecap="round" strokeDasharray="1 26" opacity=".95" />
          {/* pines */}
          <g fill="#54755a">
            <path d="M240 1180 l22 -56 22 56 Z M250 1140 l12 -34 12 34 Z" />
            <path d="M1120 1260 l26 -66 26 66 Z M1132 1212 l14 -40 14 40 Z" />
            <path d="M900 1080 l20 -50 20 50 Z" />
            <path d="M420 1420 l24 -60 24 60 Z M430 1378 l14 -38 14 38 Z" />
            <path d="M1240 1560 l22 -56 22 56 Z" />
          </g>
          {/* meadow + river + wildflowers */}
          <path d="M0 1750 L1440 1750 L1440 2600 L0 2600 Z" fill="#cdd9b7" />
          <path d="M0 1730 Q 480 1660 900 1730 T 1440 1720 L1440 1830 L0 1830 Z" fill="#b9cba4" opacity=".7" />
          <path d="M-40 1930 Q 300 1990 560 1920 T 1100 1980 T 1520 1920 L1520 2010 Q 1100 2070 700 2000 T -40 2020 Z" fill="#a9c4cf" opacity=".8" />
          <g>
            <circle cx="260" cy="2180" r="7" fill="#d97706" /><circle cx="300" cy="2240" r="6" fill="#9333ea" opacity=".7" />
            <circle cx="1180" cy="2160" r="7" fill="#d97706" opacity=".8" /><circle cx="1120" cy="2260" r="6" fill="#c2554e" opacity=".7" />
            <circle cx="760" cy="2300" r="6" fill="#9333ea" opacity=".6" /><circle cx="520" cy="2350" r="7" fill="#d97706" opacity=".75" />
          </g>
          {/* valley + home */}
          <path d="M0 2600 L1440 2600 L1440 3400 L0 3400 Z" fill="#e3d9bd" />
          <path d="M0 2580 Q 480 2520 960 2580 T 1440 2570 L1440 2700 L0 2700 Z" fill="#d3c9a8" opacity=".8" />
          <g transform="translate(560,2760)">
            <rect x="0" y="60" width="150" height="105" rx="7" fill="#f6efdd" stroke="#b9ad8c" strokeWidth="3" />
            <path d="M-18 68 L75 -8 L168 68 Z" fill="#2e5d43" />
            <rect x="60" y="110" width="34" height="55" rx="3" fill="#8a7a58" />
            <rect x="18" y="86" width="28" height="26" rx="3" fill="#cfe0e8" />
            <rect x="106" y="86" width="28" height="26" rx="3" fill="#cfe0e8" />
            <rect x="118" y="8" width="16" height="34" fill="#b9ad8c" />
            <path d="M126 -4 q 12 -18 4 -34 q 18 10 12 34 Z" fill="#c8c2b2" opacity=".8" />
          </g>
          <g fill="#54755a">
            <path d="M300 2820 l24 -62 24 62 Z M310 2778 l14 -40 14 40 Z" />
            <path d="M1060 2840 l28 -70 28 70 Z M1074 2790 l14 -42 14 42 Z" />
          </g>
          <path d="M820 2925 Q 900 2960 1010 2940 T 1240 2965" fill="none" stroke="#f2ead6" strokeWidth="12" strokeLinecap="round" strokeDasharray="1 24" />
        </svg>
      </div>
      {/* readability veil over the artwork */}
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 42%, rgba(250,247,240,.9) 30%, rgba(250,247,240,.6) 62%, rgba(250,247,240,.15))' }} />
    </div>
  )
}
