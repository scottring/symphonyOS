/* =============================================================================
   SYMPHONY · MEAL PLANNING ONBOARDING — first-run experience, ~3 min, 6 screens
   Goal: deliver a real generated plan during the session, not teach UI.
   IIFE-wrapped to avoid identifier collisions.
   ============================================================================= */
(() => {

// --- Tokens (mirrored from PlannerV3) ---------------------------------------
const T = {
  bg:       'hsl(45 25% 96%)',
  elev:     'hsl(48 35% 99%)',
  paper:    'hsl(46 35% 97%)',
  n50:  'hsl(45 30% 98%)', n100: 'hsl(43 25% 95%)', n200: 'hsl(40 18% 88%)',
  n300: 'hsl(38 14% 75%)', n400: 'hsl(36 10% 55%)', n500: 'hsl(34 8% 42%)',
  n600: 'hsl(30 10% 32%)', n700: 'hsl(28 14% 22%)', n800: 'hsl(25 18% 15%)',
  p50:  'hsl(168 30% 96%)', p100: 'hsl(168 28% 90%)', p200: 'hsl(168 26% 78%)',
  p300: 'hsl(168 28% 62%)', p400: 'hsl(168 35% 45%)', p500: 'hsl(168 45% 30%)',
  p600: 'hsl(168 50% 24%)',
  a50:  'hsl(18 60% 97%)',  a100: 'hsl(18 55% 92%)', a300: 'hsl(18 48% 68%)',
  a500: 'hsl(18 55% 45%)',
  s100: 'hsl(145 18% 90%)', s500: 'hsl(145 28% 36%)',
  shadowCard:    '0 0 0 1px hsl(38 20% 88% / 0.6), 0 2px 8px -2px hsl(25 20% 20% / 0.04)',
  shadowElev:    '0 0 0 1px hsl(38 20% 88% / 0.4), 0 8px 24px -4px hsl(25 20% 20% / 0.08)',
  shadowPrimary: '0 8px 24px -6px hsl(168 45% 30% / 0.3)',
};
const FD = "'Instrument Serif', Georgia, serif";
const FS = "'Satoshi', system-ui, -apple-system, sans-serif";

// --- atoms -----------------------------------------------------------------
const Kicker = ({ children, color, style }) => (
  <div style={{ fontFamily: FS, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: color || T.n400, ...style }}>{children}</div>
);
const Display = ({ size = 56, italic, color = T.n800, style, children }) => (
  <h1 style={{ fontFamily: FD, fontStyle: italic ? 'italic' : 'normal', fontSize: size, lineHeight: 1.04, letterSpacing: '-0.012em', color, margin: 0, fontWeight: 400, textWrap: 'pretty', ...style }}>{children}</h1>
);
const Body = ({ size = 15, color = T.n600, style, children }) => (
  <div style={{ fontFamily: FS, fontSize: size, lineHeight: 1.6, color, ...style }}>{children}</div>
);
const Italic = ({ size = 22, color = T.n500, style, children }) => (
  <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: size, lineHeight: 1.4, color, ...style }}>{children}</div>
);

// Shell — every onboarding screen sits in this. 1280×800.
function Shell({ stepNumber, totalSteps, eyebrow, allowSkip, children, footerLeft, footerRight, kioskTopbar = true }) {
  return (
    <div style={{
      width: 1280, height: 800, background: T.bg, fontFamily: FS,
      position: 'relative', overflow: 'hidden', color: T.n800,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* TOPBAR */}
      {kioskTopbar && (
        <div style={{
          height: 56, borderBottom: `1px solid ${T.n200}`, background: T.elev,
          display: 'flex', alignItems: 'center', padding: '0 32px', gap: 16,
          flexShrink: 0,
        }}>
          {/* S-mark */}
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: T.p500, color: '#fff',
            display: 'grid', placeItems: 'center',
            fontFamily: FD, fontStyle: 'italic', fontSize: 18,
          }}>S</div>
          <div style={{ fontFamily: FD, fontSize: 18, color: T.n800 }}>Symphony</div>
          <div style={{ flex: 1 }} />
          {stepNumber && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[...Array(totalSteps)].map((_, i) => (
                <div key={i} style={{
                  width: i + 1 === stepNumber ? 22 : 6,
                  height: 6, borderRadius: 3,
                  background: i + 1 <= stepNumber ? T.p500 : T.n200,
                  transition: 'all 200ms',
                }} />
              ))}
              <div style={{ marginLeft: 8, fontSize: 11, color: T.n500, fontVariantNumeric: 'tabular-nums' }}>
                {stepNumber} of {totalSteps}
              </div>
            </div>
          )}
          {allowSkip && (
            <span style={{ fontSize: 12, color: T.n400, marginLeft: 16, cursor: 'pointer' }}>Skip for now</span>
          )}
        </div>
      )}

      {/* CONTENT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        {eyebrow && (
          <div style={{ padding: '20px 80px 0' }}>
            <Kicker color={T.p500}>{eyebrow}</Kicker>
          </div>
        )}
        {children}
      </div>

      {/* FOOTER */}
      {(footerLeft || footerRight) && (
        <div style={{
          height: 80, borderTop: `1px solid ${T.n200}`, background: T.elev,
          display: 'flex', alignItems: 'center', padding: '0 32px', gap: 16,
          flexShrink: 0,
        }}>
          <div>{footerLeft}</div>
          <div style={{ flex: 1 }} />
          <div>{footerRight}</div>
        </div>
      )}
    </div>
  );
}

