interface QuickTagBubblesProps {
  tags: string[]
  availableTags: string[]
  onToggleTag: (tag: string) => void
}

export function QuickTagBubbles({ tags, availableTags, onToggleTag }: QuickTagBubblesProps) {
  if (availableTags.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 animate-slide-up">
      {availableTags.map((tag) => {
        const isSelected = tags.includes(tag)
        return (
          <button
            key={tag}
            onClick={() => onToggleTag(tag)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 ${
              isSelected
                ? 'bg-sage-100 text-sage-700 ring-1 ring-sage-300'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
            }`}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Generate contextual tag options based on block items.
 */
export function generateTagsForBlock(items: Array<{ who: string; action: string }>): string[] {
  const tags: string[] = []
  const kids = new Set<string>()

  for (const item of items) {
    const who = item.who.toLowerCase()
    if (who !== 'self' && who !== 'partner' && who !== 'both') {
      kids.add(item.who)
    }
  }

  // Kid-specific tags
  for (const kid of kids) {
    tags.push(`${kid} loved it`)
    tags.push(`${kid} was grumpy`)
  }

  // Generic tags
  tags.push('New approach worked')
  tags.push('Try differently')
  tags.push('Skipped this one')

  return tags
}
