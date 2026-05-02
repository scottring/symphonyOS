/* Kiosk meal-plan view — wall language, dark, glanceable from across kitchen */
function WallStripe({ accent, children }) {
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: accent, borderRadius: '6px 0 0 6px',
    }} />
  );
}

function KidPill({ name, status, accent }) {
  const map = { loves: '✓', eats: '~', rejects: '✗' };
  const colors = { loves: '#0F8A4A', eats: '#F9C35C', rejects: '#F26E63' };
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px 6px 8px', borderRadius: 100,
      background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.15)',
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', background: colors[status],
        color: '#1e293b', fontSize: 12, fontWeight: 900,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{map[status]}</span>
      <span style={{ color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{name}</span>
    </div>
  );
}

function KioskMealPlan() {
  return (
    <div style={{
      width: 1280, height: 800,
      background: 'linear-gradient(145deg, hsl(25 22% 11%) 0%, hsl(20 18% 7%) 100%)',
      fontFamily: 'DM Sans, system-ui, sans-serif',
      padding: '40px 48px', display: 'flex', flexDirection: 'column', gap: 28,
      overflow: 'hidden',
    }}>
      {/* Top bar — mimics existing wall layout context */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ color: '#fff', fontFamily: 'Crimson Pro, serif', fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em' }}>
          5:14<span style={{ fontSize: 32, color: 'rgba(255,255,255,0.5)' }}>pm</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.25em' }}>Wednesday</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginTop: 2 }}>April 29 · 64°F · Sunny</div>
        </div>
      </div>

      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, minHeight: 0,
      }}>
        {/* MEALS column — replaces or sits beside LOOK AHEAD */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em' }}>
            Meals
          </div>

          {/* TONIGHT — hero card */}
          <div style={{
            background: 'linear-gradient(135deg, #6DC4A7 0%, #4A9F84 100%)',
            borderRadius: 24, padding: '24px 28px',
            boxShadow: '0 12px 40px rgba(109,196,167,0.25)',
            display: 'flex', gap: 20, alignItems: 'center',
          }}>
            <div style={{
              width: 110, height: 110, borderRadius: 22, background: 'rgba(255,255,255,0.2)',
              fontSize: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>🐟</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', marginBottom: 4 }}>
                Tonight
              </div>
              <div style={{ color: '#fff', fontSize: 36, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.01em', marginBottom: 10, textWrap: 'balance' }}>
                Sheet-pan miso salmon
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: '#fff', fontSize: 14, fontWeight: 700, padding: '4px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 100 }}>
                  ◷ 25 min
                </span>
                <KidPill name="Ella" status="eats" />
                <KidPill name="Kaleb" status="rejects" />
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontStyle: 'italic', fontFamily: 'Crimson Pro, serif' }}>tap for recipe →</span>
              </div>
            </div>
          </div>

          {/* KID ALTERNATE callout — tucked under tonight */}
          <div style={{
            position: 'relative', marginLeft: 32,
            background: 'rgba(123,168,224,0.12)', border: '2px solid rgba(123,168,224,0.3)',
            borderRadius: 16, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              position: 'absolute', left: -18, top: -18, width: 18, height: 30,
              borderLeft: '2px dashed rgba(123,168,224,0.4)',
              borderBottom: '2px dashed rgba(123,168,224,0.4)',
              borderRadius: '0 0 0 8px',
            }} />
            <div style={{ fontSize: 32 }}>🍝</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#7BA8E0', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 2 }}>
                Kaleb's alternate
              </div>
              <div style={{ color: '#fff', fontSize: 19, fontWeight: 700 }}>Plain pasta + butter · 8 min</div>
            </div>
          </div>

          {/* TOMORROW + PREP row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1, minHeight: 0 }}>
            <div style={{
              background: 'rgba(249,195,92,0.15)', border: '2px solid rgba(249,195,92,0.3)',
              borderRadius: 18, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ color: '#F9C35C', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.22em' }}>
                Tomorrow
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                <div style={{ fontSize: 44 }}>🍗</div>
                <div>
                  <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, lineHeight: 1.15, textWrap: 'balance' }}>
                    Marry-me chicken
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 600, marginTop: 4 }}>40 min · kids love</div>
                </div>
              </div>
            </div>

            <div style={{
              background: 'rgba(124,58,237,0.18)', border: '2px solid rgba(176,132,255,0.35)',
              borderRadius: 18, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ color: '#C4A8FF', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.22em' }}>
                This week's prep
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                <div style={{ fontSize: 44 }}>🍲</div>
                <div>
                  <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, lineHeight: 1.15, textWrap: 'balance' }}>
                    Turkey chili ×2
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 600, marginTop: 4 }}>Sun · covers Tue + Iris W/Th</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — existing wall idiom: groceries, look-ahead style */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em' }}>
            Groceries
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 18, padding: '18px 20px', flex: 1,
            display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>23 items</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em' }}>Synced 2h ago</div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: 'Crimson Pro, serif', fontStyle: 'italic', lineHeight: 1.5 }}>
              On Iris's phone in Reminders. Shows here as it's checked off.
            </div>
            {[
              { label: 'Produce', n: 6, c: 2 },
              { label: 'Dairy', n: 3, c: 0 },
              { label: 'Pantry', n: 5, c: 0 },
              { label: 'Protein', n: 3, c: 1 },
              { label: 'Frozen', n: 1, c: 0 },
              { label: 'Custom', n: 5, c: 1 },
            ].map(g => (
              <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{g.label}</div>
                <div style={{
                  flex: 2, height: 8, borderRadius: 100, background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
                }}>
                  <div style={{ width: `${(g.c/g.n)*100}%`, height: '100%', background: '#6DC4A7', borderRadius: 100 }} />
                </div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>
                  {g.c}/{g.n}
                </div>
              </div>
            ))}
          </div>

          {/* LOOK AHEAD-style mini meals strip */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em' }}>
              Rest of the week
            </div>
            {[
              { d: 'FRI', meal: 'Marry-me chicken (LEFTOVERS)', c: '#F9C35C' },
              { d: 'SAT', meal: 'Pizza night · takeout', c: '#F26E63' },
              { d: 'SUN', meal: 'Crispy gnocchi + sage', c: '#7BA8E0' },
            ].map(d => (
              <div key={d.d} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 6, height: 28, borderRadius: 100, background: d.c }} />
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 800, letterSpacing: '0.2em', minWidth: 36 }}>{d.d}</div>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d.meal}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.KioskMealPlan = KioskMealPlan;
