// One icon per surface, worn by that page's masthead card.
//
// The five PLACE vignettes (cabin, farm, urban…) say where you live and stay
// on the rhythm pages — Today, Week, Month, Season, Year are one continuous
// place, so they share one picture. Every other surface is a different KIND of
// thing, so it gets its own: a sheet and a pen for Notes, a pot for Meals, a
// gear for Settings.
//
// Every colour here is a place TOKEN, never a literal. That is the whole
// reason these can exist at all: eleven motifs × five places would be
// fifty-five drawings by hand, but drawn on `--color-primary-*` and
// `--color-accent-*` each one comes out teal-forest under Woodsy Cabin and
// barn-red under Farm with nothing extra to draw. A sixth place costs nothing.
//
// Nothing fancy (Scott, 2026-09-11: "just nice icons in full color
// variations"): flat fills, one family, no scenes. They are worn at low
// opacity behind a masthead, so shapes are big and the detail is coarse —
// anything finer would dissolve into the wash.

export type MotifId =
  | 'discussions' | 'routines' | 'meals' | 'contacts' | 'documents'
  | 'notes' | 'lists' | 'house' | 'history' | 'settings' | 'assistant'

/** The shared palette. Two ramps and the warm paper neutrals — the same range
 *  every place theme guarantees (accent stops at 500; don't reach past it). */
const INK = 'var(--color-primary-700)'
const BODY = 'var(--color-primary-500)'
const MID = 'var(--color-primary-300)'
const PALE = 'var(--color-primary-100)'
const BAND = 'var(--color-primary-200)'
const ACCENT = 'var(--color-accent-400)'
const ACCENT_PALE = 'var(--color-accent-200)'
const PAPER = 'var(--color-bg-elevated)'

/** Every motif sits on the same disc, so the eleven read as one set and each
 *  one drops into the medallion slot the place vignettes already occupy. */
