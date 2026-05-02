/* =============================================================================
   MEAL PLANNER V3 — DOCUMENT-SHAPED PLAN, AI-GENERATED, IRIS-EDITED
   Brief: rebuild around the actual artifact Iris produces (rich doc with
   standing habits, what's-different, ingredient threads, Sunday prep, per-day
   cards w/ grams + kid mods + scaffolds, lineage-annotated shopping list).
   IIFE-wrapped so identifiers don't collide with v1/v2 artboards.
   ============================================================================= */
(() => {

// --- Editorial Calm tokens (mirrored from src/index.css; same shape as v2) ---
const T = {
  bg:       'hsl(45 25% 96%)',
  elev:     'hsl(48 35% 99%)',
  paper:    'hsl(46 35% 97%)',
  n50:  'hsl(45 30% 98%)', n100: 'hsl(43 25% 95%)', n200: 'hsl(40 18% 88%)',
  n300: 'hsl(38 14% 75%)', n400: 'hsl(36 10% 55%)', n500: 'hsl(34 8% 42%)',
  n600: 'hsl(30 10% 32%)', n700: 'hsl(28 14% 22%)', n800: 'hsl(25 18% 15%)',
  n900: 'hsl(22 22% 10%)',
  p50:  'hsl(168 30% 96%)', p100: 'hsl(168 28% 90%)', p200: 'hsl(168 26% 78%)',
  p300: 'hsl(168 28% 62%)', p400: 'hsl(168 35% 45%)', p500: 'hsl(168 45% 30%)',
  p600: 'hsl(168 50% 24%)', p700: 'hsl(168 52% 20%)',
  a50:  'hsl(18 60% 97%)',  a100: 'hsl(18 55% 92%)', a300: 'hsl(18 48% 68%)',
  a500: 'hsl(18 55% 45%)',  a600: 'hsl(18 60% 38%)',
  s100: 'hsl(145 18% 90%)', s400: 'hsl(145 22% 48%)', s500: 'hsl(145 28% 36%)',
  r50:  'hsl(30 35% 96%)',  r100: 'hsl(30 30% 92%)', r500: 'hsl(30 40% 45%)',
  shadowCard:    '0 0 0 1px hsl(38 20% 88% / 0.6), 0 2px 8px -2px hsl(25 20% 20% / 0.04)',
  shadowElev:    '0 0 0 1px hsl(38 20% 88% / 0.4), 0 8px 24px -4px hsl(25 20% 20% / 0.08)',
  shadowPrimary: '0 8px 24px -6px hsl(168 45% 30% / 0.3)',
  iris:  'hsl(168 35% 45%)', scott: 'hsl(145 22% 48%)',
};
const FD = "'Instrument Serif', Georgia, serif";
const FS = "'Satoshi', system-ui, -apple-system, sans-serif";
const FM = "ui-monospace, 'SF Mono', Menlo, monospace";

// --- atoms ------------------------------------------------------------------

function Kicker({ children, color, style }) {
  return <div style={{ fontFamily: FS, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: color || T.n400, ...style }}>{children}</div>;
}
function Display({ size = 40, italic, color = T.n800, style, children }) {
  return <h1 style={{ fontFamily: FD, fontStyle: italic ? 'italic' : 'normal', fontSize: size, lineHeight: 1.04, letterSpacing: '-0.012em', color, margin: 0, fontWeight: 400, textWrap: 'pretty', ...style }}>{children}</h1>;
}
function Body({ size = 14, color = T.n600, style, children }) {
  return <div style={{ fontFamily: FS, fontSize: size, lineHeight: 1.55, color, ...style }}>{children}</div>;
}
function PaperBg({ children, style }) {
  return (
    <div style={{ position: 'relative', background: T.bg, fontFamily: FS, color: T.n800, ...style }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025, mixBlendMode: 'multiply',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

function Tag({ children, tone = 'neutral', italic }) {
  const tones = {
    neutral: { bg: T.n100, fg: T.n600, br: T.n200 },
    prep:    { bg: T.p50,  fg: T.p600, br: T.p100 },
    warn:    { bg: T.a50,  fg: T.a600, br: T.a100 },
    sage:    { bg: T.s100, fg: T.s500, br: T.s100 },
    review:  { bg: T.r50,  fg: T.r500, br: T.r100 },
  }[tone] || { bg: T.n100, fg: T.n600, br: T.n200 };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: italic ? FD : FS, fontStyle: italic ? 'italic' : 'normal',
      fontSize: italic ? 14 : 11, fontWeight: italic ? 400 : 500,
      padding: italic ? '0 8px' : '3px 9px', borderRadius: 999,
      color: tones.fg, background: tones.bg, border: `1px solid ${tones.br}`,
      letterSpacing: italic ? 0 : '0.01em',
    }}>{children}</span>
  );
}

// "[bracket — annotation]" — pure inline, no chip chrome
function Bracket({ kind = 'neutral', children }) {
  const c = { neutral: T.n500, prep: T.p500, warn: T.a500, sage: T.s500, heart: T.a500 }[kind] || T.n500;
  return (
    <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 14.5, color: c, whiteSpace: 'nowrap' }}>
      [{children}]
    </span>
  );
}

function Topbar({ kicker = 'PLAN · MEALS', who = 'IRIS' }) {
  return (
    <div style={{ height: 52, borderBottom: `1px solid ${T.n200}`, background: T.elev, display: 'flex', alignItems: 'center', padding: '0 28px', gap: 16 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: T.p500, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FD, fontSize: 18, lineHeight: 1 }}>S</div>
      <div style={{ fontFamily: FD, fontSize: 22, color: T.n800, lineHeight: 1 }}>Symphony</div>
      <div style={{ width: 1, height: 18, background: T.n200, margin: '0 4px' }} />
      <Kicker color={T.n500}>{kicker}</Kicker>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 12, color: T.n500, fontFamily: FD, fontStyle: 'italic' }}>Sunday · 8:42a</div>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: T.iris, color: '#fff', fontWeight: 700, fontSize: 11, display: 'grid', placeItems: 'center' }}>{who[0]}</div>
      </div>
    </div>
  );
}

