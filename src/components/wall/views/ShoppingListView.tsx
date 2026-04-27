import { useShoppingList } from '@/hooks/useShoppingList'

interface Props {
  appleListName: string
  title?: string
}

export function ShoppingListView({ appleListName, title }: Props) {
  const { items, loading, error, toggleComplete } = useShoppingList(appleListName)

  if (loading) return <div className="wall-card">Loading…</div>
  if (error) return <div className="wall-card wall-card-error">Error: {error}</div>

  const sorted = [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return a.sortOrder - b.sortOrder
  })

  return (
    <div className="wall-shopping-list">
      <h2 className="wall-shopping-title">{title ?? appleListName}</h2>
      <ul className="wall-shopping-items">
        {sorted.map(item => (
          <li
            key={item.id}
            data-completed={item.completed}
            className={`wall-shopping-item ${item.completed ? 'completed' : ''}`}
            onClick={() => toggleComplete(item.id, !item.completed)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                toggleComplete(item.id, !item.completed)
              }
            }}
          >
            <span className="wall-shopping-checkbox" aria-hidden>
              {item.completed ? '☑' : '☐'}
            </span>
            <span className="wall-shopping-text">{item.text}</span>
          </li>
        ))}
        {sorted.length === 0 && (
          <li className="wall-shopping-empty">List is empty — add via Siri or in Reminders.</li>
        )}
      </ul>
    </div>
  )
}
