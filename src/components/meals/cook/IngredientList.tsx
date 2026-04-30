interface Props {
  title: string
  items: string[]
  emptyMessage?: string
}

/**
 * Single-column list used for both "You'll need" and "Good with" sidebars.
 */
export function IngredientList({ title, items, emptyMessage }: Props) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 mb-3">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm italic text-neutral-400">{emptyMessage ?? 'Nothing here yet.'}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li
              key={`${i}-${item}`}
              className="text-[14px] leading-snug text-neutral-700"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