// Tiny chevron / icon helpers (SVG primitives only)
const Chev = ({ d = 'down', size = 12, color = T.n400 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" style={{ transform: d === 'right' ? 'rotate(-90deg)' : d === 'up' ? 'rotate(180deg)' : 'none' }}>
    <path d="M2 4.5 L6 8.5 L10 4.5" stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// =============================================================================
//   SURFACE 1 · WEEKLY BRIEF COMPOSER
// =============================================================================
function S1_Brief() {
  const lines = [
    '800g challenge',
    'No stir fry this week',
    'Bittman shrimp — finally!',
  ];
  return (
    <PaperBg style={{ width: 1280, height: 880 }}>
      <Topbar kicker="PLAN · WEEK OF APR 27" />
      <div style={{ padding: '64px 96px 0' }}>
        <Kicker color={T.p500}>NEW PLAN · WEEK OF APR 27 → MAY 2</Kicker>
        <div style={{ height: 12 }} />
        <Display size={56}>What's the week<em style={{ color: T.p500 }}>,</em> Iris<span style={{ color: T.p500 }}>?</span></Display>
        <div style={{ height: 8 }} />
        <Body size={16} color={T.n500} style={{ maxWidth: 640, fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: T.n500 }}>
          A target, an exclusion, an aspiration. Whatever you'd write at the top of a Google Doc — Symphony will read it.
        </Body>

        <div style={{ height: 36 }} />

        {/* Composer */}
        <div style={{
          background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 18,
          boxShadow: T.shadowElev, padding: 28, maxWidth: 920,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: T.iris, color: '#fff', fontWeight: 700, fontSize: 10, display: 'grid', placeItems: 'center' }}>I</div>
            <Kicker color={T.n500}>IRIS · WEEKLY BRIEF</Kicker>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Tag tone="neutral">⌘ + Enter to draft</Tag>
            </div>
          </div>

          {/* Free-form editor */}
          <div style={{
            fontFamily: FD, fontSize: 32, lineHeight: 1.35, color: T.n800,
            minHeight: 180, paddingBottom: 6, position: 'relative',
          }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <span style={{ color: T.n300, fontSize: 22, fontFamily: FS, width: 18, textAlign: 'right' }}>{i + 1}</span>
                <span style={{ borderBottom: `1px dashed transparent` }}>
                  {i === 2 ? <><span>Bittman shrimp </span><em style={{ color: T.p500 }}>— finally!</em></> : l}
                </span>
              </div>
            ))}
            {/* caret */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{ color: T.n300, fontSize: 22, fontFamily: FS, width: 18, textAlign: 'right' }}>4</span>
              <span style={{ display: 'inline-block', width: 2, height: 28, background: T.p500, marginTop: 2, animation: 'none' }} />
            </div>
          </div>

          {/* AI parse-back */}
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px dashed ${T.n200}` }}>
            <Kicker color={T.p500} style={{ marginBottom: 10 }}>SYMPHONY HEARS</Kicker>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Tag tone="prep">target · 800g vegetables / day</Tag>
              <Tag tone="warn">exclude · stir fry, frozen veg bags</Tag>
              <Tag tone="sage">aspirational · Bittman shrimp (broiler)</Tag>
              <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.n400, marginLeft: 6 }}>
                — pulling 14 candidate recipes from the shelf
              </span>
            </div>
          </div>

          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={{
              background: T.p500, color: '#fff', border: 'none',
              padding: '14px 26px', borderRadius: 14, fontFamily: FS,
              fontWeight: 500, fontSize: 14, boxShadow: T.shadowPrimary, cursor: 'pointer',
              display: 'inline-flex', gap: 8, alignItems: 'center',
            }}>Draft the week →</button>
            <button style={{
              background: 'transparent', color: T.n600, border: `1px solid ${T.n200}`,
              padding: '13px 22px', borderRadius: 14, fontFamily: FS,
              fontWeight: 500, fontSize: 14, cursor: 'pointer',
            }}>Start blank</button>
            <div style={{ marginLeft: 'auto', fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.n400 }}>
              Last week's brief: <span style={{ color: T.n600 }}>"Recover from camping. Easy week."</span>
            </div>
          </div>
        </div>

        {/* Standing-habits read-out — context, not config */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22, maxWidth: 920 }}>
          <Kicker color={T.n400}>+ STANDING HABITS APPLIED (5)</Kicker>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Tag>Yogurt breakfast + cherry tomatoes</Tag>
            <Tag>Red lentil dal at lunch + spinach stirred in</Tag>
            <Tag>Raw vegetables at lunch (doubled)</Tag>
            <Tag>Afternoon snack (3–4pm)</Tag>
            <Tag>Light dinner nights</Tag>
          </div>
          <span style={{ fontSize: 12, color: T.p500, textDecoration: 'underline', cursor: 'pointer' }}>edit habits</span>
        </div>
      </div>
    </PaperBg>
  );
}

// =============================================================================
//   SURFACE 2 · STANDING HABITS CONFIGURATION
// =============================================================================

// Plain meal-slot dropdown (read-only render of a select).
function SlotPill({ slot }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '7px 12px 7px 14px', border: `1px solid ${T.n200}`, borderRadius: 10,
      background: T.bg, fontSize: 13, color: T.n700, minWidth: 120, justifyContent: 'space-between',
    }}>
      <span>{slot}</span>
      <Chev d="down" color={T.n400} />
    </div>
  );
}

function S2_Habits() {
  // Five rows. Each row = habit name + grams hint + meal slot.
  // The page footer is one factual sentence. No cadence model, no day-dots,
  // no toggles, no philosophy copy. Defaults attached to a meal slot,
  // override anytime.
  const habits = [
    { id: 1, name: 'Yogurt breakfast + cherry tomatoes', grams: '+80g',     slot: 'Breakfast' },
    { id: 2, name: 'Red lentil dal at lunch + spinach stirred in', grams: '+60–80g', slot: 'Lunch' },
    { id: 3, name: 'Raw vegetables at lunch (doubled)', grams: '+150–200g', slot: 'Lunch' },
    { id: 4, name: 'Afternoon snack (3–4pm)',           grams: '',          slot: 'Snack' },
    { id: 5, name: 'Light dinner nights',               grams: '',          slot: 'Dinner' },
  ];
  return (
    <PaperBg style={{ width: 1280, height: 1100 }}>
      <Topbar kicker="PLAN · STANDING HABITS" />
      <div style={{ padding: '64px 96px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <Display size={52}>Standing Habits</Display>
            <Body size={16} color={T.n500} style={{ marginTop: 10, maxWidth: 640, fontFamily: FD, fontStyle: 'italic', fontSize: 20 }}>
              Your daily rituals that apply to every day. Symphony will handle.
            </Body>
          </div>
          <button style={{
            background: T.p500, color: '#fff', border: 'none',
            padding: '12px 18px', borderRadius: 12, fontFamily: FS,
            fontWeight: 500, fontSize: 13, boxShadow: T.shadowPrimary, cursor: 'pointer',
          }}>+ Add habit</button>
        </div>

        <div style={{ height: 28 }} />

        <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 18, boxShadow: T.shadowCard, overflow: 'hidden' }}>
          {habits.map((h, i) => (
            <div key={h.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 110px 160px',
              gap: 24, alignItems: 'center', padding: '22px 28px',
              borderTop: i ? `1px solid ${T.n100}` : 'none',
            }}>
              <div style={{ fontFamily: FD, fontSize: 24, color: T.n800, lineHeight: 1.2 }}>{h.name}</div>
              <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: h.grams ? T.p500 : T.n300, textAlign: 'right' }}>
                {h.grams || '—'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <SlotPill slot={h.slot} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 22 }} />
        <Body size={14} color={T.n400} style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 17, textAlign: 'center' }}>
          These habits are included in every plan unless you override them.
        </Body>
      </div>
    </PaperBg>
  );
}

// =============================================================================
//   SURFACE 3 · THE BIG PLAN VIEW (document)
// =============================================================================

const PLAN_DAYS = [
  { abbr: 'MON', date: 'Apr 27', target: 1000, prior: 840, diff: '+160g', kind: 'cook' },
  { abbr: 'TUE', date: 'Apr 28', target: 1000, prior: 880, diff: '+120g', kind: 'cook', star: true },
  { abbr: 'WED', date: 'Apr 29', target: 1000, prior: 760, diff: '+240g', kind: 'cook' },
  { abbr: 'THU', date: 'Apr 30', target: 800,  prior: 700, diff: '+100g', kind: 'light' },
  { abbr: 'FRI', date: 'May 1',  target: null, prior: null, diff: null,    kind: 'out' },
  { abbr: 'SAT', date: 'May 2',  target: null, prior: null, diff: null,    kind: 'morning' },
];

const SECTIONS = [
  { id: 'header',   label: 'Header & brief' },
  { id: 'habits',   label: 'Standing habits' },
  { id: 'diff',     label: "What's different" },
  { id: 'threads',  label: 'Ingredient threads' },
  { id: 'sunday',   label: 'Sunday batch-cook' },
  { id: 'days',     label: 'Days · Mon–Sat' },
  { id: 'shop',     label: 'Shopping list' },
];

function S3_PlanView() {
  // Document-shaped: a single Google-Doc-like column. Thin file-rail on the
  // left for visual context (decorative — file icons of past plans), no
  // section-jump nav, no right chat rail. Standing-habits collapses to one
  // line. Days stack as a compact list with grams on the right and "View day"
  // links — full meal detail lives on S4, not here.
  return (
    <PaperBg style={{ width: 1440, height: 2200 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', minHeight: '100%' }}>

        {/* LEFT FILE RAIL — decorative, like a Drive sidebar */}
        <div style={{ borderRight: `1px solid ${T.n200}`, background: T.elev, padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{
              width: 28, height: 34, borderRadius: 4,
              background: i === 3 ? T.p100 : T.bg,
              border: `1px solid ${i === 3 ? T.p300 : T.n200}`,
              position: 'relative',
            }}>
              <div style={{ position: 'absolute', top: 4, left: 5, right: 5, height: 1, background: i === 3 ? T.p400 : T.n200 }} />
              <div style={{ position: 'absolute', top: 9, left: 5, right: 8, height: 1, background: i === 3 ? T.p300 : T.n200 }} />
              <div style={{ position: 'absolute', top: 14, left: 5, right: 11, height: 1, background: i === 3 ? T.p300 : T.n200 }} />
            </div>
          ))}
        </div>

        {/* DOCUMENT */}
        <div>
          {/* Top bar — Drive-like */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 56px', borderBottom: `1px solid ${T.n200}`, background: T.elev }}>
            <span style={{ fontSize: 13, color: T.n500, cursor: 'pointer' }}>← Back</span>
            <span style={{ color: T.n300 }}>·</span>
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 17, color: T.n600 }}>Week of May 11–16 (Week 3)</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: T.n400 }}>Edited just now</span>
            <button style={{ background: 'transparent', color: T.n600, border: `1px solid ${T.n200}`, padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Share</button>
            <span style={{ fontSize: 16, color: T.n400, padding: '0 4px', cursor: 'pointer' }}>···</span>
          </div>

          <div style={{ padding: '52px 96px 96px', maxWidth: 1100 }}>

            {/* TITLE */}
            <Display size={56}>Family Meal Plan — Week 3</Display>
            <div style={{ height: 12 }} />
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: T.n500, lineHeight: 1.35 }}>
              Monday–Saturday · 800g challenge · No stir fry this week · Bittman shrimp — finally!
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 12, color: T.p500, textDecoration: 'underline', cursor: 'pointer' }}>edit brief</span>
            </div>

            {/* STANDING HABITS — single collapsed line */}
            <div style={{ marginTop: 44 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Chev d="down" color={T.n500} />
                <div style={{ fontFamily: FD, fontSize: 22, color: T.n800 }}>Standing habits (5)</div>
              </div>
              <div style={{ paddingLeft: 22, fontFamily: FS, fontSize: 13.5, color: T.n500, lineHeight: 1.7 }}>
                Yogurt breakfast +80g · Dal lunch +60–80g · Raw veg lunch +150–200g · Snack 3–4pm · Light dinner nights
              </div>
            </div>

            {/* WHAT'S DIFFERENT — prose */}
            <div style={{ marginTop: 36 }}>
              <div style={{ fontFamily: FD, fontSize: 22, color: T.n800, marginBottom: 10 }}>What's different this week</div>
              <div style={{ fontFamily: FS, fontSize: 14.5, lineHeight: 1.75, color: T.n700, maxWidth: 820 }}>
                No stir fry at all — zero TJ's bags this week. Monday is roasted cauliflower instead. Tuesday is <strong style={{ fontWeight: 500, color: T.a500 }}>Bittman shrimp (broiled)</strong>, scaffolded step by step on the day card. Friday adults are going out. Saturday morning only as usual.
              </div>
            </div>

            {/* INGREDIENT THREADS — compact table */}
            <div style={{ marginTop: 40 }}>
              <div style={{ fontFamily: FD, fontSize: 22, color: T.n800, marginBottom: 12 }}>Ingredient threads</div>
              <div style={{ border: `1px solid ${T.n200}`, borderRadius: 10, overflow: 'hidden', background: T.elev }}>
                {[
                  { ing: 'Red lentil dal',           where: 'Iris lunches Mon / Tue / Wed' },
                  { ing: 'Quinoa (Sunday batch)',    where: 'Mon dinner · Thu lunch bowl' },
                  { ing: 'Hard-boiled eggs (12)',    where: 'Kid sides Mon–Thu · Thu breakfast' },
                ].map((r, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, padding: '11px 18px',
                    borderTop: i ? `1px solid ${T.n100}` : 'none',
                    fontSize: 13.5, color: T.n700,
                  }}>
                    <div style={{ color: T.n800 }}>{r.ing}</div>
                    <div style={{ color: T.n500 }}>{r.where}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* SUNDAY BATCH — checkbox list */}
            <div style={{ marginTop: 40 }}>
              <div style={{ fontFamily: FD, fontSize: 22, color: T.n800, marginBottom: 12 }}>Sunday batch-cook</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 36, rowGap: 14 }}>
                {[
                  ['Red lentil dal',          'Base for Mon–Wed lunches'],
                  ['Roast sweet potatoes (3)', 'Kid sides'],
                  ['Quinoa (batch)',           'Mon dinner + Thu bowl'],
                  ['Cut raw veggies',          'For lunches + snacks'],
                  ['Hard-boiled eggs (12)',    'Kids Mon–Thu + Thu breakfast'],
                  ['Move shrimp to fridge',    'Sunday night'],
                ].map(([t, sub], i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 12, alignItems: 'baseline' }}>
                    <div style={{ width: 16, height: 16, border: `1.5px solid ${T.n300}`, borderRadius: 4, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 14, color: T.n800 }}>{t}</div>
                      <div style={{ fontSize: 12.5, color: T.n500, marginTop: 2 }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* DAYS — stacked compact list */}
            <div style={{ marginTop: 44 }}>
              {[
                { d: 'Monday',    date: 'May 11', summary: '',                           target: 1000, prior: 920 },
                { d: 'Tuesday',   date: 'May 12', summary: '',                           target: 1000, prior: 880 },
                { d: 'Wednesday', date: 'May 13', summary: '',                           target: 1000, prior: 920 },
                { d: 'Thursday',  date: 'May 14', summary: '',                           target: 800,  prior: 940 },
                { d: 'Friday',    date: 'May 15', summary: 'Going out — enjoy it',       target: null },
                { d: 'Saturday',  date: 'May 16', summary: 'Morning only — kids back',   target: null, morning: true },
              ].map((day, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '38px 220px 1fr 180px 90px',
                  alignItems: 'center', gap: 18, padding: '18px 0',
                  borderTop: `1px solid ${T.n100}`, borderBottom: i === 5 ? `1px solid ${T.n100}` : 'none',
                }}>
                  <Chev d="right" color={T.n400} size={14} />
                  <div>
                    <div style={{ fontFamily: FD, fontSize: 22, color: T.n800 }}>{day.d}</div>
                    <div style={{ fontSize: 12, color: T.n400, marginTop: 1 }}>· {day.date}</div>
                  </div>
                  <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 17, color: T.n500 }}>
                    {day.summary}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                    {day.target && <GramRing target={day.target} prior={day.prior} />}
                    {day.target && (
                      <div style={{ fontFamily: FD, fontSize: 17, color: T.p500, fontStyle: 'italic' }}>
                        ~{day.prior}g <span style={{ color: T.n400 }}>/ {day.target}g</span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 13, color: T.p500, textDecoration: 'underline', cursor: 'pointer' }}>View day</span>
                  </div>
                </div>
              ))}
            </div>

            {/* SHOPPING LIST footer */}
            <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontFamily: FD, fontSize: 22, color: T.n800 }}>Shopping list</div>
              <div style={{ fontSize: 13, color: T.n500 }}>· 6 sections</div>
              <div style={{ marginLeft: 'auto' }}>
                <button style={{ background: T.p500, color: '#fff', border: 'none', padding: '12px 22px', borderRadius: 12, fontWeight: 500, fontSize: 13, boxShadow: T.shadowPrimary, cursor: 'pointer' }}>
                  Review & send
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </PaperBg>
  );
}

// Compact day card used inside the document
function DayCardCompact({ day, idx }) {
  const isOut = day.kind === 'out';
  const isMorning = day.kind === 'morning';
  const isLight = day.kind === 'light';

  return (
    <div style={{
      marginTop: idx === 0 ? 0 : 18, background: T.elev, borderRadius: 16,
      border: `1px solid ${T.n200}`, boxShadow: T.shadowCard, overflow: 'hidden',
    }}>
      {/* Day header strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: '120px 1fr 220px',
        alignItems: 'center', padding: '20px 24px',
        background: isOut ? T.a50 : isMorning ? T.r50 : T.paper,
        borderBottom: `1px solid ${T.n200}`,
      }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 32, lineHeight: 1, color: T.n800 }}>{day.abbr}</div>
          <Body size={12} color={T.n500} style={{ marginTop: 2 }}>{day.date}</Body>
        </div>
        <div>
          {isOut ? (
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: T.a500 }}>Adults out — enjoy it.</div>
          ) : isMorning ? (
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: T.r500 }}>Morning only — kids back from grandparents.</div>
          ) : isLight ? (
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: T.n500 }}>Light dinner night.</div>
          ) : (
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: T.n600 }}>
              {day.star ? 'Tuesday · Bittman shrimp — first time.' : 'Cooking at home.'}
            </div>
          )}
        </div>
        {day.target ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
            <GramRing target={day.target} prior={day.prior} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: T.n500, letterSpacing: '0.06em' }}>IRIS · TARGET</div>
              <div style={{ fontFamily: FD, fontSize: 22, color: T.p500, lineHeight: 1 }}>~{day.target}g</div>
              <div style={{ fontSize: 11, color: T.n400 }}>was ~{day.prior}g · {day.diff}</div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'right' }}>
            <Body size={12} color={T.n400}>no target this day</Body>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        {isOut ? (
          <div style={{ fontFamily: FD, fontSize: 24, color: T.n700, lineHeight: 1.3 }}>
            <strong style={{ fontWeight: 400, color: T.a600 }}>DINNER —</strong> Going out. Sitter 6:30. Kids fed at 5 — leftovers from Wed.
          </div>
        ) : isMorning ? (
          <MealLine when="BREAKFAST" iris="Yogurt + cherry tomatoes" scott="Coffee, skipping" kids="Pancakes — kids first morning home" />
        ) : (
          <>
            <MealLine when="BREAKFAST" iris="Yogurt + tomatoes" scott="Skipping" kids="HB eggs · sweet potato" />
            <MealLine when="LUNCH"     iris="Dal + raw veg + apple" scott="Cold cuts sandwich · pickles" kids="Pasta + peas + ham" />
            <SnackLine items={[['Apple', 90], ['Cherry tomatoes', 80]]} total={170} />
            <DinnerLine
              title={idx === 1 ? 'Bittman broiled shrimp' : idx === 0 ? 'Roasted cauliflower bowl + quinoa' : 'Sheet-pan miso salmon'}
              prep={idx === 1 ? 'Pre-heat broiler high. 4 min, flip, 3 min. Lemon & parsley off-heat.' : 'Roast 425°F · finish with chickpeas + tahini'}
              grams={idx === 1 ? [['Shrimp', 0], ['Asparagus side', 200], ['Quinoa', 0], ['Lemon', 0]] : [['Cauliflower', 200], ['Chickpeas', 100], ['Spinach', 50], ['Sweet potato', 80]]}
              gramTotal={idx === 1 ? 200 : 430}
              kidMod="HB eggs + sweet potato + cut carrots — same table"
              brackets={
                idx === 1 ? [['heart', 'first time making it — you\'ve got this'], ['warn', 'shrimp — thawed Sunday night'], ['prep', 'quinoa — Sunday batch']] :
                idx === 0 ? [['prep', 'quinoa — Sunday batch'], ['prep', 'cauliflower — Monday roast'], ['warn', 'no stir fry this week']] :
                [['prep', 'eggs — Sunday batch'], ['neutral', 'salmon — Wed shop']]
              }
              showScaffold={idx === 1}
            />
          </>
        )}
      </div>
    </div>
  );
}

function MealLine({ when, iris, scott, kids }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr', gap: 18, padding: '10px 0', borderBottom: `1px dashed ${T.n100}` }}>
      <Kicker color={T.n400} style={{ paddingTop: 4 }}>{when}</Kicker>
      <Body size={13.5} color={T.n700}><span style={{ color: T.iris, fontWeight: 600 }}>I</span>  {iris}</Body>
      <Body size={13.5} color={T.n700}><span style={{ color: T.scott, fontWeight: 600 }}>S</span>  {scott}</Body>
      <Body size={13.5} color={T.n500} style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16 }}>kids · {kids}</Body>
    </div>
  );
}

function SnackLine({ items, total }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 18, padding: '12px 0', borderBottom: `1px dashed ${T.n100}` }}>
      <Kicker color={T.n400} style={{ paddingTop: 4 }}>3PM SNACK</Kicker>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        {items.map((it, i) => (
          <span key={i} style={{ fontFamily: FD, fontSize: 20, color: T.n700 }}>
            {it[0]} <span style={{ color: T.p500, fontStyle: 'italic' }}>{it[1]}g</span>
            {i < items.length - 1 && <span style={{ color: T.n300, margin: '0 4px' }}>·</span>}
          </span>
        ))}
        <span style={{ marginLeft: 8, fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: T.n400 }}>= {total}g</span>
      </div>
    </div>
  );
}

function DinnerLine({ title, prep, grams, gramTotal, kidMod, brackets, showScaffold }) {
  return (
    <div style={{ padding: '16px 0 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 18 }}>
        <Kicker color={T.a500} style={{ paddingTop: 4 }}>DINNER</Kicker>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: FD, fontSize: 28, color: T.n800, lineHeight: 1.2 }}>{title}</div>
            {brackets.map((b, i) => <Bracket key={i} kind={b[0]}>{b[1]}</Bracket>)}
          </div>
          <Body size={13.5} color={T.n500} style={{ marginTop: 8 }}>{prep}</Body>
          {/* Grams math */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            {grams.map((g, i) => (
              <span key={i} style={{ fontFamily: FD, fontSize: 18, color: T.n600 }}>
                {g[0]}{g[1] ? <span style={{ color: T.p500, fontStyle: 'italic' }}> {g[1]}g</span> : <span style={{ color: T.n400, fontStyle: 'italic' }}> —</span>}
                {i < grams.length - 1 && <span style={{ color: T.n300, margin: '0 6px' }}>·</span>}
              </span>
            ))}
            <span style={{ marginLeft: 8, fontFamily: FD, fontStyle: 'italic', fontSize: 17, color: T.p500 }}>= {gramTotal}g</span>
          </div>
          {/* Kid mod */}
          <div style={{ marginTop: 10, padding: '10px 12px', background: T.s100, borderRadius: 8, display: 'inline-block' }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: T.s500, marginRight: 8 }}>KIDS</span>
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 17, color: T.s500 }}>{kidMod}</span>
          </div>

          {showScaffold && <ScaffoldInline />}
        </div>
      </div>
    </div>
  );
}

// Inline 8-step scaffold for "first time" recipes
function ScaffoldInline() {
  const steps = [
    'Move shrimp from freezer → fridge Sunday night.',
    'Pat dry · salt liberally · oil thin.',
    'Broiler high · rack 4" from element · 3 min preheat.',
    'Lay shrimp single-layer on foil-lined sheet.',
    '4 minutes · don\'t walk away.',
    'Flip with tongs · 2–3 minutes more.',
    'Off-heat: lemon, parsley, flaky salt.',
    'Plate over quinoa · asparagus on the side.',
  ];
  return (
    <div style={{
      marginTop: 18, padding: 22, background: T.a50, border: `1px solid ${T.a100}`,
      borderRadius: 14, position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: -10, left: 18, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', color: T.a500, background: T.bg, padding: '0 8px' }}>STEP-BY-STEP · KITCHEN MODE</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
        <div style={{ fontFamily: FD, fontSize: 24, color: T.a600 }}>Bittman shrimp · 8 steps</div>
        <Body size={12} color={T.n500} style={{ fontStyle: 'italic', fontFamily: FD, fontSize: 15 }}>~9 min total · broiler high</Body>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: T.a500 }}>open kitchen view →</span>
      </div>
      <ol style={{ counterReset: 'step', paddingLeft: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', margin: 0 }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 10, alignItems: 'baseline' }}>
            <div style={{ fontFamily: FD, fontSize: 26, color: T.a500, fontStyle: 'italic', textAlign: 'right' }}>{i + 1}</div>
            <div style={{ fontSize: 14, color: T.n700, lineHeight: 1.45 }}>{s}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function GramRing({ target, prior }) {
  const r = 22, c = 2 * Math.PI * r;
  const pct = Math.min(prior / target, 1);
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} stroke={T.n200} strokeWidth="3" fill="none" />
      <circle cx="28" cy="28" r={r} stroke={T.p500} strokeWidth="3" fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform="rotate(-90 28 28)" />
      <text x="28" y="32" textAnchor="middle" fontFamily={FD} fontSize="14" fill={T.p500} fontStyle="italic">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

// =============================================================================
//   SURFACE 4 · PER-DAY CARD — COMPACT + DETAIL SIDE BY SIDE
// =============================================================================
function S4_DayDetail() {
  // Two states of the same card, shown together. Compact = how the day appears
  // inside the document (tiny ring, one-line meal summary). Detail = expanded,
  // editable, with a Notes field. The transition between them is the design idea.
  return (
    <PaperBg style={{ width: 1280, height: 1100 }}>
      <Topbar kicker="PLAN · DAY CARD · TWO STATES" />
      <div style={{ padding: '40px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 8 }}>
          <Display size={40}>Per-day card</Display>
          <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: T.n500, paddingBottom: 4 }}>
            compact ↔ expanded
          </span>
        </div>
        <Body size={14} color={T.n500} style={{ maxWidth: 720 }}>
          The same Monday in two states. Compact is how it appears inline in the plan document. Expanded is what you get when you tap "View day".
        </Body>

        <div style={{ height: 28 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 28, alignItems: 'flex-start' }}>

          {/* COMPACT */}
          <div>
            <Kicker color={T.n400} style={{ marginBottom: 10 }}>COMPACT (IN-DOCUMENT)</Kicker>
            <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14, padding: '18px 22px', boxShadow: T.shadowCard }}>
              <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr 110px', alignItems: 'center', gap: 14 }}>
                <GramRing target={1000} prior={920} />
                <div>
                  <div style={{ fontFamily: FD, fontSize: 24, color: T.n800, lineHeight: 1.1 }}>Monday</div>
                  <div style={{ fontSize: 12, color: T.n400, marginTop: 2 }}>· May 11</div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.p500 }}>~920 / 1000g</div>
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${T.n100}`, fontSize: 13, color: T.n600, lineHeight: 1.7 }}>
                <div><span style={{ color: T.n400, width: 70, display: 'inline-block' }}>Breakfast</span>Yogurt + cherry tomatoes</div>
                <div><span style={{ color: T.n400, width: 70, display: 'inline-block' }}>Lunch</span>Dal + raw veg + apple</div>
                <div><span style={{ color: T.n400, width: 70, display: 'inline-block' }}>Snack</span>Apple 90g · Tomatoes 80g <span style={{ fontFamily: FD, fontStyle: 'italic', color: T.n400 }}>= 170g</span></div>
                <div><span style={{ color: T.n400, width: 70, display: 'inline-block' }}>Dinner</span>Roasted cauliflower + chickpeas</div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: T.p500, textDecoration: 'underline', cursor: 'pointer' }}>View day →</div>
            </div>
          </div>

          {/* EXPANDED */}
          <div>
            <Kicker color={T.p500} style={{ marginBottom: 10 }}>EXPANDED (EDIT / DETAIL)</Kicker>
            <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14, padding: '22px 26px', boxShadow: T.shadowCard }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', alignItems: 'flex-start', gap: 18 }}>
                <div>
                  <div style={{ fontFamily: FD, fontSize: 32, color: T.n800, lineHeight: 1.1 }}>Monday <span style={{ color: T.n400, fontStyle: 'italic', fontSize: 22 }}>· May 11</span></div>
                  <div style={{ marginTop: 4, fontFamily: FD, fontStyle: 'italic', fontSize: 17, color: T.n500 }}>800g challenge</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                  <GramRing target={1000} prior={920} />
                  <div>
                    <div style={{ fontFamily: FD, fontSize: 22, color: T.p500, fontStyle: 'italic', lineHeight: 1 }}>~920g</div>
                    <div style={{ fontSize: 11, color: T.n400, marginTop: 2 }}>/ 1,000g target</div>
                  </div>
                </div>
              </div>

              <div style={{ height: 14 }} />

              {/* Meal rows */}
              <MealEditRow when="BREAKFAST" iris="Yogurt + cherry tomatoes" scott="Skipping" kids="HB eggs + sweet potato" />
              <MealEditRow when="LUNCH" iris="Dal + raw veg + apple" scott="Cold cuts sandwich" kids="Pasta + peas + ham" gramHints={[['dal', 70], ['raw veg', 150], ['apple', 90]]} />
              <SnackEditRow />
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 18, padding: '14px 0', borderBottom: `1px solid ${T.n100}` }}>
                <Kicker color={T.a500} style={{ paddingTop: 4 }}>DINNER</Kicker>
                <div>
                  <div style={{ fontFamily: FD, fontSize: 22, color: T.n800, lineHeight: 1.2 }}>Roasted cauliflower + chickpeas</div>
                  <Body size={13} color={T.n500} style={{ marginTop: 6 }}>Roast 425°F · finish with tahini</Body>
                  <div style={{ marginTop: 8, padding: '8px 12px', background: T.s100, borderRadius: 8, display: 'inline-block' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: T.s500, marginRight: 8 }}>KIDS</span>
                    <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: T.s500 }}>HB eggs + sweet potato + cut carrots</span>
                  </div>
                </div>
              </div>

              {/* Notes field */}
              <div style={{ marginTop: 16 }}>
                <Kicker color={T.n400}>NOTES</Kicker>
                <div style={{ marginTop: 6, padding: '10px 12px', background: T.bg, border: `1px dashed ${T.n200}`, borderRadius: 10, fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.n500, minHeight: 36 }}>
                  Easy win. Minimal clean-up.
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button style={{ background: T.elev, color: T.n700, border: `1px solid ${T.n200}`, padding: '9px 14px', borderRadius: 10, fontSize: 12.5, cursor: 'pointer' }}>Step by step ↗</button>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: T.p500, textDecoration: 'underline', cursor: 'pointer' }}>Edit day</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 24 }} />
        <div style={{ textAlign: 'center', fontFamily: FD, fontStyle: 'italic', fontSize: 17, color: T.n400 }}>
          Same data · two densities · same edit semantics
        </div>
      </div>
    </PaperBg>
  );
}

