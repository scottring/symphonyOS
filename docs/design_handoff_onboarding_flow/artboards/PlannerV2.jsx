/* =============================================================================
   MEAL PLANNER V2 — REGROUNDED IN REAL SYMPHONY (EDITORIAL CALM)
   NOTE: wrapped in IIFE so module-level consts (DAYS, T, KID_PHRASE, etc.)
   do not collide with v1 artboards loaded into the same global scope.
   ============================================================================= */
(() => {
/* --- inner module ---------------------------------------------------------- 
   - Real fonts: Instrument Serif + Satoshi
   - Real primary: teal-forest hsl(168 45% 30%)
   - Real warm accent: terracotta hsl(18 55% 45%) (used sparingly)
   - Real neutrals: warm paper hsl(45 25% 96%), neutral scale
   - Three artboards on this file:
       1. TokenSheet         — verify the token match
       2. PlannerV2          — tap-to-suggest (not drag), language pills,
                                integrated grocery status, narrative toggle
       3. MemoryShelfV2      — recipes as "lived language", not pills
   ============================================================================= */

// --- REAL EDITORIAL CALM TOKENS (from src/index.css) -------------------------
const T = {
  // Paper
  bg:       'hsl(45 25% 96%)',         // --color-bg-base
  elev:     'hsl(48 35% 99%)',         // --color-bg-elevated
  // Neutral ink
  n50:  'hsl(45 30% 98%)',
  n100: 'hsl(43 25% 95%)',
  n200: 'hsl(40 18% 88%)',
  n300: 'hsl(38 14% 75%)',
  n400: 'hsl(36 10% 55%)',
  n500: 'hsl(34 8% 42%)',
  n600: 'hsl(30 10% 32%)',
  n700: 'hsl(28 14% 22%)',
  n800: 'hsl(25 18% 15%)',
  n900: 'hsl(22 22% 10%)',
  // Primary — teal-forest
  p50:  'hsl(168 30% 96%)',
  p100: 'hsl(168 28% 90%)',
  p300: 'hsl(168 28% 62%)',
  p500: 'hsl(168 45% 30%)',
  p600: 'hsl(168 50% 24%)',
  p700: 'hsl(168 52% 20%)',
  // Warm accent — terracotta
  a50:  'hsl(18 60% 97%)',
  a100: 'hsl(18 55% 92%)',
  a300: 'hsl(18 48% 68%)',
  a500: 'hsl(18 55% 45%)',
  // Sage — secondary muted
  s100: 'hsl(145 18% 90%)',
  s400: 'hsl(145 22% 48%)',
  s500: 'hsl(145 28% 36%)',
  // Review (warm tan, for triage UI)
  r50:  'hsl(30 35% 96%)',
  r100: 'hsl(30 30% 92%)',
  r500: 'hsl(30 40% 45%)',
  // Shadows
  shadowCard:     '0 0 0 1px hsl(38 20% 88% / 0.6), 0 2px 8px -2px hsl(25 20% 20% / 0.04)',
  shadowElev:     '0 0 0 1px hsl(38 20% 88% / 0.4), 0 8px 24px -4px hsl(25 20% 20% / 0.08)',
  shadowPrimary:  '0 8px 24px -6px hsl(168 45% 30% / 0.3)',
  // Family per-person (kept from v1, sits within Editorial Calm fine)
  iris:  'hsl(168 35% 45%)',   // primary-400 territory — Iris reads as the teal family
  scott: 'hsl(145 22% 48%)',   // sage-400 — Scott reads as muted green
};
const FONT_DISP = "'Instrument Serif', Georgia, serif";
const FONT_SANS = "'Satoshi', system-ui, -apple-system, sans-serif";

// --- shared bits -------------------------------------------------------------

function Kicker({ children, color }) {
  return (
    <div style={{
      fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color: color || T.n400,
    }}>{children}</div>
  );
}

function Display({ size = 40, italic, accent = T.n800, children }) {
  return (
    <h1 style={{
      fontFamily: FONT_DISP, fontStyle: italic ? 'italic' : 'normal',
      fontSize: size, lineHeight: 1.05, letterSpacing: '-0.01em',
      color: accent, margin: 0, fontWeight: 400, textWrap: 'pretty',
    }}>{children}</h1>
  );
}

function PaperBg({ children, style }) {
  return (
    <div style={{
      position: 'relative', background: T.bg, fontFamily: FONT_SANS,
      color: T.n800, ...style,
    }}>
      {/* subtle grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025,
        mixBlendMode: 'multiply',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// =============================================================================
//   TOKEN SHEET — proof we matched Editorial Calm
// =============================================================================
function TokenSheet() {
  const swatches = [
    { name: 'bg-base',     val: T.bg },
    { name: 'bg-elevated', val: T.elev },
    { name: 'neutral-100', val: T.n100 },
    { name: 'neutral-300', val: T.n300 },
    { name: 'neutral-500', val: T.n500 },
    { name: 'neutral-700', val: T.n700 },
    { name: 'neutral-900', val: T.n900 },
  ];
  const primaries = [
    { name: 'primary-50',  val: T.p50 },
    { name: 'primary-100', val: T.p100 },
    { name: 'primary-300', val: T.p300 },
    { name: 'primary-500', val: T.p500, label: 'primary' },
    { name: 'primary-600', val: T.p600 },
    { name: 'primary-700', val: T.p700 },
  ];
  const accents = [
    { name: 'accent-50',  val: T.a50 },
    { name: 'accent-100', val: T.a100 },
    { name: 'accent-300', val: T.a300 },
    { name: 'accent-500', val: T.a500, label: 'terracotta' },
    { name: 'sage-400',   val: T.s400 },
    { name: 'sage-500',   val: T.s500 },
    { name: 'review-500', val: T.r500 },
  ];

  return (
    <PaperBg style={{ width: 1280, padding: '40px 48px' }}>
      <Kicker color={T.p500}>EDITORIAL CALM · TOKEN PARITY</Kicker>
      <div style={{ height: 6 }} />
      <Display size={40}>
        Symphony's actual <em style={{ color: T.p500 }}>design system</em>.
      </Display>
      <p style={{ fontSize: 14, color: T.n500, marginTop: 10, maxWidth: 720, lineHeight: 1.6 }}>
        Pulled directly from <code style={{ fontFamily: 'ui-monospace, monospace', background: T.n100, padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>src/index.css</code>.
        Every value below is the real one — not the cream/amber palette I invented in v1.
        v2 (next two artboards) is built entirely from these tokens.
      </p>

      <div style={{ height: 32 }} />

      {/* Type stack */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 18, padding: 24, boxShadow: T.shadowCard }}>
          <Kicker>DISPLAY · INSTRUMENT SERIF</Kicker>
          <div style={{ height: 12 }} />
          <div style={{ fontFamily: FONT_DISP, fontSize: 56, lineHeight: 1.05, letterSpacing: '-0.01em' }}>
            Plan the week.
          </div>
          <div style={{ fontFamily: FONT_DISP, fontStyle: 'italic', fontSize: 36, lineHeight: 1.1, color: T.p500, marginTop: 4 }}>
            What we cook together.
          </div>
          <div style={{ fontSize: 11, color: T.n400, marginTop: 14, fontWeight: 500, letterSpacing: '0.04em' }}>
            56 / 40 / 28 / 20 · italic available · -0.01em tracking
          </div>
        </div>
        <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 18, padding: 24, boxShadow: T.shadowCard }}>
          <Kicker>BODY · SATOSHI</Kicker>
          <div style={{ height: 12 }} />
          <div style={{ fontSize: 17, fontWeight: 500 }}>Tonight: sheet-pan miso salmon.</div>
          <div style={{ fontSize: 14, color: T.n500, marginTop: 6, lineHeight: 1.55 }}>
            Body copy, 14/1.55. Comfortable. Warm. Reads like a letter, not a dashboard.
          </div>
          <div style={{ fontSize: 13, color: T.n400, marginTop: 10 }}>
            The system uses 11/600 0.12em uppercase for kickers, 14/500 for primary copy, 13/400 for secondary.
          </div>
          <div style={{ fontSize: 11, color: T.n400, marginTop: 14, fontWeight: 500, letterSpacing: '0.04em' }}>
            400 / 500 / 700 · 12–17 base scale
          </div>
        </div>
      </div>

      <div style={{ height: 28 }} />

      {/* Swatches */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
        <SwatchRow title="Paper & ink" rows={swatches} />
        <SwatchRow title="Primary — teal-forest" rows={primaries} />
        <SwatchRow title="Accent — terracotta · sage · review" rows={accents} />
      </div>

      <div style={{ height: 28 }} />

      {/* Real button styles */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={{
          background: T.p500, color: '#fff', border: 'none',
          padding: '12px 24px', borderRadius: 14, fontFamily: FONT_SANS,
          fontWeight: 500, fontSize: 14, boxShadow: T.shadowPrimary, cursor: 'pointer',
        }}>Send 23 items to Groceries</button>
        <button style={{
          background: T.elev, color: T.n700, border: `1px solid ${T.n200}`,
          padding: '12px 24px', borderRadius: 14, fontFamily: FONT_SANS,
          fontWeight: 500, fontSize: 14, cursor: 'pointer',
        }}>Save as draft</button>
        <button style={{
          background: 'transparent', color: T.p500, border: `1px solid ${T.p300}`,
          padding: '10px 18px', borderRadius: 100, fontFamily: FONT_SANS,
          fontWeight: 500, fontSize: 13, cursor: 'pointer',
        }}>+ Pick a recipe</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: T.n400, fontStyle: 'italic', fontFamily: FONT_DISP, fontSize: 16 }}>
          Buttons match <code style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, background: T.n100, padding: '2px 5px', borderRadius: 3 }}>.btn-primary</code>, <code style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, background: T.n100, padding: '2px 5px', borderRadius: 3 }}>.btn-secondary</code>.
        </span>
      </div>
    </PaperBg>
  );
}

