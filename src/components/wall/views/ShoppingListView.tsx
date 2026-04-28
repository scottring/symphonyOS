import { useShoppingList } from '@/hooks/useShoppingList'

interface Props {
  appleListName: string
  title?: string
}

const CARD_COLORS = [
  '#6DC4A7',
  '#F9C35C',
  '#F26E63',
  '#7BA8E0',
]

function getItemIcon(text: string): string {
  const lower = text.toLowerCase()
  if (/(milk|cream|yogurt|cheese|butter)/.test(lower)) return '🥛'
  if (/(egg)/.test(lower)) return '🥚'
  if (/(bread|bagel|toast)/.test(lower)) return '🍞'
  if (/(banana)/.test(lower)) return '🍌'
  if (/(apple)/.test(lower)) return '🍎'
  if (/(orange|citrus)/.test(lower)) return '🍊'
  if (/(berr|strawberr|blueberr|raspberr)/.test(lower)) return '🍓'
  if (/(grape|raisin)/.test(lower)) return '🍇'
  if (/(lemon|lime)/.test(lower)) return '🍋'
  if (/(avocado|pear)/.test(lower)) return '🥑'
  if (/(tomato)/.test(lower)) return '🍅'
  if (/(onion|garlic)/.test(lower)) return '🧅'
  if (/(potato)/.test(lower)) return '🥔'
  if (/(carrot)/.test(lower)) return '🥕'
  if (/(corn)/.test(lower)) return '🌽'
  if (/(pepper|chili)/.test(lower)) return '🌶️'
  if (/(broccoli|spinach|kale|lettuce|salad|green)/.test(lower)) return '🥦'
  if (/(mushroom)/.test(lower)) return '🍄'
  if (/(olive|oil)/.test(lower)) return '🫒'
  if (/(rice|grain)/.test(lower)) return '🍚'
  if (/(pasta|noodle|spaghet)/.test(lower)) return '🍝'
  if (/(chicken|turkey)/.test(lower)) return '🍗'
  if (/(beef|steak|burger)/.test(lower)) return '🥩'
  if (/(bacon|pork|ham)/.test(lower)) return '🥓'
  if (/(fish|salmon|tuna|tilapia)/.test(lower)) return '🐟'
  if (/(shrimp|prawn|crab|lobster)/.test(lower)) return '🦐'
  if (/(coffee|espresso)/.test(lower)) return '☕'
  if (/(tea\b)/.test(lower)) return '🍵'
  if (/(juice)/.test(lower)) return '🧃'
  if (/(water|sparkling)/.test(lower)) return '💧'
  if (/(wine|beer|alcohol)/.test(lower)) return '🍷'
  if (/(soda|cola|pop)/.test(lower)) return '🥤'
  if (/(snack|chip|cracker|pretzel)/.test(lower)) return '🍿'
  if (/(cookie|cake|pie|dessert|sweet|sugar|chocolate)/.test(lower)) return '🍪'
  if (/(ice cream)/.test(lower)) return '🍦'
  if (/(soap|detergent|clean|paper towel|toilet)/.test(lower)) return '🧼'
  if (/(salt|spice|herb)/.test(lower)) return '🧂'
  return '🛒'
}

export function ShoppingListView({ appleListName, title }: Props) {
  const { items, loading, error, toggleComplete } = useShoppingList(appleListName)

  const headerLabel = title ?? appleListName

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50 mb-4">
          {headerLabel}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-white/30 font-black uppercase tracking-widest text-[0.85rem]">
            Loading…
          </span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50 mb-4">
          {headerLabel}
        </div>
        <div className="flex-1 flex items-center justify-center text-center px-4">
          <div>
            <div className="text-[2.5rem] mb-2">⚠️</div>
            <div className="text-white/60 font-black uppercase tracking-wider text-[0.7rem]">
              {error}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const sorted = [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return a.sortOrder - b.sortOrder
  })

  return (
    <div className="flex flex-col h-full">
      <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50 mb-4">
        {headerLabel}
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-4">
          <div className="opacity-50">
            <div className="text-[3rem]">🛒</div>
            <div className="text-[0.7rem] font-black text-white/70 mt-1 uppercase tracking-widest leading-snug">
              List is empty —<br/>add via Siri or Reminders
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {sorted.map((item, index) => {
            const color = CARD_COLORS[index % CARD_COLORS.length]
            const icon = getItemIcon(item.text)
            const isDone = item.completed

            return (
              <button
                key={item.id}
                data-completed={isDone}
                onClick={() => toggleComplete(item.id, !isDone)}
                className={`relative rounded-[1.2rem] flex items-center gap-3 px-4 py-3 shadow-lg overflow-hidden transition-all duration-300 select-none active:scale-95 ${isDone ? 'opacity-40' : ''}`}
                style={{
                  backgroundColor: isDone ? 'rgba(255,255,255,0.06)' : color,
                  touchAction: 'manipulation',
                  minHeight: 64,
                }}
              >
                {isDone && <div className="absolute top-2 right-2 text-[0.9rem] z-20">✅</div>}
                <div className="text-[1.8rem] drop-shadow-md flex-shrink-0">{icon}</div>
                <span
                  className={`font-black text-[0.85rem] uppercase tracking-wider leading-tight flex-1 text-left ${isDone ? 'text-white/50 line-through' : 'text-white'}`}
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {item.text}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