function MealEditRow({ when, iris, scott, kids, gramHints }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr 1fr', gap: 18, padding: '12px 0', borderBottom: `1px solid ${T.n100}` }}>
      <Kicker color={T.n400} style={{ paddingTop: 6 }}>{when}</Kicker>
      <EditCell who="Iris" color={T.iris} text={iris} hints={gramHints} />
      <EditCell who="Scott" color={T.scott} text={scott} />
      <EditCell who="Kids" color={T.s500} text={kids} kid />
    </div>
  );
}
function EditCell({ who, color, text, hints, kid }) {
  return (
    <div>
      <div style={{ fontSize: 10, color, fontWeight: 600, letterSpacing: '0.12em', marginBottom: 4 }}>{who.toUpperCase()}</div>
      <div style={{ fontFamily: kid ? FD : FS, fontStyle: kid ? 'italic' : 'normal', fontSize: kid ? 16 : 13.5, color: T.n700 }}>{text}</div>
      {hints && (
        <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hints.map(h => <span key={h[0]} style={{ color: T.p500, fontFamily: FD, fontStyle: 'italic', fontSize: 12.5 }}>{h[0]} {h[1]}g</span>)}
        </div>
      )}
    </div>
  );
}
function SnackEditRow() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 18, padding: '12px 0', borderBottom: `1px solid ${T.n100}` }}>
      <Kicker color={T.n400} style={{ paddingTop: 6 }}>3PM SNACK</Kicker>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span style={{ fontFamily: FD, fontSize: 18, color: T.n700 }}>Apple <span style={{ color: T.p500, fontStyle: 'italic' }}>90g</span></span>
        <span style={{ color: T.n300 }}>·</span>
        <span style={{ fontFamily: FD, fontSize: 18, color: T.n700 }}>Cherry tomatoes <span style={{ color: T.p500, fontStyle: 'italic' }}>80g</span></span>
        <span style={{ marginLeft: 6, fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.n400 }}>= 170g</span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.p500, cursor: 'pointer' }}>+ add item</span>
      </div>
    </div>
  );
}

