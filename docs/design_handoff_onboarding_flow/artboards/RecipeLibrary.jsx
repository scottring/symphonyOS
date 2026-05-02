/* Recipe Library — desktop, editorial-calm system */
const { useState } = React;

const TAGS = ['All', '800g', 'Low-carb', 'Prep-friendly', 'Kid-approved', 'Quick (<30m)', 'Batch'];

const RECIPES = [
  { title: 'Sheet-pan miso salmon with bok choy', source: 'NYT Cooking', tags: ['800g', 'Quick (<30m)'], ella: 'eats', kaleb: 'rejects', last: '2 weeks ago', ingredients: 9, time: 25, photo: 'salmon' },
  { title: 'Marry-me chicken with orzo', source: 'NYT Cooking', tags: ['Kid-approved'], ella: 'loves', kaleb: 'loves', last: '5 days ago', ingredients: 11, time: 40, photo: 'chicken' },
  { title: 'Sunday-prep turkey chili (doubles)', source: 'Cookbook', tags: ['Batch', 'Prep-friendly', 'Kid-approved'], ella: 'eats', kaleb: 'eats', last: '3 weeks ago', ingredients: 14, time: 55, photo: 'chili' },
  { title: 'Crispy gnocchi with brown butter & sage', source: 'NYT Cooking', tags: ['Quick (<30m)'], ella: 'loves', kaleb: 'eats', last: 'Never', ingredients: 7, time: 20, photo: 'gnocchi' },
  { title: '800g bowl: lentils, roasted carrots, tahini', source: 'Symphony', tags: ['800g', 'Low-carb'], ella: 'rejects', kaleb: 'rejects', last: '1 week ago', ingredients: 10, time: 35, photo: 'lentils' },
  { title: 'Pasta al limone (kid-favorite)', source: 'NYT Cooking', tags: ['Kid-approved', 'Quick (<30m)'], ella: 'loves', kaleb: 'loves', last: '4 days ago', ingredients: 6, time: 22, photo: 'pasta' },
];

// Placeholder photo treatment: a layered illustration that reads as food without being a real photo.
// Each photo key gets a unique gradient + subtle pattern + emoji 'subject' bottom-right, large + soft.
const PHOTO_BG = {
  salmon: { grad: 'linear-gradient(135deg, #F9C35C 0%, #F26E63 100%)', emoji: '🐟' },
  chicken: { grad: 'linear-gradient(135deg, #FCE7C8 0%, #F4B860 100%)', emoji: '🍗' },
  chili: { grad: 'linear-gradient(135deg, #B95E3F 0%, #6B2E1A 100%)', emoji: '🍲' },
  gnocchi: { grad: 'linear-gradient(135deg, #E8DFC8 0%, #B8A074 100%)', emoji: '🍝' },
  lentils: { grad: 'linear-gradient(135deg, #B8C998 0%, #6B7B45 100%)', emoji: '🥗' },
  pasta: { grad: 'linear-gradient(135deg, #FFF6D9 0%, #E8C547 100%)', emoji: '🍜' },
};

const KID_DOT = { loves: '#0F8A4A', eats: '#D97706', rejects: '#B5483F' };
const KID_LABEL = { loves: 'loves', eats: 'eats', rejects: 'no' };

function KidPill({ name, status }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px 3px 6px', borderRadius: 100,
      background: '#FFFFFF', border: '1px solid #E8E0D8',
      fontSize: 11, fontWeight: 600, color: '#2C2520',
      letterSpacing: '0.01em',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: KID_DOT[status] }} />
      {name} <span style={{ color: '#9B8E84', fontWeight: 500 }}>{KID_LABEL[status]}</span>
    </span>
  );
}

