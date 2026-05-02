/* =============================================================================
   ASK SYMPHONY — chat rail for meal planning
   Built on top of Symphony's existing ChatPanel surface (right rail in AppShell).
   - 380px wide, sits next to the planner column (Symphony's three-panel layout)
   - Carries entityContext = the week being planned
   - AI replies include action buttons (Add to Plan / Save to Shelf / Add to Groceries)
     — same shape as Symphony's existing onAddTask / onSaveToVault
   - Demonstrates 3 entry points: planner header, empty Thursday, recipe shelf
   ============================================================================= */
(() => {

// --- Tokens (real Editorial Calm) -------------------------------------------
const T = {
  bg: 'hsl(45 25% 96%)', elev: 'hsl(48 35% 99%)',
  n100: 'hsl(43 25% 95%)', n200: 'hsl(40 18% 88%)',
  n300: 'hsl(38 14% 75%)', n400: 'hsl(36 10% 55%)',
  n500: 'hsl(34 8% 42%)',  n600: 'hsl(30 10% 32%)',
  n700: 'hsl(28 14% 22%)', n800: 'hsl(25 18% 15%)',
  p50:  'hsl(168 30% 96%)', p100: 'hsl(168 28% 90%)',
  p300: 'hsl(168 28% 62%)', p500: 'hsl(168 45% 30%)',
  p600: 'hsl(168 50% 24%)',
  a50:  'hsl(18 60% 97%)',  a100: 'hsl(18 55% 92%)',
  a500: 'hsl(18 55% 45%)',
  s100: 'hsl(145 18% 90%)', s400: 'hsl(145 22% 48%)', s500: 'hsl(145 28% 36%)',
  iris: 'hsl(168 35% 45%)', scott: 'hsl(145 22% 48%)',
  shadowCard: '0 0 0 1px hsl(38 20% 88% / 0.6), 0 2px 8px -2px hsl(25 20% 20% / 0.04)',
  shadowElev: '0 0 0 1px hsl(38 20% 88% / 0.4), 0 8px 24px -4px hsl(25 20% 20% / 0.08)',
  shadowPrimary: '0 8px 24px -6px hsl(168 45% 30% / 0.3)',
};
const FONT_DISP = "'Instrument Serif', Georgia, serif";
const FONT_SANS = "'Satoshi', system-ui, -apple-system, sans-serif";

// --- shared tiny components -------------------------------------------------
function Kicker({ children, color }) {
  return (
    <div style={{
      fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color: color || T.n400,
    }}>{children}</div>
  );
}
function Display({ size = 40, italic, color = T.n800, children }) {
  return (
    <h1 style={{
      fontFamily: FONT_DISP, fontStyle: italic ? 'italic' : 'normal',
      fontSize: size, lineHeight: 1.05, letterSpacing: '-0.01em',
      color, margin: 0, fontWeight: 400, textWrap: 'pretty',
    }}>{children}</h1>
  );
}
function PaperBg({ children, style }) {
  return (
    <div style={{
      position: 'relative', background: T.bg, fontFamily: FONT_SANS,
      color: T.n800, ...style,
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025,
        mixBlendMode: 'multiply',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />
      <div style={{ position: 'relative', height: '100%' }}>{children}</div>
    </div>
  );
}
function PersonInitial({ who, size = 18 }) {
  const color = who === 'iris' ? T.iris : T.scott;
  const initial = who === 'iris' ? 'I' : 'S';
  return (
    <span title={`${who === 'iris' ? 'Iris' : 'Scott'}`} style={{
      width: size, height: size, borderRadius: '50%', background: color,
      color: '#fff', fontSize: size * 0.5, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{initial}</span>
  );
}

// =============================================================================
//   THE CHAT RAIL ITSELF — what we'd add to ChatPanel for meal mode
// =============================================================================

// Conversation: Iris on Sunday morning, planning the week.
// AI knows: stocked groceries, kid history, the week's plan, what's leftover.
const CONVERSATION = [
  { who: 'system', kind: 'context',
    text: 'Planning the week of Apr 27 · 800g challenge',
    sub: '6 dinners scheduled · Thursday open · 80% stocked · Iris is editing' },

  { who: 'user',
    text: "We have salmon thawed and Kaleb's cranky. What's quick for tonight?" },

  { who: 'ai',
    text: "Skip the salmon tonight — Kaleb refuses fish on cranky days, and pushing it makes Wednesday harder. Two ideas that use what's stocked:",
    cards: [
      { kind: 'meal', title: 'Pasta al limone', mins: 22, kids: 'Both kids love this.',
        why: 'You have lemons, parmesan, pasta. Made it 6 days ago though — might feel repetitive.' },
      { kind: 'meal', title: 'Crispy gnocchi + sage', mins: 20, kids: 'Ella loves it. Kaleb eats it.',
        why: 'Pantry-friendly. Pairs with the broccoli that\'s about to turn.', recommended: true },
    ],
    footer: 'Move salmon to Friday — kids cooperate by then.' },

  { who: 'user', text: "Gnocchi tonight. What about Thursday?" },

  { who: 'ai',
    text: "Three angles, depending on the energy you want Thursday to have:",
    cards: [
      { kind: 'meal', title: 'Chili leftovers', mins: 5, kids: 'Both kids will eat.',
        why: "Sunday's batch covers Thursday too. Zero shopping, zero cooking.", tag: 'Easiest' },
      { kind: 'meal', title: 'Pad see ew', mins: 30, kids: 'Both kids loved last time.',
        why: 'Made 3 weeks ago. No fish or pasta this week — different texture.', tag: 'Variety', dragging: true },
      { kind: 'meal', title: 'Tofu lettuce wraps', mins: 25, kids: 'Never cooked — new for the family.',
        why: 'Light dinner before Friday\'s richer chicken. Worth a try.', tag: 'Adventurous' },
    ] },

  { who: 'user', text: "Pad see ew. Drag it onto Thursday." },

  { who: 'ai-acting',
    text: "Done. Added Pad see ew to Thursday. Two ingredients to pick up — rice noodles, Chinese broccoli — added to your grocery review.",
    actions: ['Undo', 'Open Thursday', 'Show 2 new groceries'] },
];

// Suggestion chips above the input (context-aware)
const QUICK_PROMPTS = [
  "What's quick for tonight?",
  "Use what's stocked",
  "Something Kaleb will eat",
  "Cover three days from one prep",
];

function MessageContext({ msg }) {
  return (
    <div style={{
      background: T.p50, border: `1px solid ${T.p100}`, borderRadius: 12,
      padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.p600} strokeWidth="2"
           style={{ marginTop: 2, flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
      </svg>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: T.p600, marginBottom: 2 }}>{msg.text}</div>
        <div style={{ fontSize: 11, color: T.n500, lineHeight: 1.4 }}>{msg.sub}</div>
      </div>
    </div>
  );
}

function MessageUser({ msg }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '82%', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{
          background: T.n800, color: T.elev, borderRadius: '16px 16px 4px 16px',
          padding: '10px 14px', fontSize: 13.5, lineHeight: 1.45,
        }}>
          {msg.text}
        </div>
        <PersonInitial who="iris" size={20} />
      </div>
    </div>
  );
}

function MealCard({ c }) {
  return (
    <div style={{
      background: T.elev,
      border: c.dragging ? `1.5px solid ${T.p500}` : `1px solid ${T.n200}`,
      borderRadius: 12, padding: '12px 14px',
      boxShadow: c.dragging ? T.shadowPrimary : T.shadowCard,
      cursor: 'grab', position: 'relative',
      transform: c.dragging ? 'rotate(-1.5deg) translateY(-2px)' : 'none',
      transition: 'all 200ms',
    }}>
      {c.tag && (
        <div style={{ position: 'absolute', top: -8, right: 12 }}>
          <Kicker color={c.recommended ? T.s500 : T.a500}>{c.tag}</Kicker>
        </div>
      )}
      {c.recommended && !c.tag && (
        <div style={{ position: 'absolute', top: -8, right: 12 }}>
          <Kicker color={T.s500}>Recommended</Kicker>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ color: T.n300, fontSize: 11 }}>⋮⋮</span>
        <div style={{
          fontFamily: FONT_DISP, fontSize: 19, lineHeight: 1.15,
          letterSpacing: '-0.01em', color: T.n800,
        }}>{c.title}</div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.n400, whiteSpace: 'nowrap' }}>{c.mins} min</span>
      </div>
      <div style={{ fontSize: 12, color: T.s500, fontFamily: FONT_DISP, fontStyle: 'italic', lineHeight: 1.4, marginBottom: 4 }}>
        {c.kids}
      </div>
      <div style={{ fontSize: 11.5, color: T.n500, lineHeight: 1.45 }}>
        {c.why}
      </div>
      {/* mini action row */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.n200}` }}>
        <button style={{
          flex: 1, background: T.p500, color: '#fff', border: 'none',
          padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500,
          fontFamily: FONT_SANS, cursor: 'pointer',
        }}>+ Add to plan</button>
        <button style={{
          background: 'transparent', color: T.n500, border: `1px solid ${T.n200}`,
          padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500,
          fontFamily: FONT_SANS, cursor: 'pointer',
        }}>Save to shelf</button>
      </div>
    </div>
  );
}

function MessageAI({ msg }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', background: T.p500,
        color: '#fff', fontFamily: FONT_DISP, fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontStyle: 'italic',
      }}>S</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, lineHeight: 1.5, color: T.n700,
          marginBottom: msg.cards ? 12 : (msg.footer ? 8 : 0),
        }}>{msg.text}</div>
        {msg.cards && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msg.cards.map((c, i) => <MealCard key={i} c={c} />)}
          </div>
        )}
        {msg.footer && (
          <div style={{
            fontSize: 12, fontStyle: 'italic', fontFamily: FONT_DISP, color: T.n500,
            marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${T.n200}`,
          }}>{msg.footer}</div>
        )}
      </div>
    </div>
  );
}