function Disc({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <>
      <defs>
        <clipPath id={`${id}-disc`}><circle cx="100" cy="100" r="96" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}-disc)`}>
        <rect width="200" height="200" fill={PALE} />
        <rect y="134" width="200" height="66" fill={BAND} />
      </g>
      <title>{label}</title>
      {children}
    </>
  )
}

function Motif({ id, label, className, children }: {
  id: string; label: string; className?: string; children: React.ReactNode
}) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={label}
      xmlns="http://www.w3.org/2000/svg">
      <Disc id={id} label={label}>{children}</Disc>
    </svg>
  )
}

/** Discussions — two voices, one answering the other. */
function DiscussionsMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-discussions" label="Two speech bubbles" className={className}>
      <path d="M40 56 h86 a12 12 0 0 1 12 12 v44 a12 12 0 0 1 -12 12 H74 l-20 18 v-18 h-14 a12 12 0 0 1 -12 -12 V68 a12 12 0 0 1 12 -12 Z" fill={PAPER} />
      <g fill={MID}>
        <rect x="54" y="74" width="66" height="8" rx="4" />
        <rect x="54" y="92" width="44" height="8" rx="4" />
      </g>
      <path d="M92 104 h68 a12 12 0 0 1 12 12 v34 a12 12 0 0 1 -12 12 h-40 l-18 16 v-16 h-10 a12 12 0 0 1 -12 -12 v-34 a12 12 0 0 1 12 -12 Z" fill={BODY} />
      <g fill={ACCENT_PALE}>
        <rect x="106" y="120" width="52" height="8" rx="4" />
        <rect x="106" y="136" width="32" height="8" rx="4" />
      </g>
    </Motif>
  )
}

/** Routines — the same round, come round again. */
function RoutinesMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-routines" label="A repeating cycle" className={className}>
      <circle cx="100" cy="100" r="54" fill="none" stroke={BODY} strokeWidth="16" />
      <path d="M104 28 v36 l30 -18 Z" fill={BODY} />
      <g fill={MID}>
        <rect x="74" y="82" width="52" height="10" rx="5" />
        <rect x="74" y="102" width="52" height="10" rx="5" />
      </g>
      <rect x="74" y="122" width="32" height="10" rx="5" fill={ACCENT} />
    </Motif>
  )
}

/** Meals — a pot with the lid on and something going. */
function MealsMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-meals" label="A cooking pot" className={className}>
      <g fill={MID} opacity="0.9">
        <path d="M78 46 q-10 12 0 24 q10 12 0 22" stroke={MID} strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M100 38 q-10 14 0 28 q10 14 0 24" stroke={MID} strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M122 46 q-10 12 0 24 q10 12 0 22" stroke={MID} strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
      <rect x="44" y="104" width="112" height="14" rx="7" fill={INK} />
      <rect x="92" y="94" width="16" height="12" rx="6" fill={INK} />
      <path d="M52 120 h96 l-9 42 a14 14 0 0 1 -14 12 H75 a14 14 0 0 1 -14 -12 Z" fill={BODY} />
      <rect x="30" y="124" width="20" height="12" rx="6" fill={INK} />
      <rect x="150" y="124" width="20" height="12" rx="6" fill={INK} />
      <path d="M70 148 h60 l-4 16 H74 Z" fill={ACCENT} opacity="0.55" />
    </Motif>
  )
}

/** Contacts — the people a thing is about. */
function ContactsMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-contacts" label="Two people" className={className}>
      <circle cx="132" cy="86" r="24" fill={MID} />
      <path d="M92 162 q12 -38 40 -38 q28 0 40 38 Z" fill={MID} />
      <circle cx="80" cy="78" r="28" fill={BODY} />
      <path d="M32 166 q14 -44 48 -44 q34 0 48 44 Z" fill={BODY} />
      <circle cx="80" cy="78" r="28" fill="none" stroke={PALE} strokeWidth="5" />
    </Motif>
  )
}

/** Documents — the filed thing, not the jotted one. */
function DocumentsMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-documents" label="A stack of documents" className={className}>
      <rect x="44" y="52" width="88" height="112" rx="10" fill={MID} transform="rotate(-8 88 108)" />
      <path d="M70 44 h56 l30 30 v82 a10 10 0 0 1 -10 10 H70 a10 10 0 0 1 -10 -10 V54 a10 10 0 0 1 10 -10 Z" fill={PAPER} />
      <path d="M126 44 l30 30 h-30 Z" fill={BAND} />
      <g fill={MID}>
        <rect x="76" y="88" width="64" height="8" rx="4" />
        <rect x="76" y="106" width="64" height="8" rx="4" />
        <rect x="76" y="124" width="40" height="8" rx="4" />
      </g>
      <circle cx="140" cy="150" r="14" fill={ACCENT} />
    </Motif>
  )
}

/** Notes — a scrap and the pen that made it. */
function NotesMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-notes" label="A note and a pen" className={className}>
      <rect x="48" y="44" width="96" height="118" rx="10" fill={PAPER} />
      <rect x="48" y="44" width="96" height="118" rx="10" fill="none" stroke={BAND} strokeWidth="4" />
      <g fill={MID}>
        <rect x="64" y="72" width="64" height="8" rx="4" />
        <rect x="64" y="92" width="64" height="8" rx="4" />
        <rect x="64" y="112" width="40" height="8" rx="4" />
      </g>
      <g transform="rotate(38 132 128)">
        <rect x="124" y="60" width="18" height="76" rx="4" fill={BODY} />
        <rect x="124" y="60" width="18" height="16" rx="4" fill={INK} />
        <path d="M124 136 h18 l-9 20 Z" fill={ACCENT} />
      </g>
    </Motif>
  )
}

/** Lists — rows you tick, not prose. */
function ListsMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-lists" label="A checklist" className={className}>
      <rect x="42" y="46" width="116" height="112" rx="12" fill={PAPER} />
      <rect x="42" y="46" width="116" height="112" rx="12" fill="none" stroke={BAND} strokeWidth="4" />
      <g>
        <rect x="58" y="66" width="20" height="20" rx="6" fill={BODY} />
        <path d="M62 76 l5 6 l10 -12" stroke={PAPER} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="88" y="72" width="54" height="8" rx="4" fill={MID} />
      </g>
      <g>
        <rect x="58" y="96" width="20" height="20" rx="6" fill={ACCENT} />
        <path d="M62 106 l5 6 l10 -12" stroke={PAPER} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="88" y="102" width="54" height="8" rx="4" fill={MID} />
      </g>
      <g>
        <rect x="58" y="126" width="20" height="20" rx="6" fill="none" stroke={MID} strokeWidth="5" />
        <rect x="88" y="132" width="36" height="8" rx="4" fill={BAND} />
      </g>
    </Motif>
  )
}

/** House — the place itself, the one everybody shares. */
function HouseMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-house" label="A house" className={className}>
      <rect x="128" y="48" width="18" height="34" rx="4" fill={INK} />
      <path d="M100 38 L172 100 H28 Z" fill={INK} />
      <rect x="52" y="100" width="96" height="66" rx="8" fill={BODY} />
      <rect x="88" y="120" width="24" height="46" rx="6" fill={PAPER} />
      <circle cx="106" cy="144" r="3.5" fill={INK} />
      <rect x="62" y="116" width="18" height="18" rx="4" fill={ACCENT} />
      <rect x="120" y="116" width="18" height="18" rx="4" fill={ACCENT} />
    </Motif>
  )
}

/** History — what is already done, kept. */
function HistoryMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-history" label="A clock turning back" className={className}>
      <circle cx="104" cy="106" r="50" fill={PAPER} />
      <circle cx="104" cy="106" r="50" fill="none" stroke={BODY} strokeWidth="14" />
      <path d="M104 76 v30 h24" stroke={INK} strokeWidth="11" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* the turn backwards, arcing over the face */}
      <path d="M150 44 A62 62 0 0 0 46 52" fill="none" stroke={ACCENT} strokeWidth="12" strokeLinecap="round" />
      <path d="M58 26 l-16 30 l32 4 Z" fill={ACCENT} />
    </Motif>
  )
}

/** Settings — the one page that is about the app, not the life. */
function SettingsMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-settings" label="A gear" className={className}>
      <g fill={BODY}>
        <rect x="88" y="26" width="24" height="34" rx="8" />
        <rect x="88" y="140" width="24" height="34" rx="8" />
        <rect x="26" y="88" width="34" height="24" rx="8" />
        <rect x="140" y="88" width="34" height="24" rx="8" />
        <rect x="44" y="44" width="24" height="34" rx="8" transform="rotate(-45 56 61)" />
        <rect x="132" y="44" width="24" height="34" rx="8" transform="rotate(45 144 61)" />
        <rect x="44" y="122" width="24" height="34" rx="8" transform="rotate(45 56 139)" />
        <rect x="132" y="122" width="24" height="34" rx="8" transform="rotate(-45 144 139)" />
      </g>
      <circle cx="100" cy="100" r="46" fill={BODY} />
      <circle cx="100" cy="100" r="30" fill={PALE} />
      <circle cx="100" cy="100" r="14" fill={ACCENT} />
    </Motif>
  )
}

/** The assistant — the one surface that answers back. */
function AssistantMotif({ className }: { className?: string }) {
  return (
    <Motif id="mo-assistant" label="A spark in a speech bubble" className={className}>
      <path d="M46 48 h108 a14 14 0 0 1 14 14 v62 a14 14 0 0 1 -14 14 H92 l-26 24 v-24 H46 a14 14 0 0 1 -14 -14 V62 a14 14 0 0 1 14 -14 Z" fill={BODY} />
      <path d="M100 62 l11 26 l26 11 l-26 11 l-11 26 l-11 -26 l-26 -11 l26 -11 Z" fill={ACCENT} />
      <circle cx="140" cy="70" r="7" fill={ACCENT_PALE} />
      <circle cx="62" cy="112" r="5" fill={ACCENT_PALE} />
    </Motif>
  )
}

const MOTIFS: Record<MotifId, (props: { className?: string }) => React.JSX.Element> = {
  discussions: DiscussionsMotif,
  routines: RoutinesMotif,
  meals: MealsMotif,
  contacts: ContactsMotif,
  documents: DocumentsMotif,
  notes: NotesMotif,
  lists: ListsMotif,
  house: HouseMotif,
  history: HistoryMotif,
  settings: SettingsMotif,
  assistant: AssistantMotif,
}

export function PageMotif({ motif, className = '' }: { motif: MotifId; className?: string }) {
  const Drawn = MOTIFS[motif]
  return <Drawn className={className} />
}

export const MOTIF_IDS = Object.keys(MOTIFS) as MotifId[]
