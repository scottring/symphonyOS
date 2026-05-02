/* Empty / loading / error states + flow diagram + component breakdown + kid-acceptance argument */

function Skeleton({ w, h, r = 6, style = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, #EFE8DE 0%, #F7F1E8 50%, #EFE8DE 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
      ...style,
    }} />
  );
}

function StatesCard({ title, kicker, children, dark = false }) {
  return (
    <div style={{
      background: dark ? 'linear-gradient(145deg, hsl(25 22% 11%) 0%, hsl(20 18% 7%) 100%)' : '#FFFFFF',
      border: dark ? 'none' : '1px solid #E8E0D8',
      borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
      minHeight: 280,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: dark ? 'rgba(255,255,255,0.5)' : '#D97706',
      }}>{kicker}</div>
      <div style={{
        fontFamily: 'Crimson Pro, serif', fontSize: 18, fontWeight: 500,
        color: dark ? '#fff' : '#2C2520', marginBottom: 6,
      }}>{title}</div>
      <div style={{ flex: 1, display: 'flex' }}>{children}</div>
    </div>
  );
}

function StatesAndDocs() {
  return (
    <div style={{
      width: 1440, minHeight: 1100, background: '#FAF7F2', color: '#2C2520',
      fontFamily: 'DM Sans, system-ui, sans-serif', padding: '36px 44px',
      display: 'flex', flexDirection: 'column', gap: 32,
    }}>
      <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>

      {/* Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>States, flow & rationale</div>
        <h1 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 40, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0 }}>
          The unglamorous half<span style={{ fontStyle: 'italic', color: '#D97706' }}>.</span>
        </h1>
        <p style={{ color: '#6B5E54', fontSize: 14, marginTop: 6, maxWidth: 640 }}>
          Empty, loading, and error states for each surface — plus the sunday-morning flow and the design judgment call on kid-acceptance prominence.
        </p>
      </div>

      {/* States grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {/* Library — empty */}
        <StatesCard kicker="Recipe library · empty" title="No recipes saved yet">
          <div style={{ flex: 1, border: '1.5px dashed #D9CFC2', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36 }}>📖</div>
            <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 17, color: '#2C2520' }}>Paste an NYT Cooking URL to start.</div>
            <div style={{ fontSize: 12, color: '#9B8E84', maxWidth: 260 }}>We'll grab the title, ingredients, and image. You stay in flow.</div>
            <button style={{ marginTop: 6, padding: '9px 18px', borderRadius: 100, border: 'none', background: '#2C2520', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Paste URL</button>
          </div>
        </StatesCard>

        {/* Planner — empty */}
        <StatesCard kicker="Weekly planner · empty" title="No plan yet for this week">
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({length: 7}).map((_, i) => (
              <div key={i} style={{ border: '1.5px dashed #D9CFC2', borderRadius: 6, minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#D9CFC2' }}>+</div>
            ))}
          </div>
        </StatesCard>

        {/* Library — loading */}
        <StatesCard kicker="Library · loading skeleton" title="Fetching your recipes…">
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ background: '#FFF', border: '1px solid #E8E0D8', borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton w="100%" h={48} r={6} />
                <Skeleton w="80%" h={10} />
                <Skeleton w="50%" h={8} />
              </div>
            ))}
          </div>
        </StatesCard>

        {/* Groceries — empty */}
        <StatesCard kicker="Groceries review · empty" title="Plan a week first.">
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center', textAlign: 'center', padding: 18 }}>
            <div style={{ fontSize: 36 }}>🛒</div>
            <div style={{ fontSize: 12, color: '#9B8E84' }}>The grocery list is the output of the plan. Fill at least one slot to begin.</div>
          </div>
        </StatesCard>

        {/* Recipe import — error */}
        <StatesCard kicker="Recipe import · error" title="Couldn't read that URL">
          <div style={{ flex: 1, background: '#FEF3C7', border: '1px solid #F4D58A', borderRadius: 10, padding: 14, display: 'flex', gap: 10 }}>
            <div style={{ fontSize: 22 }}>⚠️</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 4 }}>NYT paywall blocked the page.</div>
              <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.5, marginBottom: 8 }}>Open the recipe in your browser, copy the title and ingredients, then add it manually. We'll keep the URL.</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#92400E', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add manually</button>
                <button style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #92400E', background: 'transparent', color: '#92400E', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
              </div>
            </div>
          </div>
        </StatesCard>

        {/* Kiosk — error */}
        <StatesCard kicker="Kiosk · sync error" title="Reminders couldn't reach Apple" dark>
          <div style={{ flex: 1, background: 'rgba(242,110,99,0.12)', border: '2px solid rgba(242,110,99,0.3)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 32 }}>⚠️</div>
            <div>
              <div style={{ color: '#F26E63', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 4 }}>Sync paused</div>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>Will retry in 2 min · 3 items queued</div>
            </div>
          </div>
        </StatesCard>
      </div>

      {/* Flow diagram */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E0D8', borderRadius: 16, padding: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Iris's Sunday-morning flow</div>
        <h2 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 28, fontWeight: 400, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          From <em style={{ color: '#D97706' }}>blank week</em> to <em style={{ color: '#D97706' }}>Iris's Reminders</em> in ~12 minutes.
        </h2>
        <p style={{ fontSize: 13, color: '#6B5E54', margin: '0 0 22px' }}>
          Target: cut the existing 60-min Sunday session by 75%. Happy path is 7 actions; degraded path adds 1 retry on any URL paste.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, alignItems: 'stretch' }}>
          {[
            { n: 1, t: 'Open Plan tab', d: 'On laptop, at coffee. Defaults to current week.', click: '1 click', time: '~5s' },
            { n: 2, t: 'Pick mode', d: '"800g challenge" this week. Library re-sorts.', click: '1 click', time: '~5s' },
            { n: 3, t: 'Schedule prep', d: 'Drag turkey chili → Sunday Prep. Auto-suggests Tue dinner + Iris W/Th lunch.', click: '1 drag, 2 confirms', time: '~30s' },
            { n: 4, t: 'Fill dinners', d: '5 slots. Kid pills visible on every card; mark Wed kid-alt in 1 tap.', click: '5 drags', time: '~5m' },
            { n: 5, t: 'Add 1 new recipe', d: 'Paste NYT URL. Auto-import. Tag, save.', click: '1 paste, 2 taps', time: '~2m' },
            { n: 6, t: 'Review groceries', d: '23 items, 5 categories. Edit miso quantity.', click: '1 click, 2 edits', time: '~3m' },
            { n: 7, t: 'Send', d: 'Tap "Send 23 items". Toast confirms <60s sync.', click: '1 click', time: '~10s' },
          ].map((s, i) => (
            <div key={s.n} style={{ position: 'relative', padding: '0 10px', borderRight: i === 6 ? 'none' : '1px solid rgba(232,224,216,0.7)' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: i === 6 ? '#D97706' : '#FEF3C7',
                color: i === 6 ? '#fff' : '#D97706', fontSize: 13, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
              }}>{s.n}</div>
              <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 16, fontWeight: 500, lineHeight: 1.2, marginBottom: 4 }}>{s.t}</div>
              <div style={{ fontSize: 11, color: '#6B5E54', lineHeight: 1.5, marginBottom: 8 }}>{s.d}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.click}</div>
              <div style={{ fontSize: 10, color: '#BEB3A9', fontVariantNumeric: 'tabular-nums' }}>{s.time}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, padding: '12px 16px', background: '#F5EFE7', borderRadius: 10, fontSize: 13, color: '#6B5E54', fontStyle: 'italic', fontFamily: 'Crimson Pro, serif' }}>
          Total target: <strong style={{ color: '#2C2520' }}>~12 minutes</strong> end-to-end · saves Iris ~48 minutes per week × 52 weeks = <strong style={{ color: '#2C2520' }}>~42 hours/year</strong>. Hits the brief's 52-hr promise once recipe library reaches steady state (~30 saved recipes).
        </div>
      </div>

      {/* Two-up: components + kid-acceptance argument */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Components */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E0D8', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Reusable components</div>
          <h3 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 22, fontWeight: 400, margin: '0 0 14px' }}>What emerges from the mocks.</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[
              { n: 'RecipeCard', d: 'Library + drawer + detail header.', visual: 'card' },
              { n: 'KidAcceptancePill', d: 'Name + dot. 3 densities.', visual: 'pills' },
              { n: 'PlanSlot', d: 'Filled / empty. 4 variants by accent.', visual: 'slots' },
              { n: 'IngredientLine', d: 'qty · name · source · menu.', visual: 'line' },
              { n: 'KioskMealCard', d: 'Saturated wall language.', visual: 'kiosk' },
              { n: 'EmptyPrompt', d: 'Emoji + uppercase + 1 CTA.', visual: 'empty' },
            ].map(c => (
              <div key={c.n} style={{ background: '#FAF7F2', border: '1px solid #E8E0D8', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.visual === 'card' && <><div style={{ width: 32, height: 28, borderRadius: 4, background: 'linear-gradient(135deg, #F9C35C, #F26E63)' }} /><div style={{ flex: 1 }}><div style={{ height: 6, background: '#2C2520', borderRadius: 2, marginBottom: 3, width: '70%' }} /><div style={{ height: 4, background: '#D9CFC2', borderRadius: 2, width: '50%' }} /></div></>}
                  {c.visual === 'pills' && <><span style={{ fontSize: 9, fontWeight: 600, padding: '3px 7px 3px 5px', borderRadius: 100, background: '#fff', border: '1px solid #E8E0D8', display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0F8A4A' }} />Ella</span><span style={{ fontSize: 9, fontWeight: 600, padding: '3px 7px 3px 5px', borderRadius: 100, background: '#fff', border: '1px solid #E8E0D8', display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#B5483F' }} />Kaleb</span></>}
                  {c.visual === 'slots' && <><div style={{ width: 4, height: 28, background: '#D97706', borderRadius: 2 }} /><div style={{ width: 4, height: 28, background: '#7BA8E0', borderRadius: 2 }} /><div style={{ width: 4, height: 28, background: '#6DC4A7', borderRadius: 2 }} /><div style={{ width: 4, height: 28, background: '#7C3AED', borderRadius: 2 }} /></>}
                  {c.visual === 'line' && <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, border: '1.5px solid #D97706', borderRadius: 3 }} /><div style={{ width: 24, height: 5, background: '#2C2520', borderRadius: 2 }} /><div style={{ flex: 1, height: 5, background: '#D9CFC2', borderRadius: 2 }} /></div>}
                  {c.visual === 'kiosk' && <div style={{ width: '100%', height: 30, background: 'linear-gradient(135deg, #6DC4A7, #4A9F84)', borderRadius: 5, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4 }}><span style={{ fontSize: 14 }}>🐟</span><div style={{ height: 4, background: '#fff', borderRadius: 2, flex: 1 }} /></div>}
                  {c.visual === 'empty' && <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 14 }}>📖</span><div style={{ width: 30, height: 3, background: '#D9CFC2', borderRadius: 2 }} /></div>}
                </div>
                <div>
                  <code style={{ fontSize: 11, fontWeight: 700, color: '#2C2520', fontFamily: 'ui-monospace, monospace' }}>{c.n}</code>
                  <div style={{ fontSize: 11, color: '#6B5E54', lineHeight: 1.45, marginTop: 2 }}>{c.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(232,224,216,0.7)', fontSize: 11, color: '#9B8E84', fontStyle: 'italic', fontFamily: 'Crimson Pro, serif' }}>
            Plus: ParameterDropdown, RecipeDrawer, CategoryGroup, SyncToast, AuthorDot, PresenceAvatar.
          </div>
        </div>

        {/* Kid-acceptance judgment */}
        <div style={{ background: 'linear-gradient(135deg, #FEF3C7 0%, #FAF7F2 60%)', border: '1px solid #F4D58A', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Design judgment</div>
          <h3 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 22, fontWeight: 400, margin: '0 0 12px', letterSpacing: '-0.01em' }}>
            Kid-acceptance is a <em style={{ color: '#D97706' }}>compact pill on every card</em> — not a filter, not a banner.
          </h3>
          <p style={{ fontSize: 13, color: '#6B5E54', lineHeight: 1.65, margin: '0 0 14px' }}>
            Three options were on the table. I rejected two:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 10, padding: 14, opacity: 0.7 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>✗ Big visual indicator</div>
              <div style={{ fontSize: 12, color: '#6B5E54' }}>A 64×64 portrait of each kid stamped with loves/eats/rejects. Fills cards visually. Implies kid preference is the dominant factor — but it isn't. Iris also picks for nutrition, prep time, and what she feels like cooking. Visual dominance miscommunicates priority.</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 10, padding: 14, opacity: 0.7 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>✗ Separate filter mode</div>
              <div style={{ fontSize: 12, color: '#6B5E54' }}>A "Kid mode" toggle that hides everything Ella or Kaleb rejects. Loses signal — Iris often deliberately cooks something the kids reject and plans an alternate. Filtering treats kid preference as a hard constraint; it's actually a soft input.</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1.5px solid #D97706' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>✓ Compact pills, always visible</div>
              <div style={{ fontSize: 12, color: '#2C2520', lineHeight: 1.55 }}>
                Two pills per card — name + colored dot (green/amber/red). Glanceable, never the loudest thing. They live alongside time and tags so Iris weighs all signals at once. On the planner, dots-only saves space. On the kiosk, the same pill scales up to a touch-target size for Scott to see while cooking. <strong>One component, three densities, one consistent meaning.</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                {[
                  { t: 'Clear at a glance', d: 'Color + name in <80ms.' },
                  { t: 'Honest about preferences', d: 'Three states, no hiding.' },
                  { t: 'Encourages variety', d: 'Soft signal, not a filter.' },
                ].map(b => (
                  <div key={b.t} style={{ background: '#FEF3C7', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', marginBottom: 2, letterSpacing: '0.04em' }}>✓ {b.t}</div>
                    <div style={{ fontSize: 10, color: '#6B5E54', lineHeight: 1.4 }}>{b.d}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #F4D58A', fontSize: 11, color: '#6B5E54', fontStyle: 'italic', fontFamily: 'Crimson Pro, serif' }}>
                Side benefit: kid-acceptance updates after each meal become a one-tap interaction on the kiosk. The data accumulates passively — exactly the "memory of what worked" the brief calls out as missing today.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.StatesAndDocs = StatesAndDocs;