// Primary CTA pill
const Cta = ({ children, primary, onClick }) => (
  <button onClick={onClick} style={{
    background: primary ? T.p500 : 'transparent',
    color: primary ? '#fff' : T.n600,
    border: primary ? 'none' : `1px solid ${T.n200}`,
    padding: '14px 28px', borderRadius: 12,
    fontFamily: FS, fontSize: 14, fontWeight: 500,
    cursor: 'pointer',
    boxShadow: primary ? T.shadowPrimary : 'none',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  }}>{children}</button>
);

// Soft chip for selecting / suggesting
const Chip = ({ children, selected, accent }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 999,
    fontSize: 13, fontWeight: 500,
    background: selected ? (accent === 'p' ? T.p500 : T.a100) : T.elev,
    color: selected ? (accent === 'p' ? '#fff' : T.a500) : T.n600,
    border: `1px solid ${selected ? (accent === 'p' ? T.p500 : T.a300) : T.n200}`,
    cursor: 'pointer',
  }}>{children}</span>
);

// =============================================================================
//   SCREEN 1 · WELCOME
// =============================================================================
function O1_Welcome() {
  return (
    <Shell
      kioskTopbar={true}
      footerRight={(
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: T.n400 }}>About 3 minutes</span>
          <Cta primary>Plan my week →</Cta>
        </div>
      )}
      footerLeft={<span style={{ fontSize: 13, color: T.p500, textDecoration: 'underline', cursor: 'pointer' }}>Just looking? See a sample plan →</span>}
    >
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '1.1fr 1fr', alignItems: 'center',
        padding: '0 80px',
      }}>
        {/* Left — copy */}
        <div>
          <Kicker color={T.p500}>WELCOME</Kicker>
          <div style={{ height: 16 }} />
          <Display size={72}>
            Hi Iris<em style={{ color: T.p500, fontStyle: 'italic' }}>.</em>
          </Display>
          <div style={{ height: 18 }} />
          <Italic size={26} color={T.n500} style={{ maxWidth: 540 }}>
            Symphony helps you plan the week your family actually eats — habits, kid mods, Sunday batch, all of it.
          </Italic>
          <div style={{ height: 24 }} />
          <Body size={15} color={T.n600} style={{ maxWidth: 480 }}>
            We'll ask a few quick questions, then draft your first week. You can change anything.
          </Body>
        </div>

        {/* Right — visual */}
        <div style={{ display: 'grid', placeItems: 'center', position: 'relative' }}>
          {/* Decorative stack of small cards — "what you'll get" */}
          <div style={{ position: 'relative', width: 320, height: 380 }}>
            <PreviewCard
              style={{ position: 'absolute', top: 12, left: 0, transform: 'rotate(-3deg)' }}
              kicker="HABITS"
              title="Yogurt + dal lunches"
              tag="standing"
            />
            <PreviewCard
              style={{ position: 'absolute', top: 80, left: 60, transform: 'rotate(2deg)' }}
              kicker="TUE · DINNER"
              title="Bittman shrimp"
              tag="first time"
              accent
            />
            <PreviewCard
              style={{ position: 'absolute', top: 200, left: 10, transform: 'rotate(-1deg)' }}
              kicker="GROCERIES"
              title="27 items · 6 sections"
              tag="ready to send"
            />
            <PreviewCard
              style={{ position: 'absolute', top: 280, left: 70, transform: 'rotate(3deg)' }}
              kicker="KIOSK"
              title="Tonight at 6:30"
              tag=""
              dark
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}

const PreviewCard = ({ style, kicker, title, tag, accent, dark }) => (
  <div style={{
    width: 240, padding: 18, borderRadius: 14,
    background: dark ? T.n800 : T.elev,
    color: dark ? '#fff' : T.n800,
    border: `1px solid ${dark ? T.n800 : (accent ? T.a300 : T.n200)}`,
    boxShadow: T.shadowCard, ...style,
  }}>
    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', color: dark ? 'rgba(255,255,255,0.55)' : (accent ? T.a500 : T.n400) }}>
      {kicker}
    </div>
    <div style={{ height: 6 }} />
    <div style={{ fontFamily: FD, fontSize: 22, lineHeight: 1.15 }}>{title}</div>
    {tag && (
      <div style={{ marginTop: 8, fontFamily: FD, fontStyle: 'italic', fontSize: 13, color: dark ? 'rgba(255,255,255,0.55)' : T.n500 }}>· {tag}</div>
    )}
  </div>
);

