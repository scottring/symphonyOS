/* Weekly Planner — desktop, editorial-calm */
const PARAMS = ['Regular', '800g challenge', 'Low-carb', 'Custom'];
const DAYS = ['Mon Apr 27', 'Tue Apr 28', 'Wed Apr 29', 'Thu Apr 30', 'Fri May 1', 'Sat May 2', 'Sun May 3'];

// People & their accent colors (from existing Symphony wall language)
const PEOPLE = {
  iris:  { initial: 'I', name: 'Iris',  color: '#6DC4A7' },  // teal
  scott: { initial: 'S', name: 'Scott', color: '#9BC9A6' },  // mint
};

const PLAN = {
  // by:'iris'|'scott' = who scheduled it. lunchIris / lunchScott are independent slots.
  0: { dinner: { title: 'Pasta al limone', time: 22, ella: 'loves', kaleb: 'loves', by: 'iris' }, alt: null, lunchIris: { title: 'Leftover salmon bowl', by: 'iris' }, lunchScott: { title: 'Sandwich + apple', by: 'scott' }, prep: null },
  1: { dinner: { title: 'Sunday turkey chili', time: 0, ella: 'eats', kaleb: 'eats', leftover: true, by: 'iris' }, alt: null, lunchIris: { title: 'Leftover salmon bowl', by: 'iris' }, lunchScott: { title: 'Out · client lunch', by: 'scott' }, prep: null },
  2: { dinner: { title: 'Sheet-pan miso salmon', time: 25, ella: 'eats', kaleb: 'rejects', by: 'iris' }, alt: { title: 'Plain pasta + butter', time: 8, by: 'iris' }, lunchIris: { title: 'Leftover chili', by: 'iris' }, lunchScott: { title: 'Leftover chili', by: 'scott' }, prep: null },
  3: { dinner: null, alt: null, lunchIris: { title: 'Leftover chili', by: 'iris' }, lunchScott: null, prep: null },
  4: { dinner: { title: 'Marry-me chicken w/ orzo', time: 40, ella: 'loves', kaleb: 'loves', by: 'iris' }, alt: null, lunchIris: { title: 'Leftover chili', by: 'iris' }, lunchScott: { title: 'Leftover chili', by: 'scott' }, prep: null },
  5: { dinner: { title: 'Pizza night (takeout)', time: 0, ella: 'loves', kaleb: 'loves', by: 'scott' }, alt: null, lunchIris: null, lunchScott: null, prep: null },
  6: { dinner: { title: 'Crispy gnocchi + sage', time: 20, ella: 'loves', kaleb: 'eats', by: 'iris' }, alt: null, lunchIris: null, lunchScott: null, prep: { title: 'Sunday turkey chili (×2 batch)', time: 55, by: 'iris' } },
};

const KID_DOT = { loves: '#0F8A4A', eats: '#D97706', rejects: '#B5483F' };

function KidDots({ ella, kaleb }) {
  if (!ella) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9B8E84' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: KID_DOT[ella] }} title={`Ella ${ella}`} />
      <span>E</span>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: KID_DOT[kaleb], marginLeft: 3 }} title={`Kaleb ${kaleb}`} />
      <span>K</span>
    </span>
  );
}

function AuthorDot({ by }) {
  if (!by) return null;
  const p = PEOPLE[by];
  return (
    <span title={`Added by ${p.name}`} style={{
      width: 14, height: 14, borderRadius: '50%', background: p.color,
      color: '#1F2937', fontSize: 8, fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 0 1.5px #FAF7F2',
    }}>{p.initial}</span>
  );
}