function SwatchRow({ title, rows }) {
  return (
    <div>
      <Kicker>{title}</Kicker>
      <div style={{ height: 8 }} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, 1fr)`, gap: 10 }}>
        {rows.map(r => (
          <div key={r.name} style={{
            background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 12,
            padding: 12, boxShadow: T.shadowCard,
          }}>
            <div style={{ height: 56, borderRadius: 8, background: r.val, border: `1px solid ${T.n200}` }} />
            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 8, color: T.n700 }}>
              {r.label || r.name}
            </div>
            <div style={{ fontSize: 10, fontFamily: 'ui-monospace,monospace', color: T.n400, marginTop: 2 }}>
              {r.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
//   PLANNER V2 — TAP-TO-SUGGEST, LANGUAGE PILLS, GROCERY STATUS, NARRATIVE TOGGLE
// =============================================================================

const DAYS = [
  { abbr: 'Mon', date: 'Apr 27', today: false },
  { abbr: 'Tue', date: 'Apr 28', today: true  },
  { abbr: 'Wed', date: 'Apr 29', today: false },
  { abbr: 'Thu', date: 'Apr 30', today: false },
  { abbr: 'Fri', date: 'May 1',  today: false },
  { abbr: 'Sat', date: 'May 2',  today: false },
  { abbr: 'Sun', date: 'May 3',  today: false },
];

// Language for kid-acceptance instead of dot-pills.
// "Ella will eat this. Kaleb negotiates." — soft, honest, human.
const KID_PHRASE = {
  'L+L': 'Both kids love this.',
  'L+E': 'Ella loves it. Kaleb eats it.',
  'L+R': 'Ella loves it. Kaleb negotiates.',
  'E+E': 'Both kids will eat this.',
  'E+R': 'Ella eats it. Kaleb refuses.',
  'R+R': 'Neither kid eats this — needs an alternate.',
  null:  null,
};

const PLAN_V2 = {
  Mon: { dinner: { title: 'Pasta al limone', mins: 22, kids: 'L+L', leftover: 'becomes Tue lunch', by: 'iris' } },
  Tue: { dinner: { title: 'Sunday turkey chili', mins: 0, kids: 'E+E', leftover: 'from Sunday prep', by: 'iris' } },
  Wed: { dinner: { title: 'Sheet-pan miso salmon', mins: 25, kids: 'L+R', alt: 'Plain pasta + butter for Kaleb', by: 'iris' } },
  Thu: null,
  Fri: { dinner: { title: 'Marry-me chicken w/ orzo', mins: 40, kids: 'L+L', by: 'iris' } },
  Sat: { dinner: { title: 'Pizza night (takeout)', mins: 0, kids: 'L+L', by: 'scott' } },
  Sun: { dinner: { title: 'Crispy gnocchi + sage', mins: 20, kids: 'L+E', by: 'iris' }, prep: { title: 'Sunday turkey chili', mins: 55, by: 'iris' } },
};

// Suggestions for the empty Thursday slot
const THU_SUGGESTIONS = [
  { label: 'RECENTLY LOVED',     title: 'Pad see ew',        mins: 30, kids: 'L+L', because: 'You made this 3 weeks ago. Both kids loved it.' },
  { label: 'FITS THE WEEK',      title: 'Chili leftovers',   mins: 5,  kids: 'E+E', because: 'Sunday\'s batch covers Thursday too. Zero shopping.' },
  { label: 'BALANCES VARIETY',   title: 'Tofu lettuce wraps', mins: 25, kids: 'L+E', because: 'No fish or pasta this week. Light dinner before Friday.' },
];

function PersonInitial({ who }) {
  const color = who === 'iris' ? T.iris : T.scott;
  const initial = who === 'iris' ? 'I' : 'S';
  return (
    <span title={`Added by ${who === 'iris' ? 'Iris' : 'Scott'}`} style={{
      width: 18, height: 18, borderRadius: '50%', background: color,
      color: '#fff', fontSize: 9, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      letterSpacing: '0.02em',
    }}>{initial}</span>
  );
}

// "Editorial pill" — a soft annotation, not a chip
function Annotation({ children, tone = 'neutral', italic }) {
  const tones = {
    neutral: { c: T.n500 },
    primary: { c: T.p600 },
    accent:  { c: T.a500 },
    sage:    { c: T.s500 },
  };
  return (
    <span style={{
      fontSize: 13, color: tones[tone].c,
      fontStyle: italic ? 'italic' : 'normal',
      fontFamily: italic ? FONT_DISP : FONT_SANS,
      lineHeight: 1.4,
    }}>{children}</span>
  );
}

function GrocerySatusCard() {
  const stocked = 80; // %
  return (
    <div style={{
      background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 18,
      padding: 22, boxShadow: T.shadowCard, display: 'flex', alignItems: 'center', gap: 24,
    }}>
      {/* progress ring */}
      <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
        <svg width="76" height="76" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="38" cy="38" r="32" fill="none" stroke={T.n100} strokeWidth="6" />
          <circle cx="38" cy="38" r="32" fill="none" stroke={T.p500} strokeWidth="6"
                  strokeDasharray={`${(stocked/100) * 2 * Math.PI * 32} ${2 * Math.PI * 32}`}
                  strokeLinecap="round" />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT_DISP, fontSize: 24, color: T.n800, letterSpacing: '-0.01em',
        }}>{stocked}<span style={{ fontSize: 13, color: T.n500 }}>%</span></div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Kicker>GROCERIES</Kicker>
        <div style={{ height: 4 }} />
        <div style={{ fontFamily: FONT_DISP, fontSize: 24, color: T.n800, lineHeight: 1.15 }}>
          You're <span style={{ color: T.p500 }}>80% stocked</span> for this week.
        </div>
        <div style={{ fontSize: 13, color: T.n500, marginTop: 6, lineHeight: 1.5 }}>
          6 items missing. Mostly produce — basil, lemons, scallions. Last sync 2h ago.
        </div>
      </div>
      <button style={{
        background: 'transparent', color: T.p600, border: `1px solid ${T.p300}`,
        padding: '10px 18px', borderRadius: 100, fontFamily: FONT_SANS,
        fontWeight: 500, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>Review the 6 →</button>
    </div>
  );
}

function MealStanza({ day, meal, today }) {
  if (!meal) return null;
  const phrase = KID_PHRASE[meal.kids];
  return (
    <article style={{
      background: today ? T.p50 : T.elev,
      border: `1px solid ${today ? T.p100 : T.n200}`,
      borderLeft: today ? `3px solid ${T.p500}` : `1px solid ${T.n200}`,
      borderRadius: 14,
      padding: '20px 24px',
      boxShadow: T.shadowCard,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <Kicker color={today ? T.p600 : T.n400}>
          {day.abbr.toUpperCase()} · {day.date.toUpperCase()}{today && ' · TODAY'}
        </Kicker>
        <div style={{ flex: 1 }} />
        {meal.mins > 0 && <span style={{ fontSize: 12, color: T.n400 }}>{meal.mins} min</span>}
        <PersonInitial who={meal.by} />
      </div>
      <div style={{ height: 4 }} />
      <h3 style={{
        fontFamily: FONT_DISP, fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.01em',
        margin: 0, color: T.n800, fontWeight: 400, textWrap: 'pretty',
      }}>{meal.title}</h3>
      {/* annotations stack */}
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {phrase && <Annotation tone="sage" italic>{phrase}</Annotation>}
        {meal.alt && <Annotation tone="neutral" italic>{meal.alt}.</Annotation>}
        {meal.leftover && <Annotation tone="primary" italic>{meal.leftover}.</Annotation>}
      </div>
    </article>
  );
}

function EmptyStanza({ day, suggestions, expanded, onToggle }) {
  return (
    <article style={{
      background: 'transparent',
      border: `1.5px dashed ${T.n300}`,
      borderRadius: 14,
      padding: '20px 24px',
      cursor: 'pointer',
    }}
    onClick={onToggle}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <Kicker>{day.abbr.toUpperCase()} · {day.date.toUpperCase()}</Kicker>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.n400, fontStyle: 'italic', fontFamily: FONT_DISP, fontSize: 16 }}>
          {expanded ? 'pick one ↓' : 'tap for ideas →'}
        </span>
      </div>
      <div style={{ height: 4 }} />
      <h3 style={{
        fontFamily: FONT_DISP, fontStyle: 'italic', fontSize: 22, lineHeight: 1.1,
        margin: 0, color: T.n400, fontWeight: 400,
      }}>What for Thursday?</h3>

      {expanded && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {suggestions.map((s, i) => (
            <button key={i} onClick={(e) => e.stopPropagation()} style={{
              display: 'block', textAlign: 'left',
              background: T.elev, border: `1px solid ${T.n200}`,
              borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
              fontFamily: FONT_SANS, color: T.n800, width: '100%',
              transition: 'all 200ms', boxShadow: T.shadowCard,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <Kicker color={i === 0 ? T.s500 : i === 1 ? T.p600 : T.a500}>{s.label}</Kicker>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: T.n400 }}>{s.mins} min</span>
              </div>
              <div style={{ height: 2 }} />
              <div style={{ fontFamily: FONT_DISP, fontSize: 22, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                {s.title}
              </div>
              <Annotation italic>{s.because}</Annotation>
            </button>
          ))}
          <div style={{
            display: 'flex', gap: 10, marginTop: 4, paddingTop: 12,
            borderTop: `1px dashed ${T.n200}`,
          }}>
            <button onClick={(e) => e.stopPropagation()} style={{
              flex: 1, background: 'transparent', border: 'none',
              color: T.n500, fontSize: 12, padding: '8px', cursor: 'pointer',
              fontFamily: FONT_SANS, textAlign: 'left',
            }}>↻ Show more suggestions</button>
            <button onClick={(e) => e.stopPropagation()} style={{
              background: 'transparent', border: 'none',
              color: T.n500, fontSize: 12, padding: '8px', cursor: 'pointer',
              fontFamily: FONT_SANS,
            }}>⌕ Search recipes</button>
            <button onClick={(e) => e.stopPropagation()} style={{
              background: 'transparent', border: 'none',
              color: T.n500, fontSize: 12, padding: '8px', cursor: 'pointer',
              fontFamily: FONT_SANS,
            }}>+ Paste URL</button>
          </div>
        </div>
      )}
    </article>
  );
}

function PlannerV2() {
  const [thuOpen, setThuOpen] = React.useState(true);
  const [view, setView] = React.useState('narrative'); // narrative | grid

  return (
    <PaperBg style={{ width: 1280, padding: '36px 48px 48px' }}>
      {/* Topbar mirrors Symphony's Sidebar+main split, but here we just show the chrome */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 22, borderBottom: `1px solid ${T.n200}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: T.p500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT_DISP, color: '#fff', fontSize: 18,
          }}>S</div>
          <div style={{ fontFamily: FONT_DISP, fontSize: 24, letterSpacing: '-0.01em', color: T.n800 }}>
            Symphony
          </div>
          <div style={{ width: 1, height: 18, background: T.n200 }} />
          <Kicker>PLAN · MEALS</Kicker>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, color: T.n500 }}>
            <PersonInitial who="scott" /> &nbsp;Scott · here now
          </span>
          <PersonInitial who="iris" />
        </div>
      </div>

      {/* Page header */}
      <div style={{ marginTop: 32, display: 'flex', alignItems: 'flex-end', gap: 32 }}>
        <div style={{ flex: 1 }}>
          <Kicker color={T.p500}>WEEK OF APR 27 · 800g CHALLENGE</Kicker>
          <div style={{ height: 8 }} />
          <Display size={48}>
            Plan the week<em style={{ color: T.p500 }}>.</em>
          </Display>
          <div style={{ fontSize: 14, color: T.n500, marginTop: 10, fontFamily: FONT_DISP, fontStyle: 'italic', fontSize: 18, lineHeight: 1.4 }}>
            Six dinners scheduled. Thursday's open — chili leftovers cover lunch.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {/* view toggle */}
          <div style={{
            display: 'flex', background: T.elev, border: `1px solid ${T.n200}`,
            borderRadius: 100, padding: 3, boxShadow: T.shadowCard,
          }}>
            <button onClick={() => setView('narrative')} style={{
              padding: '7px 14px', borderRadius: 100, border: 'none',
              background: view === 'narrative' ? T.n800 : 'transparent',
              color: view === 'narrative' ? '#fff' : T.n500,
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT_SANS,
            }}>Narrative</button>
            <button onClick={() => setView('grid')} style={{
              padding: '7px 14px', borderRadius: 100, border: 'none',
              background: view === 'grid' ? T.n800 : 'transparent',
              color: view === 'grid' ? '#fff' : T.n500,
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT_SANS,
            }}>Grid</button>
          </div>
          <button style={{
            background: T.p500, color: '#fff', border: 'none',
            padding: '12px 22px', borderRadius: 14, fontFamily: FONT_SANS,
            fontWeight: 500, fontSize: 14, boxShadow: T.shadowPrimary, cursor: 'pointer',
          }}>Send 23 items to Groceries →</button>
        </div>
      </div>

      <div style={{ height: 24 }} />

      {/* Grocery status — collapsed view of v1's modal */}
      <GrocerySatusCard />

      <div style={{ height: 28 }} />

      {/* Narrative timeline */}
      {view === 'narrative' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DAYS.map(d => {
            const meal = PLAN_V2[d.abbr]?.dinner;
            if (!meal) {
              return (
                <EmptyStanza
                  key={d.abbr}
                  day={d}
                  suggestions={THU_SUGGESTIONS}
                  expanded={d.abbr === 'Thu' && thuOpen}
                  onToggle={() => d.abbr === 'Thu' && setThuOpen(!thuOpen)}
                />
              );
            }
            return <MealStanza key={d.abbr} day={d} meal={meal} today={d.today} />;
          })}
        </div>
      )}

      {/* Grid mode placeholder */}
      {view === 'grid' && (
        <div style={{
          background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 18,
          padding: '40px', boxShadow: T.shadowCard, textAlign: 'center',
        }}>
          <div style={{ fontFamily: FONT_DISP, fontStyle: 'italic', fontSize: 22, color: T.n400 }}>
            Grid mode keeps the v1 7-day spread for power-planning.
          </div>
          <div style={{ fontSize: 13, color: T.n500, marginTop: 8, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            Same suggestions and language; columns instead of stanzas. Useful when you want
            to compare days side-by-side. Narrative is the default for reading.
          </div>
        </div>
      )}

      {/* Footnote */}
      <div style={{
        marginTop: 28, paddingTop: 20, borderTop: `1px solid ${T.n200}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 12, color: T.n400, fontStyle: 'italic', fontFamily: FONT_DISP, fontSize: 16 }}>
          Iris is also planning. Last edit: Wed dinner, 2 min ago.
        </div>
        <div style={{ fontSize: 11, color: T.n400, letterSpacing: '0.04em' }}>
          DRAG STILL WORKS · TAP-TO-SUGGEST IS THE FAST PATH
        </div>
      </div>
    </PaperBg>
  );
}

// =============================================================================
//   MEMORY SHELF V2 — RECIPES AS LIVED LANGUAGE, NOT PILLS
// =============================================================================

const SHELF = [
  { title: 'Sheet-pan miso salmon', cookedAgo: '2 weeks ago', mins: 25,
    line: 'Both kids will eat this. Iris adds extra glaze.', source: 'NYT',
    streak: 'Made 8 times. The Wednesday default.' },
  { title: 'Pasta al limone', cookedAgo: '6 days ago', mins: 22,
    line: 'Both kids love this. Scott makes it his way.', source: 'Smitten',
    streak: 'Made 12 times. Family staple.' },
  { title: 'Sunday turkey chili', cookedAgo: '3 weeks ago', mins: 55,
    line: 'Both kids will eat this. Doubles as Tuesday dinner.', source: 'Iris',
    streak: 'The prep-day workhorse. Always doubled.' },
  { title: 'Marry-me chicken w/ orzo', cookedAgo: '1 month ago', mins: 40,
    line: 'Both kids love this. Worth the 40 minutes.', source: 'Half Baked',
    streak: 'Made 4 times. Saved for low-energy nights.' },
  { title: 'Crispy gnocchi + sage', cookedAgo: '11 days ago', mins: 20,
    line: 'Ella loves it. Kaleb eats it without negotiation.', source: 'NYT',
    streak: 'Made 5 times. Pantry-friendly.' },
  { title: 'Lentil soup', cookedAgo: '2 months ago', mins: 35,
    line: 'Ella eats it. Kaleb refuses — needs his pasta.', source: 'Iris',
    streak: 'Made 3 times. Keep the alternate ready.' },
  { title: 'Pad see ew', cookedAgo: '3 weeks ago', mins: 30,
    line: 'Both kids love this. Iris\'s favorite weeknight.', source: 'Hot Thai',
    streak: 'Made 6 times. Big leftovers.' },
  { title: 'Tofu lettuce wraps', cookedAgo: 'Never', mins: 25,
    line: 'New — no kid history yet.', source: 'NYT',
    streak: null, isNew: true },
  { title: 'Sausage + white bean stew', cookedAgo: '5 weeks ago', mins: 45,
    line: 'Ella loves it. Kaleb negotiates over the beans.', source: 'Bon Appétit',
    streak: 'Made 4 times. Cold-night meal.' },
];

function ShelfEntry({ r }) {
  const isNew = r.isNew;
  return (
    <article style={{
      paddingBottom: 24, borderBottom: `1px solid ${T.n200}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <Kicker color={isNew ? T.a500 : T.n400}>
          {isNew ? 'NEVER COOKED · NEW' : `LAST COOKED · ${r.cookedAgo.toUpperCase()}`}
        </Kicker>
        <span style={{ fontSize: 11, color: T.n400 }}>·</span>
        <span style={{ fontSize: 11, color: T.n400 }}>{r.source}</span>
        <span style={{ fontSize: 11, color: T.n400 }}>·</span>
        <span style={{ fontSize: 11, color: T.n400 }}>{r.mins} min</span>
      </div>
      <h3 style={{
        fontFamily: FONT_DISP, fontSize: 32, lineHeight: 1.1, letterSpacing: '-0.01em',
        margin: 0, color: T.n800, fontWeight: 400, textWrap: 'pretty',
      }}>{r.title}</h3>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Annotation tone="sage" italic>{r.line}</Annotation>
        {r.streak && <Annotation italic>{r.streak}</Annotation>}
      </div>
    </article>
  );
}

function MemoryShelf() {
  return (
    <PaperBg style={{ width: 1280, padding: '40px 48px 56px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 32 }}>
        <div style={{ flex: 1 }}>
          <Kicker color={T.p500}>MEMORY SHELF · 47 RECIPES</Kicker>
          <div style={{ height: 8 }} />
          <Display size={52}>
            What we cook <em style={{ color: T.p500 }}>together</em>.
          </Display>
          <div style={{ fontSize: 16, color: T.n500, marginTop: 12, maxWidth: 600, lineHeight: 1.5,
                        fontFamily: FONT_DISP, fontStyle: 'italic' }}>
            Not a database. A record of what's worked — sorted by what we just ate,
            with the kid-acceptance written like you'd say it to a friend.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{
              background: T.elev, color: T.n700, border: `1px solid ${T.n200}`,
              padding: '10px 18px', borderRadius: 100, fontFamily: FONT_SANS,
              fontWeight: 500, fontSize: 13, cursor: 'pointer',
            }}>+ Manual entry</button>
            <button style={{
              background: T.n800, color: '#fff', border: 'none',
              padding: '10px 18px', borderRadius: 100, fontFamily: FONT_SANS,
              fontWeight: 500, fontSize: 13, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                background: '#fff', color: T.n800, fontSize: 8, fontWeight: 800,
                padding: '1px 4px', borderRadius: 2, letterSpacing: '0.02em',
              }}>NY</span>
              Paste NYT URL
            </button>
          </div>
          <div style={{ fontSize: 11, color: T.n400, fontStyle: 'italic', fontFamily: FONT_DISP, fontSize: 14 }}>
            Sorted by recently cooked
          </div>
        </div>
      </div>

      <div style={{ height: 32 }} />

      {/* Soft filter row — far less than v1 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 24, borderBottom: `2px solid ${T.n800}` }}>
        <span style={{ fontSize: 12, color: T.n500, fontFamily: FONT_SANS }}>Show:</span>
        {['All', 'Quick (<30m)', 'Both kids will eat', 'Never cooked', 'Prep-friendly'].map((l, i) => (
          <button key={l} style={{
            background: i === 0 ? T.n800 : 'transparent',
            color: i === 0 ? '#fff' : T.n500,
            border: i === 0 ? 'none' : `1px solid ${T.n200}`,
            padding: '6px 14px', borderRadius: 100, fontSize: 12,
            cursor: 'pointer', fontFamily: FONT_SANS, fontWeight: 500,
          }}>{l}</button>
        ))}
      </div>

      <div style={{ height: 28 }} />

      {/* Editorial list, two columns of book-like entries */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 48px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {SHELF.slice(0, Math.ceil(SHELF.length / 2)).map(r => <ShelfEntry key={r.title} r={r} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {SHELF.slice(Math.ceil(SHELF.length / 2)).map(r => <ShelfEntry key={r.title} r={r} />)}
        </div>
      </div>

      {/* Footer rationale */}
      <div style={{
        marginTop: 32, padding: '24px 28px', background: T.r50,
        border: `1px solid ${T.r100}`, borderRadius: 14,
      }}>
        <Kicker color={T.r500}>WHY LANGUAGE, NOT PILLS</Kicker>
        <div style={{ height: 8 }} />
        <div style={{ fontFamily: FONT_DISP, fontSize: 22, lineHeight: 1.3, letterSpacing: '-0.005em', color: T.n800 }}>
          A pill says <em style={{ color: T.r500 }}>"REJECTS"</em>. A sentence says <em style={{ color: T.s500 }}>"Kaleb negotiates."</em>
        </div>
        <div style={{ marginTop: 10, fontSize: 14, color: T.n600, lineHeight: 1.55, maxWidth: 720 }}>
          Same data. Different relationship to it. The sentence makes Kaleb a person,
          not a constraint. It also lets Iris know what to do — pasta + butter on
          standby — without the UI shouting it.
        </div>
      </div>
    </PaperBg>
  );
}

// =============================================================================
//   EXPORTS
// =============================================================================

window.PlannerV2_TokenSheet = TokenSheet;
window.PlannerV2_Planner    = PlannerV2;
window.PlannerV2_Shelf      = MemoryShelf;

})(); // end IIFE