// =============================================================================
//   SCREEN 2 · HOUSEHOLD
// =============================================================================
function O2_Household() {
  return (
    <Shell
      stepNumber={1}
      totalSteps={4}
      eyebrow="STEP 1 · HOUSEHOLD"
      footerLeft={<Cta>← Back</Cta>}
      footerRight={<Cta primary>Continue →</Cta>}
    >
      <div style={{ padding: '40px 80px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Display size={48}>Who's eating?</Display>
        <div style={{ height: 8 }} />
        <Italic color={T.n500} style={{ maxWidth: 580 }}>
          Just enough so the plan is sized right. You can edit any of this later.
        </Italic>

        <div style={{ height: 36 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 880 }}>
          {/* Adults */}
          <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 16, padding: 24 }}>
            <Kicker color={T.n500}>ADULTS</Kicker>
            <div style={{ height: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <PersonRow name="Iris (you)" detail="cooks most nights · 800g target" pinned />
              <PersonRow name="Scott" detail="partner · adds: cold cuts, sourdough" placeholder={false} />
              <AddRow label="+ Add adult" />
            </div>
          </div>

          {/* Kids */}
          <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 16, padding: 24 }}>
            <Kicker color={T.n500}>KIDS · OPTIONAL</Kicker>
            <div style={{ height: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <KidRow name="Kaleb" age="8" />
              <KidRow name="Mira" age="5" />
              <AddRow label="+ Add kid" />
            </div>
            <div style={{ marginTop: 14, fontSize: 11.5, color: T.n400, lineHeight: 1.6 }}>
              We use ages to suggest kid mods (parallel plates) and adjust portion sizes. No tracking on kids.
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ marginTop: 16, padding: '12px 18px', background: T.p50, border: `1px solid ${T.p100}`, borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start' }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: T.p500, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FD, fontStyle: 'italic', fontSize: 12, flexShrink: 0 }}>S</span>
          <Body size={13} color={T.p600}>
            Got it — a household of <strong style={{ fontWeight: 500 }}>2 adults + 2 kids</strong>. I'll plan parallel kid plates by default.
          </Body>
        </div>
      </div>
    </Shell>
  );
}

const PersonRow = ({ name, detail, pinned }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: T.bg, border: `1px solid ${T.n200}`, borderRadius: 10 }}>
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.p500, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FD, fontSize: 16 }}>
      {name[0]}
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: FD, fontSize: 18, color: T.n800 }}>{name}</div>
      <div style={{ fontSize: 12, color: T.n500, marginTop: 1 }}>{detail}</div>
    </div>
    {pinned && <span style={{ fontSize: 10, color: T.n400, fontWeight: 600, letterSpacing: '0.14em' }}>YOU</span>}
  </div>
);

const KidRow = ({ name, age }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 24px', gap: 10, alignItems: 'center', padding: '10px 14px', background: T.bg, border: `1px solid ${T.n200}`, borderRadius: 10 }}>
    <div style={{ fontFamily: FD, fontSize: 17, color: T.n800 }}>{name}</div>
    <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 14, color: T.n500 }}>age {age}</div>
    <span style={{ color: T.n300, cursor: 'pointer', textAlign: 'center' }}>×</span>
  </div>
);

const AddRow = ({ label }) => (
  <div style={{ padding: '11px 14px', border: `1px dashed ${T.n300}`, borderRadius: 10, fontSize: 13, color: T.p500, fontFamily: FD, fontStyle: 'italic', cursor: 'pointer' }}>
    {label}
  </div>
);

// =============================================================================
//   SCREEN 3 · GOAL
// =============================================================================
function O3_Goal() {
  const goals = [
    { label: '800g challenge', sub: 'fruit + veg by weight', selected: true, accent: 'a' },
    { label: 'Cook more',       sub: 'less takeout' },
    { label: 'Waste less',      sub: 'use what we have', selected: true, accent: 'a' },
    { label: 'Kid-friendly',    sub: 'parallel plates' },
    { label: 'Just dinners',    sub: 'breakfast/lunch on autopilot' },
    { label: 'Quick weeknights', sub: 'under 30 min' },
    { label: 'Eat seasonally',  sub: 'follow what\'s good' },
    { label: 'Stretch the budget', sub: 'pantry-forward' },
  ];
  return (
    <Shell
      stepNumber={2}
      totalSteps={4}
      eyebrow="STEP 2 · GOALS"
      footerLeft={<Cta>← Back</Cta>}
      footerRight={<Cta primary>Continue →</Cta>}
    >
      <div style={{ padding: '40px 80px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Display size={48}>What's the point this season?</Display>
        <div style={{ height: 8 }} />
        <Italic color={T.n500} style={{ maxWidth: 620 }}>
          Pick one or two. Symphony will favor plans that lean into them — and respect them when you push back.
        </Italic>

        <div style={{ height: 32 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, maxWidth: 980 }}>
          {goals.map(g => (
            <GoalCard key={g.label} label={g.label} sub={g.sub} selected={g.selected} accent={g.accent} />
          ))}
        </div>

        <div style={{ height: 24 }} />
        <div style={{ maxWidth: 600 }}>
          <Kicker color={T.n400}>OR DESCRIBE IT YOUR WAY</Kicker>
          <div style={{ height: 8 }} />
          <div style={{
            background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 12,
            padding: '14px 18px', fontFamily: FD, fontStyle: 'italic',
            fontSize: 18, color: T.n400, minHeight: 56,
          }}>
            cook 4 weeknights, eat more lentils, no fish for the kids…
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ padding: '14px 18px', background: T.a50, border: `1px solid ${T.a100}`, borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start' }}>
          <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.a500 }}>2 selected</span>
          <span style={{ color: T.n300 }}>·</span>
          <Body size={13} color={T.n600}>
            <strong style={{ fontWeight: 500 }}>800g challenge</strong> + <strong style={{ fontWeight: 500 }}>waste less</strong>
          </Body>
        </div>
      </div>
    </Shell>
  );
}

