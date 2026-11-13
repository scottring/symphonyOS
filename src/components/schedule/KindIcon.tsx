import { createElement } from 'react'
import { itemIcon } from '@/lib/today/itemIcon'

/** The small ink icon for what kind of thing a row is (itemIcon), or nothing. */
export function KindIcon({ title, size = 18 }: { title: string; size?: number }) {
  const icon = itemIcon(title)
  return icon ? createElement(icon, { size, strokeWidth: 1.7, 'aria-hidden': true }) : null
}
