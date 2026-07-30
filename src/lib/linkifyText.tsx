import type { JSX } from 'react'

// Splits plain text on http(s) URLs so they can render as real links.
//
// action_history details are recorded as sentences that embed a URL ("Opened
// https://www.etsy.com/search?q=wall+posters"), and the "Last: …" line rendered
// them as dead text — you could see the link you'd followed but not follow it
// again. This keeps the surrounding sentence intact and only wraps the URL.

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g

/** Trailing punctuation that reads as sentence structure, not part of the URL. */
function trimTrailingPunctuation(url: string): { href: string; trailing: string } {
  const match = url.match(/[.,;:!?]+$/)
  if (!match) return { href: url, trailing: '' }
  return { href: url.slice(0, -match[0].length), trailing: match[0] }
}

export function linkifyText(
  text: string,
  linkClassName = 'underline hover:text-primary-700 break-all',
): (string | JSX.Element)[] {
  const parts = text.split(URL_RE)
  return parts.map((part, i) => {
    if (!URL_RE.test(part)) return part
    const { href, trailing } = trimTrailingPunctuation(part)
    return (
      <span key={`${href}-${i}`}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          onClick={(e) => e.stopPropagation()}
          title={href}
        >
          {href}
        </a>
        {trailing}
      </span>
    )
  })
}