function RecipeCard({ r }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E8E0D8', borderRadius: 16,
      overflow: 'hidden', boxShadow: '0 2px 8px rgba(44,37,32,0.04)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 152, background: PHOTO_BG[r.photo].grad, position: 'relative', overflow: 'hidden' }}>
        {/* Soft 'photo' subject — placeholder until real food photography drops in */}
        <div style={{
          position: 'absolute', right: -18, bottom: -22, fontSize: 130, opacity: 0.35,
          filter: 'blur(0.4px) saturate(1.1)', transform: 'rotate(-8deg)',
        }}>{PHOTO_BG[r.photo].emoji}</div>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.18), transparent 60%)',
        }} />
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: 'rgba(255,255,255,0.95)', borderRadius: 100,
          padding: '4px 10px', fontSize: 11, fontWeight: 600,
          color: '#6B5E54', display: 'flex', alignItems: 'center', gap: 5,
          backdropFilter: 'blur(4px)',
        }}>
          <span style={{ fontSize: 10 }}>◷</span> {r.time} min
        </div>
        {r.last === 'Never' && (
          <div style={{
            position: 'absolute', bottom: 10, left: 12,
            background: '#FEF3C7', color: '#B45309', borderRadius: 6,
            padding: '3px 8px', fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>New · never made</div>
        )}
      </div>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{
          fontFamily: 'Crimson Pro, Georgia, serif', fontSize: 18, fontWeight: 500,
          lineHeight: 1.25, color: '#2C2520', textWrap: 'pretty',
        }}>{r.title}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9B8E84' }}>
          <span style={{
            width: 14, height: 14, borderRadius: 3, background: '#2C2520',
            color: '#fff', fontSize: 8, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>NY</span>
          <span>{r.source}</span>
          <span>·</span>
          <span>{r.ingredients} ingredients</span>
          <span>·</span>
          <span>{r.last !== 'Never' ? `Last: ${r.last}` : 'Never made'}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {r.tags.map(t => (
            <span key={t} style={{
              fontSize: 10, fontWeight: 600, color: '#6B5E54',
              background: '#F5EFE7', padding: '3px 8px', borderRadius: 4,
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>{t}</span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6, borderTop: '1px solid rgba(224,216,206,0.5)' }}>
          <KidPill name="Ella" status={r.ella} />
          <KidPill name="Kaleb" status={r.kaleb} />
        </div>
      </div>
    </div>
  );
}

function RecipeLibrary() {
  const [active, setActive] = useState('All');
  return (
    <div style={{
      width: 1280, height: 880, background: '#FAF7F2', color: '#2C2520',
      fontFamily: 'DM Sans, system-ui, sans-serif', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        padding: '20px 36px', borderBottom: '1px solid #E8E0D8',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <span style={{ fontFamily: 'Crimson Pro, serif', fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>Symphony</span>
          <nav style={{ display: 'flex', gap: 22, fontSize: 13, color: '#9B8E84' }}>
            <span>Today</span><span>Plan</span><span>Projects</span><span>Routines</span>
            <span style={{ color: '#2C2520', fontWeight: 600 }}>Recipes</span>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 16px',
            background: '#FFFFFF', border: '1px solid #E8E0D8', borderRadius: 100, width: 240,
          }}>
            <span style={{ fontSize: 12, color: '#BEB3A9' }}>⌕</span>
            <input placeholder="Search recipes…" style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 13, color: '#2C2520', fontFamily: 'inherit' }} />
          </div>
          {/* Iris's avatar — viewer is Iris */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6DC4A7 0%, #4A9F84 100%)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 2px #FAF7F2, 0 0 0 3px #E8E0D8',
          }}>I</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '32px 36px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Recipe library</div>
            <h1 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 40, fontWeight: 300, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap' }}>
              What we cook<span style={{ fontStyle: 'italic', color: '#D97706' }}> together.</span>
            </h1>
            <p style={{ color: '#6B5E54', fontSize: 14, margin: '8px 0 0' }}>{RECIPES.length} of 47 recipes · sorted by recently made</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button style={{
              padding: '11px 18px', borderRadius: 100, border: '1.5px solid #E0D8CE',
              background: 'transparent', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: '#6B5E54', cursor: 'pointer',
            }}>+ Manual entry</button>
            <button style={{
              padding: '11px 22px', borderRadius: 100, border: 'none',
              background: '#2C2520', color: '#FAF7F2', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                width: 16, height: 16, background: '#fff', color: '#2C2520', borderRadius: 3,
                fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>NY</span>
              Paste NYT URL
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {TAGS.map(t => (
            <button key={t} onClick={() => setActive(t)} style={{
              padding: '7px 14px', borderRadius: 100, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: active === t ? '1.5px solid #2C2520' : '1.5px solid #E0D8CE',
              background: active === t ? '#2C2520' : 'transparent',
              color: active === t ? '#FAF7F2' : '#6B5E54',
            }}>{t}</button>
          ))}
          <span style={{ width: 1, height: 18, background: '#E0D8CE', margin: '0 4px' }} />
          <button style={{ padding: '7px 14px', borderRadius: 100, border: '1.5px solid #E0D8CE', background: 'transparent', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#6B5E54' }}>
            Kids: any
          </button>
          <button style={{ padding: '7px 14px', borderRadius: 100, border: '1.5px solid #E0D8CE', background: 'transparent', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#6B5E54' }}>
            Made: anytime
          </button>
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, alignContent: 'start',
        }}>
          {RECIPES.map(r => <RecipeCard key={r.title} r={r} />)}
        </div>
      </div>
    </div>
  );
}

window.RecipeLibrary = RecipeLibrary;