function MessageActing({ msg }) {
  return (
    <div style={{
      background: T.p50, border: `1px solid ${T.p100}`, borderRadius: 12,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: T.p600 }}>✓</span>
        <Kicker color={T.p600}>SYMPHONY ACTED</Kicker>
      </div>
      <div style={{ fontSize: 13, color: T.n700, lineHeight: 1.5, marginBottom: 10 }}>
        {msg.text}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {msg.actions.map(a => (
          <button key={a} style={{
            background: a === 'Undo' ? 'transparent' : T.elev,
            color: a === 'Undo' ? T.a500 : T.n600,
            border: `1px solid ${a === 'Undo' ? T.a100 : T.n200}`,
            padding: '5px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500,
            fontFamily: FONT_SANS, cursor: 'pointer',
          }}>{a}</button>
        ))}
      </div>
    </div>
  );
}

function ChatRail({ width = 380 }) {
  return (
    <div style={{
      width, height: '100%',
      background: T.elev, borderLeft: `1px solid ${T.n200}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Rail header — matches Symphony's panel chrome */}
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${T.n200}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', background: T.p500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontFamily: FONT_DISP, fontStyle: 'italic', fontSize: 16, flexShrink: 0,
          }}>S</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.n800 }}>Ask Symphony</div>
            <div style={{ fontSize: 11, color: T.n400 }}>Meal mode · this week</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button title="Sessions" style={{ background: 'transparent', border: 'none', color: T.n400, cursor: 'pointer', padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <button title="Close" style={{ background: 'transparent', border: 'none', color: T.n400, cursor: 'pointer', padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div style={{
        flex: 1, overflowY: 'hidden', padding: '18px',
        display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0,
      }}>
        {CONVERSATION.map((m, i) => {
          if (m.kind === 'context') return <MessageContext key={i} msg={m} />;
          if (m.who === 'user') return <MessageUser key={i} msg={m} />;
          if (m.who === 'ai-acting') return <MessageActing key={i} msg={m} />;
          return <MessageAI key={i} msg={m} />;
        })}
      </div>

      {/* Quick prompts + input */}
      <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${T.n200}`, background: T.bg }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {QUICK_PROMPTS.map(p => (
            <button key={p} style={{
              background: T.elev, color: T.n600, border: `1px solid ${T.n200}`,
              padding: '5px 10px', borderRadius: 100, fontSize: 11.5, fontWeight: 500,
              fontFamily: FONT_SANS, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>{p}</button>
          ))}
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 14,
          padding: '8px 8px 8px 14px',
        }}>
          <div style={{
            flex: 1, fontSize: 13, color: T.n400, fontFamily: FONT_SANS,
            paddingTop: 6, paddingBottom: 6, fontStyle: 'italic',
          }}>Ask anything about this week's meals…</div>
          <button title="Voice" style={{
            background: 'transparent', border: 'none', color: T.n400, cursor: 'pointer',
            padding: 6, borderRadius: 8,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
          <button style={{
            background: T.p500, color: '#fff', border: 'none',
            width: 32, height: 32, borderRadius: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
//   PLANNER COLUMN — abbreviated, with the rail-trigger affordances visible
// =============================================================================

const DAYS_RAIL = [
  { abbr: 'Mon', date: 'Apr 27', meal: 'Pasta al limone', kids: 'Both kids love this.', mins: 22, by: 'iris' },
  { abbr: 'Tue', date: 'Apr 28', meal: 'Sunday turkey chili', kids: 'Both kids will eat.', mins: 0, by: 'iris', leftover: true, today: true },
  { abbr: 'Wed', date: 'Apr 29', meal: 'Sheet-pan miso salmon', kids: 'Ella loves. Kaleb negotiates.', mins: 25, by: 'iris' },
  { abbr: 'Thu', date: 'Apr 30', empty: true, dropping: true },
  { abbr: 'Fri', date: 'May 1',  meal: 'Marry-me chicken w/ orzo', kids: 'Both kids love this.', mins: 40, by: 'iris' },
  { abbr: 'Sat', date: 'May 2',  meal: 'Pizza night (takeout)', kids: 'Both kids love this.', mins: 0, by: 'scott' },
  { abbr: 'Sun', date: 'May 3',  meal: 'Crispy gnocchi + sage', kids: 'Ella loves. Kaleb eats.', mins: 20, by: 'iris' },
];

function DayCard({ d }) {
  if (d.empty) {
    return (
      <article style={{
        background: d.dropping ? T.p50 : 'transparent',
        border: d.dropping ? `2px solid ${T.p500}` : `1.5px dashed ${T.n300}`,
        borderRadius: 14, padding: '20px 22px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <Kicker color={d.dropping ? T.p600 : T.n400}>{d.abbr.toUpperCase()} · {d.date.toUpperCase()}</Kicker>
          <div style={{ flex: 1 }} />
          {d.dropping ? (
            <span style={{ fontSize: 11, color: T.p600, fontWeight: 500, letterSpacing: '0.04em' }}>
              ↓ DROP HERE
            </span>
          ) : (
            <span style={{ fontSize: 11, color: T.n400, fontFamily: FONT_DISP, fontStyle: 'italic', fontSize: 14 }}>
              ask Symphony →
            </span>
          )}
        </div>
        <div style={{ height: 4 }} />
        <div style={{
          fontFamily: FONT_DISP, fontStyle: 'italic', fontSize: 22, lineHeight: 1.1,
          color: d.dropping ? T.p600 : T.n400,
        }}>
          {d.dropping ? 'Pad see ew (incoming…)' : 'What for Thursday?'}
        </div>
      </article>
    );
  }
  return (
    <article style={{
      background: d.today ? T.p50 : T.elev,
      border: `1px solid ${d.today ? T.p100 : T.n200}`,
      borderLeft: d.today ? `3px solid ${T.p500}` : `1px solid ${T.n200}`,
      borderRadius: 14, padding: '16px 22px', boxShadow: T.shadowCard,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <Kicker color={d.today ? T.p600 : T.n400}>
          {d.abbr.toUpperCase()} · {d.date.toUpperCase()}{d.today && ' · TODAY'}
        </Kicker>
        <div style={{ flex: 1 }} />
        {d.mins > 0 && <span style={{ fontSize: 12, color: T.n400 }}>{d.mins} min</span>}
        <PersonInitial who={d.by} />
      </div>
      <div style={{ height: 4 }} />
      <h3 style={{
        fontFamily: FONT_DISP, fontSize: 22, lineHeight: 1.15, letterSpacing: '-0.01em',
        margin: 0, color: T.n800, fontWeight: 400,
      }}>{d.meal}</h3>
      <div style={{ fontSize: 13, color: T.s500, fontFamily: FONT_DISP, fontStyle: 'italic', marginTop: 4 }}>
        {d.kids}{d.leftover && ' From Sunday\'s prep.'}
      </div>
    </article>
  );
}

function PlannerColumn() {
  return (
    <div style={{ flex: 1, padding: '28px 36px', minWidth: 0, overflow: 'hidden' }}>
      {/* topbar (compact) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 18, borderBottom: `1px solid ${T.n200}`, marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: T.p500,
            color: '#fff', fontFamily: FONT_DISP, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>S</div>
          <div style={{ fontFamily: FONT_DISP, fontSize: 22, color: T.n800, letterSpacing: '-0.01em' }}>Symphony</div>
          <div style={{ width: 1, height: 16, background: T.n200 }} />
          <Kicker>PLAN · MEALS</Kicker>
        </div>
      </div>

      {/* page header — note the persistent "Ask Symphony" pill */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 22 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Kicker color={T.p500}>WEEK OF APR 27 · 800g CHALLENGE</Kicker>
          <div style={{ height: 6 }} />
          <Display size={36}>Plan the week<em style={{ color: T.p500 }}>.</em></Display>
        </div>
        <button style={{
          background: T.p500, color: '#fff', border: 'none',
          padding: '10px 18px', borderRadius: 100, fontFamily: FONT_SANS,
          fontWeight: 500, fontSize: 13, boxShadow: T.shadowPrimary, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          ringWidth: 3,
          outline: `3px solid ${T.p100}`, outlineOffset: 2,
        }}>
          <span style={{ fontFamily: FONT_DISP, fontStyle: 'italic', fontSize: 16, lineHeight: 1 }}>S</span>
          Ask Symphony
        </button>
      </div>

      {/* Days */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DAYS_RAIL.map(d => <DayCard key={d.abbr} d={d} />)}
      </div>
    </div>
  );
}

// =============================================================================
//   FULL ARTBOARD — planner + rail side-by-side, with annotation strip
// =============================================================================
function AskSymphonyArtboard() {
  return (
    <PaperBg style={{ width: 1600, minHeight: 1340, display: 'flex', flexDirection: 'column' }}>
      {/* Annotation strip — explains what we're showing */}
      <div style={{
        padding: '24px 36px 18px', borderBottom: `1px solid ${T.n200}`,
        background: T.n100, display: 'flex', gap: 36, alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1, maxWidth: 720 }}>
          <Kicker color={T.a500}>v2 · CHAT RAIL · A FOURTH ARTBOARD</Kicker>
          <div style={{ height: 6 }} />
          <Display size={32}>
            Freeform chat at every phase, not just empty slots.
          </Display>
          <div style={{ fontSize: 14, color: T.n500, marginTop: 10, lineHeight: 1.55, fontFamily: FONT_DISP, fontStyle: 'italic', fontSize: 17 }}>
            Symphony already has a ChatPanel — same right rail, sessions, modes, entity context.
            Meal-mode is just a new context. The rail knows what's stocked, who's home, what
            the kids will eat, and what was leftover from Sunday's prep.
          </div>
        </div>
        <div style={{
          background: T.elev, border: `1px solid ${T.n200}`, borderRadius: 12,
          padding: '12px 16px', maxWidth: 380, flexShrink: 0,
        }}>
          <Kicker color={T.p600}>THREE ENTRY POINTS</Kicker>
          <div style={{ height: 6 }} />
          <ol style={{
            margin: 0, paddingLeft: 18, fontSize: 12.5, color: T.n600, lineHeight: 1.6,
          }}>
            <li><b>Header pill</b> — "Ask Symphony" persistent, opens rail in meal mode</li>
            <li><b>Empty slots</b> — "ask Symphony →" in any unscheduled day</li>
            <li><b>Memory Shelf</b> — long-press a recipe → "make me a variant"</li>
          </ol>
        </div>
      </div>

      {/* The actual surface */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <PlannerColumn />
        <ChatRail />
      </div>

      {/* Footer rationale */}
      <div style={{
        padding: '20px 36px', borderTop: `1px solid ${T.n200}`,
        background: T.bg, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24,
      }}>
        {[
          { k: 'CONTEXT IS FREE', v: 'The rail sees the week, the pantry, the kids, the leftovers. Iris doesn\'t re-state anything.' },
          { k: 'CARDS, NOT PARAGRAPHS', v: 'AI replies with draggable meal cards. The chat is a way to make a card, not a wall of text to skim.' },
          { k: 'SUGGEST → ACT', v: 'Symphony can act with confirmation: "Done. Added Pad see ew. Two new groceries." Always undoable.' },
          { k: 'SAME RAIL, EVERYWHERE', v: 'Reuses Symphony\'s existing ChatPanel. Sessions persist. Voice on kiosk works same.' },
        ].map(b => (
          <div key={b.k}>
            <Kicker color={T.p600}>{b.k}</Kicker>
            <div style={{ height: 4 }} />
            <div style={{ fontSize: 12, color: T.n600, lineHeight: 1.5 }}>{b.v}</div>
          </div>
        ))}
      </div>
    </PaperBg>
  );
}

window.PlannerV2_AskSymphony = AskSymphonyArtboard;

})();
