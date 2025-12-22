/**
 * Strips HTML tags and decodes HTML entities from a string
 * Used for displaying HTML content as plain text in notes
 */
export function stripHtml(html: string): string {
  // Create a temporary div to parse HTML
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Get text content (this handles HTML entity decoding automatically)
  const text = temp.textContent || temp.innerText || ''

  // Clean up extra whitespace
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Converts HTML content to plain text with preserved line breaks
 * Replaces block elements with newlines for better formatting
 */
export function htmlToPlainText(html: string): string {
  // Create a temporary div to parse HTML
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Replace block-level elements with newlines before getting text
  const blockElements = temp.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6')
  blockElements.forEach((el) => {
    if (el.tagName === 'BR') {
      el.replaceWith('\n')
    } else {
      const text = el.textContent || ''
      el.replaceWith(text + '\n')
    }
  })

  // Get final text content
  const text = temp.textContent || temp.innerText || ''

  // Clean up excessive newlines (max 2 consecutive)
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ') // Normalize spaces but keep newlines
    .trim()
}
