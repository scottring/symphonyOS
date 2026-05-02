/* Send-to-Groceries review modal — overlaid on a dimmed planner backdrop */
const CATEGORIES = [
  { name: 'Produce', icon: '🥬', items: [
    { qty: '2 lb', name: 'Bok choy', from: ['Miso salmon'] },
    { qty: '1 bunch', name: 'Sage', from: ['Crispy gnocchi'] },
    { qty: '3', name: 'Lemons', from: ['Pasta al limone', 'Miso salmon'] },
    { qty: '1 head', name: 'Garlic', from: ['Marry-me chicken', 'Turkey chili'] },
    { qty: '2', name: 'Yellow onions', from: ['Turkey chili'] },
    { qty: '1', name: 'Red bell pepper', from: ['Turkey chili'] },
  ]},
  { name: 'Dairy', icon: '🧈', items: [
    { qty: '1 lb', name: 'Salted butter', from: ['Crispy gnocchi', 'Pasta al limone', 'Plain pasta (kid)'] },
    { qty: '8 oz', name: 'Heavy cream', from: ['Marry-me chicken'] },
    { qty: '4 oz', name: 'Parmesan, block', from: ['Pasta al limone', 'Crispy gnocchi'] },
  ]},
  { name: 'Pantry', icon: '🥫', items: [
    { qty: '1 jar', name: 'White miso paste', from: ['Miso salmon'], edited: true },
    { qty: '2 cans', name: 'Diced tomatoes', from: ['Turkey chili'] },
    { qty: '2 cans', name: 'Black beans', from: ['Turkey chili'] },
    { qty: '1 box', name: 'Orzo pasta', from: ['Marry-me chicken'] },
    { qty: '1 lb', name: 'Penne or spaghetti', from: ['Pasta al limone', 'Plain pasta (kid)'] },
  ]},
  { name: 'Protein', icon: '🍗', items: [
    { qty: '1.5 lb', name: 'Salmon fillet', from: ['Miso salmon'] },
    { qty: '2 lb', name: 'Boneless chicken thighs', from: ['Marry-me chicken'] },
    { qty: '2 lb', name: 'Ground turkey (93/7)', from: ['Turkey chili ×2'] },
  ]},
  { name: 'Frozen', icon: '🥟', items: [
    { qty: '2 packs', name: 'Potato gnocchi', from: ['Crispy gnocchi'] },
  ]},
];

function GroceriesModal() {
  return (
    <div style={{
      width: 1440, height: 920, background: '#FAF7F2',
      fontFamily: 'DM Sans, system-ui, sans-serif', color: '#2C2520',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Backdrop hint of the planner page */}
      <div style={{ position: 'absolute', inset: 0, padding: '40px 60px', opacity: 0.35 }}>
        <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: 36, color: '#2C2520' }}>Plan the week.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginTop: 40 }}>
          {Array.from({length: 7}).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 40, borderBottom: '1px solid #E8E0D8' }} />
              <div style={{ height: 70, background: '#fff', border: '1px solid #E8E0D8', borderRadius: 10 }} />
              <div style={{ height: 60, background: '#fff', border: '1px solid #E8E0D8', borderRadius: 10 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,37,32,0.45)', backdropFilter: 'blur(3px)' }} />

      {/* Modal */}
      <div style={{
        position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
        width: 880, maxHeight: 820, background: '#FFFFFF', borderRadius: 20,
        boxShadow: '0 24px 60px rgba(44,37,32,0.25)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 32px 20px', borderBottom: '1px solid #E8E0D8' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Review groceries</div>
            <span style={{ fontSize: 18, color: '#9B8E84', cursor: 'pointer' }}>✕</span>
          </div>
          <h2 style={{ fontFamily: 'Crimson Pro, serif', fontSize: 30, fontWeight: 400, lineHeight: 1.1, margin: 0, letterSpacing: '-0.01em' }}>
            23 items, consolidated from <em style={{ color: '#D97706' }}>6 recipes</em>.
          </h2>
          <p style={{ fontSize: 13, color: '#6B5E54', marginTop: 6 }}>
            Edit anything that's wrong, then send to the shared list. Iris's iPhone gets it within 60 seconds.
          </p>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px 12px' }}>
          {CATEGORIES.map(cat => (
            <div key={cat.name} style={{ marginBottom: 22 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                paddingBottom: 6, borderBottom: '1px solid rgba(232,224,216,0.6)',
              }}>
                <span style={{ fontSize: 16 }}>{cat.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6B5E54', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{cat.name}</span>
                <span style={{ fontSize: 11, color: '#BEB3A9' }}>{cat.items.length}</span>
              </div>
              {cat.items.map(item => (
                <div key={item.name} style={{
                  display: 'grid', gridTemplateColumns: '20px 90px 1fr auto 24px', gap: 12,
                  alignItems: 'center', padding: '8px 4px',
                  borderBottom: '1px dashed rgba(224,216,206,0.5)',
                }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: '#D97706' }} />
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#2C2520', fontWeight: 500 }}>{item.qty}</span>
                  <span style={{ fontSize: 14, color: '#2C2520', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {item.name}
                    {item.edited && <span style={{ fontSize: 9, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>edited</span>}
                  </span>
                  <span style={{ fontSize: 11, color: '#9B8E84', fontStyle: 'italic', fontFamily: 'Crimson Pro, serif', maxWidth: 220, textAlign: 'right' }}>
                    {item.from.join(' · ')}
                  </span>
                  <span style={{ fontSize: 14, color: '#BEB3A9', cursor: 'pointer', textAlign: 'center' }}>⋯</span>
                </div>
              ))}
            </div>
          ))}

          {/* Add custom item */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: '#F5EFE7', borderRadius: 10, border: '1px dashed #D9CFC2', marginTop: 4,
          }}>
            <span style={{ fontSize: 14, color: '#9B8E84' }}>+</span>
            <input placeholder="Add a custom item (e.g. olive oil, paper towels)…" style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit', color: '#2C2520',
            }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '18px 32px', borderTop: '1px solid #E8E0D8', background: '#FAF7F2',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6B5E54' }}>
            <span style={{
              width: 18, height: 18, borderRadius: 4, background: '#000', color: '#fff',
              fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}></span>
            Syncs to Apple Reminders → Iris's <span style={{ fontWeight: 600, color: '#2C2520' }}>Groceries</span> list
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ padding: '11px 18px', borderRadius: 100, border: '1.5px solid #E0D8CE', background: 'transparent', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: '#6B5E54', cursor: 'pointer' }}>
              Save as draft
            </button>
            <button style={{ padding: '11px 22px', borderRadius: 100, border: 'none', background: '#D97706', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Send 23 items to Groceries
              <span>→</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tiny toast preview, bottom-right */}
      <div style={{
        position: 'absolute', bottom: 24, right: 24,
        background: '#1F2937', color: '#fff', borderRadius: 12,
        padding: '12px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10,
        maxWidth: 320, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
        <span><strong>Synced.</strong> 23 items will appear in Iris's Reminders within 60s.</span>
      </div>
    </div>
  );
}

window.GroceriesModal = GroceriesModal;