// =============================================================================
//   SURFACE 5 · ASK SYMPHONY — popover anchored to a button
// =============================================================================
function S5_Chat() {
  // Chat is a popover, not a persistent rail. A small "Symphony AI" button
  // floats over the document; tapping it opens a focused panel anchored to
  // it. The plan stays primary; the assistant is on call.
  return (
    <PaperBg style={{ width: 1600, height: 1100 }}>
      <Topbar kicker="PLAN · ASK SYMPHONY" />
      <div style={{ padding: '40px 80px', position: 'relative' }}>

        {/* Document peek */}
        <Display size={48}>Family Meal Plan — Week 3</Display>
        <div style={{ marginTop: 8, fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: T.n500 }}>
          Monday–Saturday · 800g challenge · No stir fry · Bittman shrimp — finally!
        </div>

        <div style={{ height: 36 }} />
        <div style={{ fontFamily: FD, fontSize: 22, color: T.n800, marginBottom: 12 }}>Tuesday · May 12</div>
        <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14, padding: 22, maxWidth: 720, opacity: 0.9 }}>
          <div style={{ fontFamily: FD, fontSize: 28, color: T.n800 }}>Bittman broiled shrimp</div>
          <Body size={13.5} color={T.n500} style={{ marginTop: 4 }}>Pre-heat broiler. 4 min, flip, 3 min. Lemon & parsley off-heat.</Body>
          <div style={{ marginTop: 10, padding: '8px 12px', background: T.s100, borderRadius: 8, display: 'inline-block' }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: T.s500, marginRight: 8 }}>KIDS</span>
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.s500 }}>HB eggs + sweet potato + cut carrots</span>
          </div>
        </div>

        <div style={{ height: 24 }} />
        <div style={{ fontFamily: FD, fontSize: 22, color: T.n800, marginBottom: 12 }}>Wednesday · May 13</div>
        <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14, padding: 22, maxWidth: 720, opacity: 0.5 }}>
          <div style={{ fontFamily: FD, fontSize: 24, color: T.n700 }}>Sheet-pan miso salmon</div>
          <Body size={13} color={T.n500} style={{ marginTop: 4 }}>Roast 425°F · finish with chickpeas + tahini</Body>
        </div>

        {/* Floating Symphony AI button */}
        <div style={{
          position: 'absolute', right: 80, bottom: 380,
          width: 56, height: 56, borderRadius: 28,
          background: T.p500, color: '#fff',
          boxShadow: T.shadowPrimary,
          display: 'grid', placeItems: 'center',
          fontFamily: FD, fontSize: 24, lineHeight: 1,
        }}>
          ✦
        </div>

        {/* Popover */}
        <div style={{
          position: 'absolute', right: 64, bottom: 80,
          width: 400, background: T.elev,
          border: `1px solid ${T.n200}`, borderRadius: 16,
          boxShadow: '0 20px 50px -10px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}>
          {/* Popover header */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.n100}`, display: 'flex', alignItems: 'center', gap: 10, background: T.bg }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: T.p500, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FD, fontSize: 14 }}>✦</div>
            <div style={{ fontFamily: FD, fontSize: 18, color: T.n800 }}>Symphony AI</div>
            <span style={{ marginLeft: 'auto', fontSize: 16, color: T.n400, cursor: 'pointer' }}>×</span>
          </div>

          {/* User message bubble */}
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ alignSelf: 'flex-end', background: T.p500, color: '#fff', padding: '10px 14px', borderRadius: 14, borderBottomRightRadius: 4, fontSize: 13.5, lineHeight: 1.45, maxWidth: 280 }}>
              Make Tuesday's dinner kid-friendlier.
            </div>

            {/* Assistant reply */}
            <div style={{ alignSelf: 'flex-start', maxWidth: 320 }}>
              <Body size={13} color={T.n700} style={{ lineHeight: 1.55 }}>
                Absolutely. Here are 2 options that keep the spirit but are easier for the kids.
              </Body>
              <div style={{ height: 12 }} />
              <div style={{ background: T.bg, border: `1px solid ${T.n200}`, borderRadius: 10, padding: '10px 12px' }}>
                <Kicker color={T.n500}>TUESDAY DINNER · KID-FRIENDLY SWAP</Kicker>
                <div style={{ marginTop: 8, fontSize: 12.5, color: T.n400, textDecoration: 'line-through' }}>Original: Bittman shrimp (broiled)</div>
                <div style={{ marginTop: 4, fontFamily: FD, fontSize: 17, color: T.p500 }}>Switch to: Creamy lemon shrimp pasta with peas</div>
                <Body size={12.5} color={T.n500} style={{ marginTop: 6 }}>Same shrimp, familiar, mild flavors, easy to portion.</Body>
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  <button style={{ flex: 1, background: 'transparent', color: T.n600, border: `1px solid ${T.n200}`, padding: '7px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Preview change</button>
                  <button style={{ flex: 1, background: T.p500, color: '#fff', border: 'none', padding: '7px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Apply to plan</button>
                </div>
              </div>

              <div style={{ marginTop: 10, padding: '8px 12px', border: `1px solid ${T.p100}`, borderRadius: 8, background: T.p50, fontSize: 12, color: T.p600, cursor: 'pointer' }}>
                Reduce Wednesday's prep time
              </div>
            </div>
          </div>

          {/* Input */}
          <div style={{ padding: 14, borderTop: `1px solid ${T.n100}`, background: T.bg }}>
            <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 10, padding: '9px 12px', fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: T.n400 }}>
              Ask anything about your plan…
            </div>
          </div>
        </div>
      </div>
    </PaperBg>
  );
}

// =============================================================================
//   SURFACE 6 · RECIPE SCAFFOLD — KITCHEN MODE
// =============================================================================
function S6_Scaffold() {
  const steps = [
    { n: 1, time: 'Sunday night', t: 'Move shrimp from freezer → fridge.', sub: 'Set a phone alarm before bed. Defrosts overnight. If you forget — cold-water bath, 30 min.' },
    { n: 2, time: '–10 min', t: 'Pat shrimp dry. Salt liberally. Thin coat of oil.', sub: 'Liberally means more than feels right. Shrimp absorbs slowly.' },
    { n: 3, time: '–7 min', t: 'Broiler on HIGH. Rack 4" from element.', sub: 'Most ovens — that\'s the second-from-top slot. 3-minute preheat.' },
    { n: 4, time: 'Now', t: 'Lay shrimp single-layer on foil-lined sheet.', sub: 'No crowding. They steam if they touch.' },
    { n: 5, time: '4 min', t: 'Don\'t walk away.', sub: 'Watch the tails. They\'re done at the moment they curl tight and the edges char black at the tips.' },
    { n: 6, time: '+2–3 min', t: 'Flip with tongs. Back under for 2–3 min.', sub: 'Same visual cue on the second side. If unsure: cut one in half — should be opaque all the way through.' },
    { n: 7, time: 'Off-heat', t: 'Lemon, parsley, flaky salt.', sub: 'Big squeeze of lemon over the hot sheet — it sizzles and steam-finishes the shrimp. Don\'t skip.' },
    { n: 8, time: 'Plate', t: 'Over quinoa. Asparagus on the side.', sub: 'Quinoa is from Sunday batch. Re-warm with a splash of broth.' },
  ];
  return (
    <PaperBg style={{ width: 1280, height: 1700 }}>
      <Topbar kicker="KITCHEN MODE · TUE 6:42P" />
      <div style={{ padding: '32px 64px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 12, color: T.n500 }}>← back to plan</span>
          <span style={{ color: T.n300 }}>/</span>
          <Kicker color={T.a500}>STEP-BY-STEP · NEW RECIPE</Kicker>
        </div>
        <div style={{ height: 16 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 32 }}>
          <div style={{ flex: 1 }}>
            <Display size={72}>Bittman shrimp<em style={{ color: T.a500 }}>.</em></Display>
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 30, color: T.a500, marginTop: 4 }}>First time making it — you've got this.</div>
          </div>
          <div style={{ display: 'flex', gap: 22 }}>
            <Stat n="9" l="MIN ACTIVE" />
            <Stat n="425°" l="BROILER HI" />
            <Stat n="4" l="INGREDIENTS" />
          </div>
        </div>

        <Body size={14} color={T.n500} style={{ marginTop: 18, maxWidth: 720, fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: T.n500 }}>
          This view auto-opens when Iris's recipe is flagged <strong style={{ fontWeight: 400, color: T.a500 }}>first-time</strong>, OR when the AI flags it as kitchen-intimidating, OR when she taps "open in kitchen mode" on the day card.
        </Body>

        {/* Triggers explainer */}
        <div style={{ marginTop: 22, padding: 16, background: T.elev, borderRadius: 12, border: `1px solid ${T.n200}`, display: 'flex', gap: 32 }}>
          <Kicker color={T.n500}>TRIGGERS</Kicker>
          <Body size={13} color={T.n600}>
            ⏷ <strong style={{ fontWeight: 600 }}>Recipe.firstTime = true</strong> on shelf entry  ·  ⏷ AI tagged "intimidating" (broiler / live fire / specific timing)  ·  ⏷ Iris pinned "open scaffold" on this day
          </Body>
        </div>

        <div style={{ height: 32 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {steps.map(s => (
            <div key={s.n} style={{
              background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 18,
              padding: 26, display: 'grid', gridTemplateColumns: '64px 1fr', gap: 18,
              boxShadow: T.shadowCard,
            }}>
              <div>
                <div style={{ fontFamily: FD, fontSize: 56, lineHeight: 1, color: T.a500, fontStyle: 'italic' }}>{s.n}</div>
                <Kicker color={T.n400} style={{ marginTop: 6 }}>{s.time}</Kicker>
              </div>
              <div>
                <div style={{ fontFamily: FD, fontSize: 26, lineHeight: 1.25, color: T.n800 }}>{s.t}</div>
                <Body size={13.5} color={T.n500} style={{ marginTop: 8, lineHeight: 1.6 }}>{s.sub}</Body>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PaperBg>
  );
}
function Stat({ n, l }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: FD, fontSize: 44, color: T.n800, lineHeight: 1 }}>{n}</div>
      <Kicker color={T.n400} style={{ marginTop: 2 }}>{l}</Kicker>
    </div>
  );
}

// =============================================================================
//   SURFACE 7 · VEGETABLE-GRAM TRACKING
// =============================================================================
function S7_Grams() {
  const days = [
    { d: 'MON', val: 1010, target: 1000, src: { yog: 80, dal: 70, raw: 150, snk: 170, din: 430, oth: 110 } },
    { d: 'TUE', val: 880,  target: 1000, src: { yog: 80, dal: 70, raw: 150, snk: 170, din: 200, oth: 210 }, today: true },
    { d: 'WED', val: 940,  target: 1000, src: { yog: 80, dal: 70, raw: 150, snk: 170, din: 380, oth: 90 } },
    { d: 'THU', val: 720,  target: 800,  src: { yog: 80, dal: 0,  raw: 150, snk: 170, din: 200, oth: 120 } },
    { d: 'FRI', val: null, target: null },
    { d: 'SAT', val: null, target: null },
  ];
  return (
    <PaperBg style={{ width: 1280, height: 980 }}>
      <Topbar kicker="PLAN · 800G TRACKER" />
      <div style={{ padding: '40px 80px' }}>
        <Kicker color={T.p500}>OPT-IN · ATTACHED TO BRIEF "800G CHALLENGE"</Kicker>
        <div style={{ height: 10 }} />
        <Display size={56}>800g, sentenced. <em style={{ color: T.p500 }}>Not clinical.</em></Display>
        <Body size={16} color={T.n500} style={{ marginTop: 10, maxWidth: 720, fontFamily: FD, fontStyle: 'italic', fontSize: 20 }}>
          The grams surface only when Iris's brief sets a target. Otherwise the doc shows the food, not the math.
        </Body>

        <div style={{ height: 36 }} />

        {/* Week ribbon */}
        <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 18, padding: 28, boxShadow: T.shadowCard }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Kicker color={T.n500}>THIS WEEK · IRIS</Kicker>
            <Body size={12} color={T.n400} style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16 }}>Avg target: 933g · 4 cooking days</Body>
          </div>
          <div style={{ height: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, alignItems: 'end', height: 220 }}>
            {days.map(day => (
              <div key={day.d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: day.today ? T.p500 : T.n500 }}>
                  {day.val ? `${day.val}g` : '—'}
                </div>
                <div style={{ width: '70%', height: 160, background: T.bg, borderRadius: 8, position: 'relative', border: `1px solid ${T.n100}` }}>
                  {day.target && (
                    <div style={{ position: 'absolute', left: -4, right: -4, top: `${100 - (day.target / 1100) * 100}%`, borderTop: `1.5px dashed ${T.p300}` }} />
                  )}
                  {day.val && (
                    <StackedBar src={day.src} maxH={(day.val / 1100) * 100} />
                  )}
                </div>
                <Kicker color={day.today ? T.p500 : T.n400}>{day.d}</Kicker>
                {day.target && <Body size={11} color={T.n400}>~{day.target}g</Body>}
              </div>
            ))}
          </div>
        </div>

        {/* Surfacing options */}
        <div style={{ height: 32 }} />
        <Kicker color={T.n400}>HOW IT APPEARS IN THE DOC</Kicker>
        <div style={{ height: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {[
            { t: 'Per-day ring', s: 'Tiny ring on day-card header. Click for breakdown. Always when target set.' },
            { t: 'Inline math', s: 'Snack & dinner read "Apple 90g · Tomatoes 80g = 170g". Reads like prose, gives the count.' },
            { t: 'Week ribbon', s: 'This page — shown if Iris taps the kicker on the plan. Otherwise lives quietly.' },
          ].map(x => (
            <div key={x.t} style={{ background: T.elev, borderRadius: 12, border: `1px solid ${T.n200}`, padding: 18 }}>
              <div style={{ fontFamily: FD, fontSize: 22, color: T.n800 }}>{x.t}</div>
              <Body size={13} color={T.n500} style={{ marginTop: 6 }}>{x.s}</Body>
            </div>
          ))}
        </div>
      </div>
    </PaperBg>
  );
}
function StackedBar({ src, maxH }) {
  const colors = { yog: T.s400, dal: T.p400, raw: T.p500, snk: T.a300, din: T.p600, oth: T.n300 };
  const total = Object.values(src).reduce((a, b) => a + b, 0);
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${maxH}%`, display: 'flex', flexDirection: 'column-reverse', borderRadius: '6px 6px 0 0', overflow: 'hidden' }}>
      {Object.entries(src).map(([k, v]) => (
        <div key={k} style={{ height: `${(v / total) * 100}%`, background: colors[k] }} />
      ))}
    </div>
  );
}

