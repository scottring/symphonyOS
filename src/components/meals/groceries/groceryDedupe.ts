/** Normalize grocery item text for duplicate comparison. */
export function dedupeKey(text: string): string {
  return text.toLowerCase().trim()
}

/**
 * Filter a batch of grocery items down to the ones NOT already present in the
 * target list, deduping both against `existingTexts` AND within the batch
 * itself (so sending "salmon" twice in one go yields a single insert).
 */
export function filterNewItems<T extends { text: string }>(items: T[], existingTexts: string[]): T[] {
  const seen = new Set(existingTexts.map(dedupeKey))
  const result: T[] = []
  for (const item of items) {
    const key = dedupeKey(item.text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}
