/** Calm Nordic-Journal house + landscape mark for the sidebar/shell foot. Decorative. */
export function HouseIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" role="img" aria-label="A small house among trees"
      className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="70" rx="52" ry="7" fill="hsl(140 20% 88%)" />
      <circle cx="30" cy="48" r="14" fill="hsl(150 25% 72%)" />
      <circle cx="92" cy="50" r="11" fill="hsl(150 25% 76%)" />
      <rect x="48" y="40" width="30" height="26" rx="2" fill="hsl(28 40% 86%)" />
      <path d="M45 41 L63 26 L81 41 Z" fill="hsl(14 45% 55%)" />
      <rect x="58" y="52" width="9" height="14" rx="1" fill="hsl(168 45% 30%)" />
      <rect x="51" y="45" width="7" height="7" rx="1" fill="hsl(45 60% 92%)" />
    </svg>
  )
}