// =============================================================================
//   SURFACE 8 · SEND-TO-GROCERIES MODAL v2
// =============================================================================
function S8_Groceries() {
  const sections = [
    {
      title: 'PRODUCE — FOR SUNDAY BATCH', open: true, count: 7,
      items: [
        { qty: 'Spinach — large bag',  why: 'dal · stirred in (Mon/Tue/Wed)' },
        { qty: 'Carrots — 2 lb',       why: 'cut sticks (lunches Mon–Fri)' },
        { qty: 'Sweet potatoes — 3',   why: 'kid sides + Iris snack' },
        { qty: 'Cucumbers — 2',        why: 'cut sticks (lunches)' },
        { qty: 'Lemons — 5',           why: 'shrimp · salads · water (Mon/Tue/Wed/Thu)' },
      ],
    },
    {
      title: 'PRODUCE — WEEKNIGHT DINNERS & BOOSTS', open: true, count: 6,
      items: [
        { qty: 'Cauliflower — 1 head', why: 'Mon dinner' },
        { qty: 'Asparagus — 1 lb',     why: 'Tue Bittman shrimp side' },
        { qty: 'Cherry tomatoes — 2 pints', why: 'breakfasts + snacks' },
        { qty: 'Apples — 4',           why: 'Iris snacks Mon/Wed/Fri + Thu lunch' },
      ],
    },
    {
      title: 'FROZEN', open: true, count: 1,
      items: [{ qty: 'Bittman shrimp — 1 lb', why: 'Tue dinner — move to fridge Sun night' }],
    },
    {
      title: 'CANNED & DRY GOODS', open: true, count: 4,
      items: [
        { qty: 'Red lentils — 1 bag', why: 'Sunday dal · 3-day batch' },
        { qty: 'Quinoa — 2 cups dry', why: 'Mon dinner + Thu bowl' },
        { qty: 'Chickpeas — 1 can',   why: 'Mon roasted cauli bowl' },
        { qty: 'Tahini — 1 jar',      why: 'Mon · whisked dressing' },
      ],
    },
    {
      title: 'PROTEIN & DAIRY', open: true, count: 4,
      items: [
        { qty: 'Whole-milk yogurt — large tub', why: 'breakfast all week' },
        { qty: 'Eggs — 1 dozen', why: 'Sunday HB batch (12)' },
        { qty: 'Salmon — 1.5 lb', why: 'Wed sheet-pan' },
      ],
    },
    {
      title: 'PANTRY — CHECK BEFORE BUYING', open: false, count: 5,
      items: [
        { qty: 'Olive oil', why: '' }, { qty: 'Sea salt', why: '' }, { qty: 'Black pepper', why: '' },
        { qty: 'Cumin seed', why: '' }, { qty: 'Bay leaves', why: '' },
      ],
    },
    {
      title: "SCOTT'S LUNCHES — separate stream", open: true, count: 3,
      items: [
        { qty: 'Sourdough — 1 loaf', why: 'sandwiches Mon–Fri' },
        { qty: 'Sliced turkey — 1 lb', why: 'Scott Mon/Tue/Wed' },
        { qty: 'Pickles — 1 jar', why: 'Scott daily' },
      ],
    },
  ];
  return (
    <PaperBg style={{ width: 1280, height: 1640 }}>
      <Topbar kicker="REVIEW · SHOPPING LIST" />
      <div style={{ padding: '40px 96px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <Kicker color={T.p500}>REVIEW BEFORE SENDING · APPLE REMINDERS</Kicker>
            <div style={{ height: 8 }} />
            <Display size={48}>27 items, with their <em style={{ color: T.p500 }}>reasons</em>.</Display>
            <Body size={15} color={T.n500} style={{ marginTop: 8, fontFamily: FD, fontStyle: 'italic', fontSize: 19 }}>
              Every line tells you why it's on the list and how much you actually need to buy.
            </Body>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <Body size={12} color={T.n400}>To · Groceries (shared with Scott · iCloud)</Body>
            <button style={{ background: T.p500, color: '#fff', border: 'none', padding: '14px 24px', borderRadius: 14, fontWeight: 500, fontSize: 14, boxShadow: T.shadowPrimary }}>
              Send 27 items →
            </button>
            <Body size={12} color={T.n400} style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 14 }}>5 pantry items skipped · check at home</Body>
          </div>
        </div>

        <div style={{ height: 28 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {sections.map((s, i) => (
            <div key={i} style={{
              background: s.open ? T.elev : T.n50,
              border: `1px solid ${T.n200}`, borderRadius: 14,
              opacity: s.open ? 1 : 0.85,
            }}>
              <div style={{ padding: '14px 20px', borderBottom: s.open ? `1px solid ${T.n100}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Chev d={s.open ? 'down' : 'right'} color={T.n500} />
                <Kicker color={s.title.includes('PANTRY') ? T.r500 : T.n600}>{s.title}</Kicker>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: T.n400 }}>{s.count} items</span>
              </div>
              {s.open && (
                <div style={{ padding: '8px 0' }}>
                  {s.items.map((it, j) => (
                    <div key={j} style={{ padding: '10px 20px', display: 'grid', gridTemplateColumns: '14px 1fr 16px', gap: 12, alignItems: 'baseline', borderBottom: j < s.items.length - 1 ? `1px dashed ${T.n100}` : 'none' }}>
                      <div style={{ width: 14, height: 14, border: `1.5px solid ${T.n300}`, borderRadius: 4, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 14, color: T.n800 }}>{it.qty}</div>
                        {it.why && <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 14, color: T.n500, marginTop: 2 }}>{it.why}</div>}
                      </div>
                      <div style={{ fontSize: 12, color: T.n400, cursor: 'pointer' }}>×</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PaperBg>
  );
}

// =============================================================================
//   SURFACE 9 · KIOSK · TONIGHT VIEW (wall idiom)
// =============================================================================
function S9_Kiosk() {
  // Full-bleed dish photo · big serif headline · two giant action buttons.
  // Confident and loud. Week strip on the right rail. No data slop.
  return (
    <div style={{ width: 1280, height: 800, background: '#0d1614', color: '#fff', position: 'relative', overflow: 'hidden', fontFamily: FS }}>
      {/* Full-bleed "photo" — placeholder via warm gradient + grain */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse at 30% 50%, hsl(20 60% 38% / 0.95), transparent 60%),
          radial-gradient(ellipse at 75% 70%, hsl(35 70% 45% / 0.55), transparent 55%),
          radial-gradient(ellipse at 50% 100%, hsl(15 50% 22%), transparent 70%),
          linear-gradient(180deg, hsl(15 35% 18%) 0%, hsl(20 30% 12%) 100%)
        `,
      }} />
      {/* Subtle dish-photo placeholder shape */}
      <div style={{
        position: 'absolute', left: '8%', top: '38%', width: 380, height: 380,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, hsl(40 80% 65% / 0.4), hsl(20 70% 35% / 0.5) 50%, transparent 75%)',
        filter: 'blur(2px)',
      }} />
      {/* Dark gradient over right side for readability */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg, transparent 0%, transparent 35%, rgba(13,22,20,0.85) 70%, rgba(13,22,20,0.95) 100%)',
      }} />

      <div style={{ position: 'relative', padding: '40px 48px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar — minimal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontFamily: FD, fontSize: 22, color: 'rgba(255,255,255,0.85)' }}>6:14 pm</div>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.28em', color: 'rgba(255,255,255,0.5)' }}>TUESDAY · APRIL 28</div>
          <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.35)' }}>SYMPHONY · KITCHEN</div>
        </div>

        {/* Body grid: headline on left, week strip on right */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 240px', gap: 40, paddingTop: 50 }}>

          {/* Headline + actions */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.32em', color: '#F9C35C' }}>TONIGHT · 6:30 PM</div>
            <div style={{ height: 10 }} />
            <div style={{ fontFamily: FD, fontSize: 132, lineHeight: 0.92, fontWeight: 400, letterSpacing: '-0.02em' }}>
              Bittman<br/>shrimp.
            </div>
            <div style={{ height: 16 }} />
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 28, color: 'rgba(255,255,255,0.75)', maxWidth: 600 }}>
              Broiled · 9 minutes · over Sunday's quinoa.
            </div>

            <div style={{ height: 36 }} />

            {/* Two giant action buttons */}
            <div style={{ display: 'flex', gap: 16 }}>
              <button style={{
                padding: '24px 36px',
                background: '#F9C35C', color: '#1a1410',
                border: 'none', borderRadius: 16,
                fontFamily: FS, fontSize: 22, fontWeight: 600,
                cursor: 'pointer', letterSpacing: '-0.01em',
                boxShadow: '0 12px 30px rgba(249,195,92,0.3)',
              }}>View steps →</button>
              <button style={{
                padding: '24px 36px',
                background: 'rgba(255,255,255,0.1)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)', borderRadius: 16,
                fontFamily: FS, fontSize: 22, fontWeight: 500,
                cursor: 'pointer', backdropFilter: 'blur(10px)',
              }}>Mark done</button>
            </div>
          </div>

          {/* Week strip on right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 60 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>THIS WEEK</div>
            {[
              ['MON', 'Roasted cauliflower', 'done'],
              ['TUE', 'Bittman shrimp', 'tonight', true],
              ['WED', 'Sheet-pan salmon', '25m'],
              ['THU', 'Quinoa bowl', 'light'],
              ['FRI', 'Adults out', 'sitter'],
              ['SAT', 'Morning only', 'kids back'],
            ].map(([d, t, m, today]) => (
              <div key={d} style={{
                padding: '12px 14px', borderRadius: 10,
                background: today ? 'rgba(249,195,92,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${today ? 'rgba(249,195,92,0.4)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.2em', color: today ? '#F9C35C' : 'rgba(255,255,255,0.45)' }}>{d}</div>
                <div style={{ fontSize: 14, color: today ? '#fff' : 'rgba(255,255,255,0.85)', marginTop: 3 }}>{t}</div>
                <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 12, color: today ? '#F9C35C' : 'rgba(255,255,255,0.4)', marginTop: 2 }}>{m}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
//   SURFACE 10 · MOBILE READ-ONLY (Scott)
// =============================================================================
function S10_Mobile() {
  // It's an app, not a read-only summary. Bottom tabs (Plan / Groceries /
  // Habits). Currently on Plan. Kid mods, today's meals, and a peek at the
  // rest of the week. Tap-to-mark interactions implied.
  const TabIcon = ({ glyph, label, active }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
      <div style={{
        width: 26, height: 26, display: 'grid', placeItems: 'center',
        fontFamily: FD, fontSize: 18, color: active ? T.p500 : T.n400,
        fontWeight: 500,
      }}>{glyph}</div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: active ? T.p500 : T.n400 }}>{label}</div>
    </div>
  );
  return (
    <div style={{ width: 390, height: 844, background: T.bg, fontFamily: FS, position: 'relative', borderRadius: 36, overflow: 'hidden', boxShadow: '0 0 0 8px #1a1410, 0 30px 80px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
      {/* Status bar */}
      <div style={{ height: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
        <span>6:14</span>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ width: 16, height: 10, border: `1.5px solid ${T.n800}`, borderRadius: 2 }} />
        </span>
      </div>

      {/* Top app bar */}
      <div style={{ padding: '4px 22px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: T.n400 }}>TUESDAY · APR 28</div>
          <div style={{ fontFamily: FD, fontSize: 30, color: T.n800, lineHeight: 1.1, marginTop: 2 }}>Plan</div>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.elev, border: `1px solid ${T.n200}`, display: 'grid', placeItems: 'center', fontFamily: FD, fontSize: 16, color: T.p500 }}>✦</div>
      </div>

      {/* Scroll content */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 22px' }}>

        {/* Tonight card */}
        <div style={{ background: T.elev, borderRadius: 18, padding: 18, border: `1px solid ${T.n200}`, boxShadow: T.shadowCard }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.a500 }} />
            <Kicker color={T.a500}>TONIGHT · 6:30</Kicker>
          </div>
          <div style={{ fontFamily: FD, fontSize: 30, lineHeight: 1.15, color: T.n800, marginTop: 6 }}>Bittman shrimp</div>
          <Body size={13} color={T.n500} style={{ marginTop: 4 }}>~9 min · broiler high · Iris cooking</Body>
          <div style={{ marginTop: 12, padding: 10, background: T.s100, borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: T.s500, marginBottom: 3 }}>KIDS</div>
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: T.s500 }}>HB eggs + sweet potato + cut carrots</div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, background: T.p500, color: '#fff', border: 'none', padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 500 }}>Step-by-step</button>
            <button style={{ background: 'transparent', color: T.n600, border: `1px solid ${T.n200}`, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>Done</button>
          </div>
        </div>

        <div style={{ height: 18 }} />
        <Kicker color={T.n400}>UP NEXT</Kicker>
        <div style={{ height: 8 }} />
        {[
          ['WED', 'Sheet-pan miso salmon', '25m'],
          ['THU', 'Quinoa bowl · light',   'leftovers'],
          ['FRI', 'Adults out',            'sitter 6:30'],
          ['SAT', 'Morning only',          'kids back'],
        ].map(([d, t, m]) => (
          <div key={d} style={{
            padding: '11px 14px', borderRadius: 12, marginBottom: 6,
            background: T.elev, border: `1px solid ${T.n200}`,
            display: 'grid', gridTemplateColumns: '38px 1fr auto', gap: 10, alignItems: 'center',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: T.n500 }}>{d}</div>
            <div style={{ fontFamily: FD, fontSize: 17, color: T.n800 }}>{t}</div>
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 12.5, color: T.n400 }}>{m}</div>
          </div>
        ))}
      </div>

      {/* Bottom tab bar */}
      <div style={{
        flexShrink: 0,
        borderTop: `1px solid ${T.n200}`,
        background: T.elev,
        padding: '10px 24px 24px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <TabIcon glyph="◍" label="Plan" active />
        <TabIcon glyph="✓" label="Groceries" />
        <TabIcon glyph="◐" label="Habits" />
      </div>
    </div>
  );
}

