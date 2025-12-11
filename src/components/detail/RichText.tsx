import { useMemo } from 'react'

/**
 * Component to render text with clickable links (handles HTML links and plain URLs)
 */
export function RichText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const htmlLinkRegex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi
    const segments: Array<{ type: 'text' | 'link'; content: string; url?: string }> = []
    let match
    let lastIndex = 0
    const tempText = text.replace(htmlLinkRegex, (_fullMatch, url, linkText) => {
      return `__LINK__${url}__TEXT__${linkText || url}__ENDLINK__`
    })
    const combinedRegex = /(__LINK__([^_]+)__TEXT__([^_]+)__ENDLINK__)|(https?:\/\/[^\s<]+)/g
    lastIndex = 0
    while ((match = combinedRegex.exec(tempText)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = tempText.slice(lastIndex, match.index)
        if (textBefore) {
          segments.push({ type: 'text', content: textBefore })
        }
      }
      if (match[1]) {
        segments.push({ type: 'link', content: match[3], url: match[2] })
      } else if (match[4]) {
        segments.push({ type: 'link', content: match[4], url: match[4] })
      }
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < tempText.length) {
      segments.push({ type: 'text', content: tempText.slice(lastIndex) })
    }
    return segments
  }, [text])

  return (
    <>
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            {part.content}
          </a>
        ) : (
          <span key={i}>{part.content}</span>
        )
      )}
    </>
  )
}