function FilledSlot({ label, accent, item, sub }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E8E0D8', borderRadius: 10,
      padding: '10px 12px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}{sub && <span style={{ color: '#BEB3A9', fontWeight: 500 }}> · {sub}</span>}
        </div>
        <AuthorDot by={item.by} />
      </div>
      <div style={{
        fontFamily: 'Crimson Pro, serif', fontSize: 14, fontWeight: 500,
        lineHeight: 1.25, color: '#2C2520', marginBottom: 6, textWrap: 'pretty',
      }}>{item.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <KidDots ella={item.ella} kaleb={item.kaleb} />
        {item.time > 0 && <span style={{ fontSize: 10, color: '#9B8E84' }}>{item.time}m</span>}
        {item.leftover && <span style={{ fontSize: 9, fontWeight: 600, color: '#0F8A4A', background: '#D1FAE5', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Leftovers</span>}
      </div>
    </div>
  );
}

function EmptySlot({ label }) {
  return (
    <div style={{
      border: '1.5px dashed #D9CFC2', borderRadius: 10, padding: '10px 12px',
      background: 'transparent', minHeight: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      cursor: 'pointer',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#BEB3A9', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#BEB3A9' }}>+ pick a recipe</div>
    </div>
  );
}

function DayColumn({ idx, day }) {
  const p = PLAN[idx] || {};
  const isToday = idx === 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{
        textAlign: 'left', paddingBottom: 6, borderBottom: isToday ? '2px solid #D97706' : '1px solid #E8E0D8',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? '#D97706' : '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {day.split(' ')[0]}{isToday && ' · today'}
        </div>
        <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 18, fontWeight: 400, color: '#2C2520' }}>
          {day.split(' ').slice(1).join(' ')}
        </div>
      </div>
      {p.prep ? <FilledSlot label="Prep" sub="batch" accent="#7C3AED" item={p.prep} /> : null}
      {p.dinner ? <FilledSlot label="Dinner" accent="#D97706" item={p.dinner} /> : <EmptySlot label="Dinner" />}
      {p.alt && (
        <div style={{ marginLeft: 14, position: 'relative' }}>
          <div style={{ position: 'absolute', left: -10, top: -6, width: 10, height: 14, borderLeft: '1.5px dashed #D9CFC2', borderBottom: '1.5px dashed #D9CFC2' }} />
          <FilledSlot label="Kid alternate" accent="#7BA8E0" item={{ ...p.alt, ella: undefined }} />
        </div>
      )}
      {p.lunchIris ? <FilledSlot label="Iris · work lunch" accent="#6DC4A7" item={p.lunchIris} /> : (idx < 5 ? <EmptySlot label="Iris · work lunch" /> : null)}
      {p.lunchScott ? <FilledSlot label="Scott · work lunch" accent="#9BC9A6" item={p.lunchScott} /> : (idx < 5 ? <EmptySlot label="Scott · work lunch" /> : null)}
    </div>
  );
}

function WeeklyPlanner() {
  return (
    <div style={{
      width: 1440, height: 1040, background: '#FAF7F2', color: '#2C2520',
      fontFamily: 'DM Sans, system-ui, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{ padding: '20px 36px', borderBottom: '1px solid #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 22, fontWeight: 500 }}>Symphony</span>
          <nav style={{ display: 'flex', gap: 22, fontSize: 13, color: '#9B8E84' }}>
            <span>Today</span>
            <span style={{ color: '#2C2520', fontWeight: 600 }}>Plan</span>
            <span>Projects</span><span>Routines</span><span>Recipes</span>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Avatars — the other person on the page (Scott), then the viewer (Iris) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Scott is also viewing">
            <span style={{ position: 'relative', width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #B8D4BC 0%, #7FA888 100%)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px #FAF7F2' }}>
              S
              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 0 2px #FAF7F2' }} />
            </span>
          </div>
          <button style={{ padding: '11px 22px', borderRadius: 100, border: 'none', background: '#D97706', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Send 23 items to Groceries →
          </button>
          {/* Viewer avatar (Iris) */}
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6DC4A7 0%, #4A9F84 100%)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px #FAF7F2, 0 0 0 3px #E8E0D8' }}>I</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', overflow: 'hidden' }}>
        {/* Sidebar — recipe library */}
        <div style={{ borderRight: '1px solid #E8E0D8', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Recipe drawer</div>
            <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 18, fontWeight: 400, marginBottom: 8 }}>Drag onto any slot</div>
            <input placeholder="Filter library…" style={{
              width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E8E0D8',
              background: '#fff', fontSize: 12, color: '#2C2520', outline: 'none', fontFamily: 'inherit',
            }} />
          </div>
          {[
            { title: 'Sheet-pan miso salmon', time: 25, ella: 'eats', kaleb: 'rejects', placed: true },
            { title: 'Marry-me chicken w/ orzo', time: 40, ella: 'loves', kaleb: 'loves', placed: true },
            { title: 'Sunday turkey chili', time: 55, ella: 'eats', kaleb: 'eats', placed: true },
            { title: 'Crispy gnocchi + sage', time: 20, ella: 'loves', kaleb: 'eats', placed: true },
            { title: 'Pasta al limone', time: 22, ella: 'loves', kaleb: 'loves', placed: true },
            { title: '800g lentil bowl', time: 35, ella: 'rejects', kaleb: 'rejects' },
            { title: 'Cauliflower & chickpea curry', time: 30, ella: 'eats', kaleb: 'rejects' },
            { title: 'Sheet-pan sausage + peppers', time: 28, ella: 'loves', kaleb: 'loves' },
          ].map(r => (
            <div key={r.title} style={{
              background: '#fff', border: '1px solid #E8E0D8', borderRadius: 8, padding: '10px 12px',
              display: 'flex', flexDirection: 'column', gap: 6, opacity: r.placed ? 0.45 : 1,
            }}>
              <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 14, lineHeight: 1.2, color: '#2C2520', textWrap: 'pretty' }}>{r.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <KidDots ella={r.ella} kaleb={r.kaleb} />
                <span style={{ fontSize: 10, color: '#9B8E84' }}>{r.time}m{r.placed && ' · planned'}</span>
              </div>
            </div>
          ))}
          <a style={{
            marginTop: 'auto', padding: '10px 0', textAlign: 'center',
            fontSize: 12, fontWeight: 600, color: '#D97706',
            borderTop: '1px dashed #E0D8CE', cursor: 'pointer',
          }}>
            View all 47 recipes →
          </a>
        </div>

        {/* Plan grid */}
        <div style={{ padding: '24px 32px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Week of Apr 27</div>
              <h1 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 36, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0 }}>
                Plan the week<span style={{ fontStyle: 'italic', color: '#D97706' }}>.</span>
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Mode</span>
              {PARAMS.map((p, i) => (
                <button key={p} style={{
                  padding: '7px 12px', borderRadius: 100, fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: i === 0 ? 'none' : '1.5px solid #E0D8CE',
                  background: i === 0 ? '#2C2520' : 'transparent',
                  color: i === 0 ? '#FAF7F2' : '#6B5E54',
                }}>{p}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
            {DAYS.map((d, i) => <DayColumn key={d} idx={i} day={d} />)}
          </div>

          {/* Footer summary */}
          <div style={{
            marginTop: 8, background: '#FFFFFF', border: '1px solid #E8E0D8', borderRadius: 12,
            padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', gap: 32 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Dinners</div>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 24, fontWeight: 400 }}>6 of 7</div>
              </div>
          {/* Iris lunches */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Iris lunches</div>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 24, fontWeight: 400 }}>3 of 5</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Scott lunches</div>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 24, fontWeight: 400 }}>3 of 5</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Prep</div>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 24, fontWeight: 400 }}>Sun · chili</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9B8E84', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Kid alternates</div>
                <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 24, fontWeight: 400 }}>1 (Wed)</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#6B5E54', fontStyle: 'italic', fontFamily: 'Crimson Pro, serif' }}>Thursday's open — chili leftovers cover lunch.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.WeeklyPlanner = WeeklyPlanner;