const GoalCard = ({ label, sub, selected, accent }) => (
  <div style={{
    padding: '18px 18px',
    background: selected ? (accent === 'a' ? T.a50 : T.p50) : T.elev,
    border: `1px solid ${selected ? (accent === 'a' ? T.a300 : T.p300) : T.n200}`,
    borderRadius: 14,
    cursor: 'pointer',
    position: 'relative',
  }}>
    {selected && (
      <div style={{
        position: 'absolute', top: 12, right: 12,
        width: 18, height: 18, borderRadius: '50%',
        background: accent === 'a' ? T.a500 : T.p500, color: '#fff',
        display: 'grid', placeItems: 'center', fontSize: 11,
      }}>✓</div>
    )}
    <div style={{ fontFamily: FD, fontSize: 22, color: T.n800 }}>{label}</div>
    <div style={{ height: 4 }} />
    <Body size={12.5} color={T.n500}>{sub}</Body>
  </div>
);

// =============================================================================
//   SCREEN 4 · RHYTHMS — the "feel understood" screen
// =============================================================================
function O4_Rhythms() {
  return (
    <Shell
      stepNumber={3}
      totalSteps={4}
      eyebrow="STEP 3 · YOUR RHYTHMS"
      footerLeft={<Cta>← Back</Cta>}
      footerRight={<Cta primary>Looks right →</Cta>}
    >
      <div style={{ padding: '40px 80px', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
        {/* LEFT — prompts */}
        <div>
          <Display size={44}>The rhythms you already keep.</Display>
          <div style={{ height: 8 }} />
          <Italic color={T.n500}>
            How do most weeks usually go? Skip anything that doesn't apply.
          </Italic>

          <div style={{ height: 28 }} />

          <PromptRow q="Breakfast usually looks like…" a="Yogurt with cherry tomatoes for me. Scott skips. Kids: HB eggs + sweet potato." />
          <PromptRow q="Lunch most weekdays…" a="Dal with raw veg + an apple. Scott has cold cuts. Kids do school lunch." />
          <PromptRow q="Anything you tend to snack on?" a="Apple + cherry tomatoes around 3pm." />
          <PromptRow q="Any nights you don't cook?" a="Friday — adults out. Sunday is batch-cook day." typing />
        </div>

        {/* RIGHT — Symphony's read */}
        <div style={{
          background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 16,
          padding: 24, display: 'flex', flexDirection: 'column',
          boxShadow: T.shadowCard,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.p500, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FD, fontStyle: 'italic', fontSize: 13 }}>S</span>
            <Kicker color={T.p500}>SYMPHONY'S READ</Kicker>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: T.n400, fontWeight: 600, letterSpacing: '0.12em' }}>5 HABITS · 1 OFF-NIGHT</span>
          </div>
          <Italic size={18} color={T.n500} style={{ marginBottom: 18 }}>
            Here's what I'm hearing. Edit any of these later.
          </Italic>

          <ReadRow when="MORNINGS" what="Yogurt + tomatoes for Iris" detail="kids: HB eggs + sweet potato" />
          <ReadRow when="WEEKDAY LUNCH" what="Dal + raw veg + apple for Iris" detail="contributes ~280g toward 800g" />
          <ReadRow when="3PM" what="Snack — apple, tomatoes" detail="" />
          <ReadRow when="FRI NIGHT" what="Off-night — adults out" detail="kids only / sitter" />
          <ReadRow when="SUN DAY" what="Sunday batch-cook" detail="dal, eggs, quinoa, roasted veg" />

          <div style={{ flex: 1 }} />

          <div style={{ marginTop: 16, padding: 14, background: T.p50, border: `1px solid ${T.p100}`, borderRadius: 10 }}>
            <Body size={13} color={T.p600}>
              These become <strong style={{ fontWeight: 500 }}>standing habits</strong>. They show up in every week's plan unless you say otherwise — and your 800g target gets a head-start from them.
            </Body>
          </div>
        </div>
      </div>
    </Shell>
  );
}

const PromptRow = ({ q, a, typing }) => (
  <div style={{ marginBottom: 16 }}>
    <Kicker color={T.n400} style={{ marginBottom: 6 }}>{q}</Kicker>
    <div style={{
      background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 10,
      padding: '10px 14px', fontSize: 14, color: T.n700, lineHeight: 1.5,
      minHeight: 38,
    }}>
      {a}
      {typing && <span style={{ display: 'inline-block', width: 1.5, height: 14, background: T.p500, marginLeft: 2, verticalAlign: 'middle' }} />}
    </div>
  </div>
);

const ReadRow = ({ when, what, detail }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, padding: '10px 0', borderBottom: `1px solid ${T.n100}` }}>
    <Kicker color={T.n400} style={{ paddingTop: 4 }}>{when}</Kicker>
    <div>
      <div style={{ fontFamily: FD, fontSize: 17, color: T.n800, lineHeight: 1.25 }}>{what}</div>
      {detail && <div style={{ fontSize: 12, color: T.n500, marginTop: 2 }}>{detail}</div>}
    </div>
  </div>
);