// =============================================================================
//   COMPONENT BREAKDOWN + FLOW + JUDGMENT CALLS
// =============================================================================
function S11_Components() {
  const components = [
    { n: 'BriefComposer',       w: '4-line free-form editor with AI parse-back', s: 'Surface 1' },
    { n: 'StandingHabitRow',    w: 'Reorderable habit; when / what / detail / +g',  s: 'Surface 2' },
    { n: 'PlanDocument',        w: 'Long-form scroll container with 7 sections',    s: 'Surface 3' },
    { n: 'WeekDiffParagraph',   w: '"What\'s different" prose block, AI or Iris',   s: 'Surface 3' },
    { n: 'IngredientThreadsTable', w: 'Ingredient → meals → batch source',          s: 'Surface 3' },
    { n: 'SundayPrepTask',      w: 'Checkbox card with "for ·" lineage and notes',  s: 'Surface 3' },
    { n: 'DayCard',             w: 'Header strip + meals + dinner + scaffold',      s: 'Surfaces 3, 4' },
    { n: 'MealLine',            w: '90px kicker + 3 columns (Iris / Scott / Kids)', s: 'All' },
    { n: 'KidModsLine',         w: 'Sage-tinted italic note inside dinner',         s: 'All' },
    { n: 'GramMath',            w: 'Inline "X 90g · Y 80g = 170g"',                 s: 'Surfaces 3, 4, 7' },
    { n: 'GramRing / RingDay',  w: 'Per-day mini ring; click → breakdown',          s: 'Surfaces 3, 4, 7' },
    { n: 'Bracket',             w: 'Italic [recipe annotation] inline — typed',     s: 'All' },
    { n: 'RecipeScaffold',      w: 'Numbered step list, large type, kitchen mode',  s: 'Surfaces 3, 6, 9' },
    { n: 'AskSymphonyRail',     w: 'Right-side chat with diff previews',            s: 'Surfaces 3, 5' },
    { n: 'GroceryReviewLine',   w: 'qty / why / remove · sectioned, collapsible',    s: 'Surface 8' },
    { n: 'KioskHeadline',       w: 'Wall idiom · big serif + glass panels',          s: 'Surface 9' },
    { n: 'MobileWeekRow',       w: 'Compressed day row · today highlighted',         s: 'Surface 10' },
  ];
  return (
    <PaperBg style={{ width: 1280, height: 1480 }}>
      <Topbar kicker="DELIVERABLES · COMPONENTS & FLOW" />
      <div style={{ padding: '40px 80px' }}>
        <Kicker color={T.p500}>COMPONENT BREAKDOWN</Kicker>
        <div style={{ height: 8 }} />
        <Display size={48}>What gets built<em style={{ color: T.p500 }}>.</em></Display>
        <Body size={14} color={T.n500} style={{ marginTop: 8, maxWidth: 720 }}>
          17 reusable units. Each is small enough to ship piecewise — Brief alone, then Habits, then Plan view's sections one at a time.
        </Body>

        <div style={{ height: 24 }} />
        <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14, overflow: 'hidden' }}>
          {components.map((c, i) => (
            <div key={c.n} style={{ display: 'grid', gridTemplateColumns: '260px 1fr 130px', gap: 18, padding: '13px 22px', borderTop: i ? `1px solid ${T.n100}` : 'none', alignItems: 'baseline' }}>
              <div style={{ fontFamily: FM, fontSize: 13, color: T.n800 }}>{c.n}</div>
              <Body size={13.5} color={T.n600}>{c.w}</Body>
              <Body size={11} color={T.n400} style={{ textAlign: 'right' }}>{c.s}</Body>
            </div>
          ))}
        </div>

        {/* Flow diagram */}
        <div style={{ height: 40 }} />
        <Kicker color={T.p500}>SUNDAY MORNING · HAPPY PATH</Kicker>
        <div style={{ height: 8 }} />
        <Display size={36}>~15 minutes <em style={{ color: T.p500 }}>(was ~60)</em>.</Display>

        <div style={{ height: 22 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0, alignItems: 'stretch' }}>
          {[
            { t: 'Open Symphony', d: 'Plan tab · last week pre-loaded as faded ghost', tm: '0:00' },
            { t: 'Write the brief', d: '3–4 lines: target · exclusion · aspiration', tm: '+2 min' },
            { t: 'AI drafts', d: 'Doc fills in: habits applied · diff prose · threads · Sunday tasks · 6 days · shopping list', tm: '+0:30' },
            { t: 'Review & edit', d: 'Scroll. Tap edits. Ask Symphony for kid-friendlier Wed. Two regenerates.', tm: '+9 min' },
            { t: 'Send groceries', d: 'Open review modal · uncheck pantry · send → Apple Reminders', tm: '+3 min' },
          ].map((s, i) => (
            <div key={i} style={{ position: 'relative', padding: '20px 18px', background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14, marginRight: i < 4 ? 12 : 0 }}>
              {i < 4 && (
                <div style={{ position: 'absolute', top: '50%', right: -22, width: 22, height: 1.5, background: T.n300 }}>
                  <div style={{ position: 'absolute', right: -3, top: -3, width: 8, height: 8, border: `1.5px solid ${T.n300}`, borderLeft: 'none', borderBottom: 'none', transform: 'rotate(45deg)' }} />
                </div>
              )}
              <div style={{ fontFamily: FD, fontSize: 36, lineHeight: 1, color: T.p500, fontStyle: 'italic' }}>{i + 1}</div>
              <div style={{ height: 10 }} />
              <div style={{ fontFamily: FD, fontSize: 22, color: T.n800, lineHeight: 1.2 }}>{s.t}</div>
              <Body size={12.5} color={T.n500} style={{ marginTop: 6 }}>{s.d}</Body>
              <div style={{ marginTop: 10, fontFamily: FM, fontSize: 11, color: T.p500 }}>{s.tm}</div>
            </div>
          ))}
        </div>

        {/* Judgment calls */}
        <div style={{ height: 36 }} />
        <Kicker color={T.a500}>THREE JUDGMENT CALLS</Kicker>
        <div style={{ height: 8 }} />
        <Display size={36}>Where I committed.</Display>

        <div style={{ height: 18 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Judgment
            n="A"
            q="AI chat placement"
            answer="Persistent right rail · collapsible to peek strip"
            why="Modal interrupts. Inline blocks fragment the document. A side rail keeps the doc as the artifact and the chat as the editor — Iris can scroll the plan while her last instruction is still visible. Mobile collapses to a sheet."
          />
          <Judgment
            n="B"
            q="Standing-habits prominence"
            answer="Collapsed band at the top of the plan view"
            why="Inlining per day repeats 5 lines × 6 days = 30 lines of noise. A sticky banner takes vertical real estate forever. A collapsed band declares the baseline once, gets out of the way, and is one click to expand or override on any day."
          />
          <Judgment
            n="C"
            q="Vegetable-gram surfacing"
            answer="Only when a target metric is set in the brief"
            why="Iris's brief drives display. Type '800g challenge' → grams appear inline (90g · 80g = 170g), per-day rings, week ribbon. No target → grams disappear; the doc reads like food, not a tracker. Avoids clinical-feeling surfaces in casual weeks."
          />
        </div>
      </div>
    </PaperBg>
  );
}
function Judgment({ n, q, answer, why }) {
  return (
    <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 16, padding: 22, boxShadow: T.shadowCard }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontFamily: FD, fontSize: 36, color: T.a500, fontStyle: 'italic', lineHeight: 1 }}>{n}</div>
        <Kicker color={T.n500}>{q}</Kicker>
      </div>
      <div style={{ height: 10 }} />
      <div style={{ fontFamily: FD, fontSize: 22, color: T.n800, lineHeight: 1.25 }}>{answer}</div>
      <Body size={13} color={T.n500} style={{ marginTop: 10, lineHeight: 1.6 }}>{why}</Body>
    </div>
  );
}

// =============================================================================
//   EXPORTS
// =============================================================================
window.PV3_Brief      = S1_Brief;
window.PV3_Habits     = S2_Habits;
window.PV3_PlanView   = S3_PlanView;
window.PV3_DayDetail  = S4_DayDetail;
window.PV3_Chat       = S5_Chat;
window.PV3_Scaffold   = S6_Scaffold;
window.PV3_Grams      = S7_Grams;
window.PV3_Groceries  = S8_Groceries;
window.PV3_Kiosk      = S9_Kiosk;
window.PV3_Mobile     = S10_Mobile;
window.PV3_Components = S11_Components;
})();