// =============================================================================
//   SCREEN 5 · BRIEF — pre-filled, editable
// =============================================================================
function O5_Brief() {
  const lines = [
    '800g challenge',
    'No stir fry this week',
    'Bittman shrimp — finally!',
    'Friday adults out',
  ];
  return (
    <Shell
      stepNumber={4}
      totalSteps={4}
      eyebrow="STEP 4 · THIS WEEK'S BRIEF"
      footerLeft={<Cta>← Back</Cta>}
      footerRight={(
        <Cta primary>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'inline-grid', placeItems: 'center', fontFamily: FD, fontStyle: 'italic', fontSize: 10 }}>S</span>
          Generate my plan →
        </Cta>
      )}
    >
      <div style={{ padding: '40px 80px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Display size={44}>Tell Symphony what this week looks like.</Display>
        <div style={{ height: 8 }} />
        <Italic color={T.n500} style={{ maxWidth: 700 }}>
          A few lines. What's special, what's off, what you want to try. Symphony reads it like a brief, not a form.
        </Italic>

        <div style={{ height: 28 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 32, flex: 1, minHeight: 0 }}>
          {/* LEFT — composer */}
          <div style={{
            background: T.paper, border: `1px solid ${T.n200}`, borderRadius: 14,
            boxShadow: T.shadowCard, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '14px 22px', borderBottom: `1px solid ${T.n100}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.n500 }}>
              <Kicker color={T.n500}>WEEK OF MAY 4 → MAY 9</Kicker>
              <span style={{ marginLeft: 'auto', color: T.p500, fontFamily: FD, fontStyle: 'italic', fontSize: 14 }}>4 lines · ready to generate</span>
            </div>
            <div style={{ flex: 1, padding: '24px 28px' }}>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', alignItems: 'baseline', padding: '8px 0' }}>
                  <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.n400 }}>{i + 1}</div>
                  <div style={{ fontFamily: FD, fontSize: 28, color: T.n800, lineHeight: 1.3 }}>{l}</div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', alignItems: 'baseline', padding: '8px 0' }}>
                <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.n400 }}>5</div>
                <div style={{ fontFamily: FD, fontSize: 28, color: T.n300, lineHeight: 1.3, fontStyle: 'italic' }}>
                  add a line…
                  <span style={{ display: 'inline-block', width: 2, height: 22, background: T.p500, marginLeft: 4, verticalAlign: 'middle' }} />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — suggestions + what comes next */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <Kicker color={T.n400}>SUGGESTIONS · BASED ON YOUR GOALS</Kicker>
              <div style={{ height: 10 }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Chip>+ try one new recipe</Chip>
                <Chip>+ use Sunday leftovers</Chip>
                <Chip>+ a simple Tuesday</Chip>
                <Chip>+ go pantry-forward</Chip>
                <Chip>+ veggie-heavy lunches</Chip>
              </div>
            </div>

            <div style={{
              padding: 20, background: T.elev, border: `1px solid ${T.n200}`,
              borderRadius: 14, boxShadow: T.shadowCard,
            }}>
              <Kicker color={T.p500}>WHAT YOU'LL GET</Kicker>
              <div style={{ height: 12 }} />
              <NextLine n="1" t="A 6-day plan" sub="with dinners, lunches, and your habits applied" />
              <NextLine n="2" t="Sunday batch list" sub="cook once, place into many meals" />
              <NextLine n="3" t="Grocery list" sub="organized by store section · ready to send" />
              <NextLine n="4" t="Daily gram totals" sub="toward your 800g target" />
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

const NextLine = ({ n, t, sub }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, padding: '6px 0' }}>
    <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.p500 }}>{n}</div>
    <div>
      <div style={{ fontFamily: FD, fontSize: 17, color: T.n800 }}>{t}</div>
      <div style={{ fontSize: 12, color: T.n500, marginTop: 1 }}>{sub}</div>
    </div>
  </div>
);

// =============================================================================
//   SCREEN 6 · NOW WHAT?
// =============================================================================
function O6_NowWhat() {
  return (
    <Shell
      kioskTopbar={true}
      footerLeft={null}
      footerRight={null}
    >
      <div style={{ flex: 1, padding: '52px 80px', display: 'flex', flexDirection: 'column' }}>

        {/* Hero — celebratory */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div>
            <Kicker color={T.p500}>YOUR FIRST PLAN IS READY</Kicker>
            <div style={{ height: 12 }} />
            <Display size={64}>
              That's it.<em style={{ color: T.p500, fontStyle: 'italic' }}> Now what?</em>
            </Display>
            <div style={{ height: 10 }} />
            <Italic size={22} color={T.n500} style={{ maxWidth: 640 }}>
              Three things you can do next. Or just close this and come back Sunday — Symphony will be ready when you are.
            </Italic>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 60, color: T.p500, lineHeight: 1 }}>6</div>
            <div style={{ fontSize: 11, color: T.n400, fontWeight: 600, letterSpacing: '0.18em' }}>DAYS · 27 ITEMS · 5 HABITS</div>
          </div>
        </div>

        <div style={{ height: 36 }} />

        {/* Three cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, flex: 1 }}>
          <NextCard
            kicker="① REVIEW"
            title="See your week"
            sub="Open the plan. Edit anything. Add a kid mod."
            cta="Open plan →"
            primary
          />
          <NextCard
            kicker="② SHOP"
            title="Send the grocery list"
            sub="27 items, organized by section. Lands in Apple Reminders."
            cta="Review & send →"
          />
          <NextCard
            kicker="③ COOK"
            title="Set up the wall"
            sub="Optional. The kitchen iPad shows tonight's dinner, big and confident."
            cta="Show me how →"
            faded
          />
        </div>

        <div style={{ height: 30 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px', background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 12 }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: T.p500, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FD, fontStyle: 'italic', fontSize: 16 }}>S</span>
          <Body size={14} color={T.n700}>
            Need to come back to this? Hit the <strong style={{ fontWeight: 500 }}>?</strong> in the topbar — quick tour, sample plan, or just a refresher of where things live.
          </Body>
        </div>

      </div>
    </Shell>
  );
}

const NextCard = ({ kicker, title, sub, cta, primary, faded }) => (
  <div style={{
    background: primary ? T.p500 : T.elev,
    border: `1px solid ${primary ? T.p500 : T.n200}`,
    borderRadius: 18, padding: 28,
    display: 'flex', flexDirection: 'column',
    color: primary ? '#fff' : T.n800,
    boxShadow: primary ? T.shadowPrimary : T.shadowCard,
    opacity: faded ? 0.78 : 1,
  }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.18em', color: primary ? 'rgba(255,255,255,0.7)' : T.p500 }}>
      {kicker}
    </div>
    <div style={{ height: 12 }} />
    <div style={{ fontFamily: FD, fontSize: 32, lineHeight: 1.1 }}>{title}</div>
    <div style={{ height: 8 }} />
    <div style={{ fontSize: 13.5, color: primary ? 'rgba(255,255,255,0.85)' : T.n500, lineHeight: 1.55 }}>
      {sub}
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ marginTop: 18 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 16px', borderRadius: 10,
        fontSize: 13, fontWeight: 500,
        background: primary ? '#fff' : 'transparent',
        color: primary ? T.p500 : T.p500,
        border: primary ? 'none' : `1px solid ${T.p300}`,
        cursor: 'pointer',
      }}>{cta}</span>
    </div>
  </div>
);

// =============================================================================
//   SUPPORT · A — SAMPLE PLAN LANDING
// =============================================================================
function O_Sample() {
  return (
    <Shell kioskTopbar={true}>
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        background: T.a500, color: '#fff',
        padding: '6px 14px', borderRadius: 999,
        fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
        boxShadow: '0 4px 12px hsl(18 55% 45% / 0.3)',
        zIndex: 10,
      }}>
        SAMPLE PLAN · NOT YOURS · WHITMAN FAMILY
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '52px 80px', position: 'relative' }}>
        <Display size={56}>Family Meal Plan — Week 3.</Display>
        <div style={{ height: 8 }} />
        <Italic size={22}>800g challenge · No stir fry this week · Bittman shrimp — finally!</Italic>

        <div style={{ height: 28 }} />

        {/* Mini week strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {[
            ['MON', 'Roasted cauli + quinoa', 920],
            ['TUE', 'Bittman shrimp', 880, true],
            ['WED', 'Sheet-pan salmon', 920],
            ['THU', 'Quinoa bowl', 940],
            ['FRI', 'Adults out', null],
            ['SAT', 'Morning only', null],
          ].map(([d, t, g, hl]) => (
            <div key={d} style={{
              background: hl ? T.a50 : T.elev, border: `1px solid ${hl ? T.a300 : T.n200}`,
              borderRadius: 12, padding: 16,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: hl ? T.a500 : T.n500 }}>{d}</div>
              <div style={{ fontFamily: FD, fontSize: 18, color: T.n800, marginTop: 6, lineHeight: 1.2 }}>{t}</div>
              {g && <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 14, color: T.p500, marginTop: 4 }}>~{g}g</div>}
            </div>
          ))}
        </div>

        <div style={{ height: 28 }} />

        {/* Two columns — habits / batch */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flex: 1 }}>
          <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 12, padding: 20 }}>
            <Kicker color={T.n500}>STANDING HABITS · 5</Kicker>
            <div style={{ height: 12 }} />
            <Body size={14} color={T.n700} style={{ lineHeight: 1.9 }}>
              Yogurt breakfast +80g · Dal lunch +60–80g · Raw veg lunch +150–200g · Snack 3–4pm · Light dinner nights
            </Body>
          </div>
          <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 12, padding: 20 }}>
            <Kicker color={T.p500}>SUNDAY BATCH</Kicker>
            <div style={{ height: 12 }} />
            <Body size={14} color={T.n700} style={{ lineHeight: 1.9 }}>
              Red lentil dal · Roast sweet potatoes (3) · Quinoa · Cut raw veg · HB eggs (12) · Move shrimp F→F
            </Body>
          </div>
        </div>

        {/* Bottom CTA bar */}
        <div style={{
          marginTop: 24, padding: '20px 24px',
          background: T.n800, color: '#fff', borderRadius: 14,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FD, fontSize: 22 }}>Like what you see?</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
              Make your own in about 3 minutes. We'll use your habits, not Iris's.
            </div>
          </div>
          <button style={{
            padding: '14px 28px', borderRadius: 12, border: 'none',
            background: T.p400, color: '#fff', fontWeight: 500, fontSize: 14, cursor: 'pointer',
          }}>Start your own plan →</button>
        </div>
      </div>
    </Shell>
  );
}

// =============================================================================
//   SUPPORT · B — EMPTY STATE OF /meals/plan
// =============================================================================
function O_Empty() {
  return (
    <Shell kioskTopbar={true}>
      <div style={{ flex: 1, padding: '60px 80px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 60, alignItems: 'center' }}>
        <div>
          <Kicker color={T.n400}>NO PLAN YET FOR THE WEEK OF MAY 11</Kicker>
          <div style={{ height: 14 }} />
          <Display size={56}>Ready when you are.</Display>
          <div style={{ height: 14 }} />
          <Italic size={22} color={T.n500} style={{ maxWidth: 540 }}>
            Symphony plans the week from a few lines of brief. Habits and goals are already saved — we just need to know what's special this week.
          </Italic>

          <div style={{ height: 28 }} />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Cta primary>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'inline-grid', placeItems: 'center', fontFamily: FD, fontStyle: 'italic', fontSize: 10 }}>S</span>
              Write this week's brief →
            </Cta>
            <span style={{ fontSize: 13, color: T.n500 }}>or</span>
            <span style={{ fontSize: 13, color: T.p500, textDecoration: 'underline', cursor: 'pointer' }}>Repeat last week's plan</span>
          </div>

          <div style={{ height: 36 }} />
          <div style={{ display: 'flex', gap: 18, fontSize: 12, color: T.n400 }}>
            <span>Last brief: <span style={{ color: T.n600 }}>Apr 27 · "800g challenge, no stir fry"</span></span>
            <span>·</span>
            <span>5 standing habits saved</span>
          </div>
        </div>

        {/* Right: skeletal preview of what'll appear */}
        <div style={{
          padding: 32, background: T.elev, border: `1px dashed ${T.n300}`,
          borderRadius: 18, position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: -10, left: 24, padding: '2px 10px',
            background: T.bg, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: T.n400,
          }}>WHAT'LL APPEAR HERE</div>

          <Skel w="60%" h={32} />
          <Skel w="80%" h={18} mt={10} />
          <Skel w="40%" h={14} mt={28} kicker />
          <Skel w="100%" h={56} mt={10} />
          <Skel w="100%" h={56} mt={8} />
          <Skel w="40%" h={14} mt={20} kicker />
          <Skel w="100%" h={42} mt={10} />
          <Skel w="100%" h={42} mt={8} />
        </div>
      </div>
    </Shell>
  );
}

const Skel = ({ w, h, mt, kicker }) => (
  <div style={{
    width: w, height: h, marginTop: mt || 0,
    background: kicker ? 'transparent' : T.n100,
    border: kicker ? `1px dashed ${T.n200}` : 'none',
    borderRadius: kicker ? 4 : 6,
  }} />
);

// =============================================================================
//   SUPPORT · C — HELP PANEL (re-entry surface)
// =============================================================================
function O_Help() {
  return (
    <div style={{
      width: 1280, height: 800, background: T.bg, fontFamily: FS,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Faded background — looks like the planner */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.35, padding: 60 }}>
        <div style={{ fontFamily: FD, fontSize: 56, color: T.n800 }}>Family Meal Plan — Week 3</div>
        <div style={{ marginTop: 30, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {[1,2,3,4,5,6].map(i => <div key={i} style={{ height: 90, background: T.elev, borderRadius: 10, border: `1px solid ${T.n200}` }} />)}
        </div>
      </div>

      {/* Topbar with ? highlighted */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 56,
        borderBottom: `1px solid ${T.n200}`, background: T.elev,
        display: 'flex', alignItems: 'center', padding: '0 32px', gap: 16,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: T.p500, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FD, fontStyle: 'italic', fontSize: 18 }}>S</div>
        <div style={{ fontFamily: FD, fontSize: 18 }}>Symphony</div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.p50, border: `2px solid ${T.p500}`, color: T.p500, display: 'grid', placeItems: 'center', fontFamily: FD, fontSize: 16 }}>?</div>
      </div>

      {/* Help panel — anchored to ? button */}
      <div style={{
        position: 'absolute', top: 72, right: 24, width: 360,
        background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14,
        boxShadow: '0 20px 50px -10px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.n100}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Kicker color={T.p500}>HELP & TOUR</Kicker>
          <span style={{ marginLeft: 'auto', fontSize: 16, color: T.n400, cursor: 'pointer' }}>×</span>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: T.n800, marginBottom: 4 }}>
            What is this page for?
          </div>
          <Body size={13} color={T.n500} style={{ marginBottom: 18 }}>
            The plan is one ritual: brief → habits → week → batch → groceries. Top to bottom, scroll to the next thing.
          </Body>

          <HelpRow icon="◐" title="Quick tour" sub="3 minutes · take a guided walk through the planner" />
          <HelpRow icon="◍" title="See a sample plan" sub="A complete example using the Whitman family" />
          <HelpRow icon="✦" title="Re-run setup" sub="Edit household, goals, or rhythms" />
          <HelpRow icon="?" title="Keyboard shortcuts" sub="G to generate, ⌘K for ask Symphony" />

          <div style={{ marginTop: 16, padding: 12, background: T.bg, borderRadius: 8, fontSize: 11.5, color: T.n400, lineHeight: 1.5 }}>
            Stuck? Type <strong style={{ fontWeight: 500, color: T.n600 }}>⌘K</strong> anywhere to ask Symphony — it knows your plan and can change it.
          </div>
        </div>
      </div>
    </div>
  );
}

const HelpRow = ({ icon, title, sub }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12,
    padding: '10px 0', borderBottom: `1px solid ${T.n100}`,
    cursor: 'pointer',
  }}>
    <div style={{ width: 28, height: 28, borderRadius: 8, background: T.p50, color: T.p500, display: 'grid', placeItems: 'center', fontFamily: FD, fontSize: 16 }}>{icon}</div>
    <div>
      <div style={{ fontFamily: FD, fontSize: 17, color: T.n800, lineHeight: 1.2 }}>{title}</div>
      <div style={{ fontSize: 12, color: T.n500, marginTop: 2 }}>{sub}</div>
    </div>
  </div>
);

// =============================================================================
//   RATIONALE — design rationale artboard
// =============================================================================
function O_Rationale() {
  const principles = [
    { p: 'First-run experience, not a tour', why: 'Tours teach UI; FREs deliver value. The user produces a real plan during onboarding, not a sample.' },
    { p: 'Optimize for "feel understood"', why: 'Screen 4 (Rhythms) is the heart. The right-side "Symphony\'s read" turning free text into structured habits is the moment the product earns trust.' },
    { p: 'Editorial, not enterprise', why: 'Italic serif, generous whitespace, conversational prose. Kicker labels are the only place we get crisp.' },
    { p: 'Three steps, not seven', why: '4 numbered steps in the topbar. Welcome and Now-What sit outside the count. Each step is one clear question.' },
    { p: 'Real defaults, not lorem', why: 'Iris\'s actual brief (800g, Bittman shrimp, no stir fry) is the example. Believable specificity > generic placeholders.' },
    { p: 'Sample plan path is first-class', why: 'Browsers shouldn\'t be forced through the funnel. Sample is one click away, watermarked, with a clear path back.' },
    { p: 'No celebration confetti', why: 'Screen 6 ends warmly but doesn\'t fireworks. The plan itself is the achievement; the "Now what?" framing respects that.' },
    { p: 'Re-entry is a panel, not a wizard', why: 'Once onboarded, no one wants to redo it. The "?" button is contextual — quick tour, sample, re-run setup, shortcuts.' },
  ];

  const skipped = [
    'Email verification screen (auth handles it)',
    'Subscription / pricing (assumed handled separately)',
    'Notification permission ask (we don\'t notify)',
    'Photo upload (avatar) — not core to the value',
    'Tutorial overlays on every UI element',
    'Sign-in vs. sign-up split',
    'Multiple kid intake flows (one entry surface, scales)',
    'Welcome video',
  ];

  return (
    <div style={{ width: 1280, height: 1100, background: T.bg, fontFamily: FS, padding: '52px 64px', color: T.n800 }}>
      <Kicker color={T.p500}>ONBOARDING · DESIGN RATIONALE</Kicker>
      <div style={{ height: 12 }} />
      <Display size={48}>What this flow is — and isn't.</Display>
      <div style={{ height: 8 }} />
      <Italic size={20} color={T.n500} style={{ maxWidth: 760 }}>
        The defaults here matter more than the visuals. Each is a deliberate trade.
      </Italic>

      <div style={{ height: 32 }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div>
          <Kicker color={T.n500}>PRINCIPLES IN PLAY</Kicker>
          <div style={{ height: 10 }} />
          {principles.map((x, i) => (
            <div key={i} style={{ padding: '14px 0', borderBottom: `1px solid ${T.n100}` }}>
              <div style={{ fontFamily: FD, fontSize: 20, color: T.n800, lineHeight: 1.3 }}>{x.p}</div>
              <Body size={13} color={T.n500} style={{ marginTop: 6 }}>{x.why}</Body>
            </div>
          ))}
        </div>

        <div>
          <Kicker color={T.a500}>DELIBERATELY SKIPPED</Kicker>
          <div style={{ height: 10 }} />
          <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14, padding: 24 }}>
            {skipped.map((s, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < skipped.length - 1 ? `1px dashed ${T.n100}` : 'none', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ color: T.a500, fontFamily: FD, fontStyle: 'italic', fontSize: 16 }}>×</span>
                <Body size={13.5} color={T.n700}>{s}</Body>
              </div>
            ))}
          </div>

          <div style={{ height: 24 }} />

          <Kicker color={T.p500}>SUCCESS METRICS</Kicker>
          <div style={{ height: 10 }} />
          <div style={{ background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14, padding: 20 }}>
            <Metric label="Completion rate" target=">75%" />
            <Metric label="Time to plan generated" target="< 4 min median" />
            <Metric label="Sample-plan → real plan conversion" target=">40%" />
            <Metric label="Standing habits captured" target="3+ per user" />
            <Metric label="Re-engagement Sunday" target=">60% of completers" />
          </div>

          <div style={{ height: 24 }} />

          <Kicker color={T.n500}>FLOW · TOTAL ARTBOARDS</Kicker>
          <div style={{ height: 10 }} />
          <Body size={13.5} color={T.n600} style={{ lineHeight: 1.7 }}>
            <strong style={{ fontWeight: 500 }}>6 onboarding screens</strong> (Welcome, Household, Goals, Rhythms, Brief, Now-what) · <strong style={{ fontWeight: 500 }}>3 supporting</strong> (Sample, Empty state, Help panel) · 1 rationale.
          </Body>
        </div>
      </div>
    </div>
  );
}

const Metric = ({ label, target }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '6px 0', borderBottom: `1px dashed ${T.n100}` }}>
    <div style={{ flex: 1, fontSize: 13.5, color: T.n700 }}>{label}</div>
    <div style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 16, color: T.p500 }}>{target}</div>
  </div>
);

// =============================================================================
//   EXPORTS
// =============================================================================
window.OB_Welcome   = O1_Welcome;
window.OB_Household = O2_Household;
window.OB_Goal      = O3_Goal;
window.OB_Rhythms   = O4_Rhythms;
window.OB_Brief     = O5_Brief;
window.OB_NowWhat   = O6_NowWhat;
window.OB_Sample    = O_Sample;
window.OB_Empty     = O_Empty;
window.OB_Help      = O_Help;
window.OB_Rationale = O_Rationale;
})();
