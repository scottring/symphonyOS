/**
 * Notes are stored as HTML and edited with Tiptap, but most of them are not
 * written by a human in that editor. Agents, the MCP server and the ingest edge
 * functions all write PLAIN TEXT or MARKDOWN into `notes`. Tiptap's
 * `setContent(string)` parses its argument as HTML, so those notes lose every
 * newline: a 900-word briefing collapses into a single paragraph with literal
 * "- " dashes where the bullets should be.
 *
 * `notesToHtml` is the seam. It leaves real HTML alone and lifts everything
 * else into the small subset of HTML the editor's schema accepts — headings,
 * lists (bullet / ordered / task), blockquotes, rules, paragraphs, and inline
 * bold / italic / code. It is pure, and idempotent: running it on its own
 * output returns that output unchanged, because the output always begins with
 * a block tag the passthrough check recognises.
 */

/** Markup that means "this note is already HTML — do not touch it". */
const BLOCK_TAG = /<(p|h[1-6]|ul|ol|li|table|div|blockquote|pre|br|hr)[\s/>]/i

const BULLET = /^[-*•]\s+(.*)$/
const TASK = /^[-*•]\s+\[([ xX])\]\s*(.*)$/
const ORDERED = /^\d+[.)]\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
const ATX_HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^-{3,}$/

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// A website ("https://…", or printed as "www.…") and a North American phone
// number with its separators — "410-333-1555", "(410) 333.1555", "+1 410 333
// 1555". Separators are required so ids and dates ("52587920", "2026-10-05")
// stay text. Run on escaped text, so `&` inside a URL is already `&amp;`.
const WEB = /\b(?:https?:\/\/|www\.)[^\s<]+/gi
const PHONE = /(?<![\w+])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w-])/g

function trimTrailing(url: string): [string, string] {
  const tail = /[.,;:!?)]+$/.exec(url)?.[0] ?? ''
  return [url.slice(0, url.length - tail.length), tail]
}

/**
 * Bold, italic and code, applied to already-escaped text — and, for notes,
 * websites and phone numbers as links (Scott, 2026-10-04: a jury summons note
 * held the number to call the night before as dead text). StarterKit 3 ships
 * the Link extension and allows tel:, so the editor keeps these <a>s.
 *
 * Code spans and links are lifted out behind sentinels first, so markdown
 * punctuation inside them survives ("_form_" in a URL is not emphasis).
 */
function inlineMarkdown(escaped: string, links = false): string {
  const codes: string[] = []
  let out = escaped.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(code)
    return `@@SYMPHONY_CODE_${codes.length - 1}@@`
  })

  const anchors: string[] = []
  const lift = (html: string) => {
    anchors.push(html)
    return `@@SYMPHONY_LINK_${anchors.length - 1}@@`
  }
  if (links) {
    out = out.replace(WEB, (m) => {
      const [url, tail] = trimTrailing(m)
      const href = /^www\./i.test(url) ? `https://${url}` : url
      return lift(`<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`) + tail
    })
    out = out.replace(PHONE, (m) => lift(`<a href="tel:+1${m.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')}">${m}</a>`))
  }

  out = out.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
  // The leading guard keeps `3*4*5` and `snake_case_name` as plain text: an
  // emphasis marker may not begin inside a word.
  out = out.replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^_\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1<em>$2</em>')

  return out
    .replace(/@@SYMPHONY_LINK_(\d+)@@/g, (_m, index: string) => anchors[Number(index)])
    .replace(/@@SYMPHONY_CODE_(\d+)@@/g, (_m, index: string) => `<code>${codes[Number(index)]}</code>`)
}

/** A line that reads as a section header even though nobody typed a "#". */
function isCapsHeading(line: string): boolean {
  if (line.length < 3 || line.length > 80) return false
  if (/[a-z]/.test(line)) return false
  return (line.match(/[A-Za-z]/g) ?? []).length >= 3
}

type Kind = 'heading' | 'rule' | 'task' | 'bullet' | 'ordered' | 'quote' | 'text'

interface Line {
  kind: Kind
  /** Raw (unescaped) text content of the line, markers stripped. */
  text: string
  /** Heading level, for `kind === 'heading'`. */
  level?: 1 | 2 | 3
  /** Checked state, for `kind === 'task'`. */
  checked?: boolean
}

function classify(raw: string): Line {
  const line = raw.trim()

  if (RULE.test(line)) return { kind: 'rule', text: '' }

  const atx = ATX_HEADING.exec(line)
  if (atx) {
    const level = Math.min(atx[1].length, 3) as 1 | 2 | 3
    return { kind: 'heading', text: atx[2].trim(), level }
  }

  const task = TASK.exec(line)
  if (task) {
    return { kind: 'task', text: task[2].trim(), checked: task[1].toLowerCase() === 'x' }
  }

  const bullet = BULLET.exec(line)
  if (bullet) return { kind: 'bullet', text: bullet[1].trim() }

  const ordered = ORDERED.exec(line)
  if (ordered) return { kind: 'ordered', text: ordered[1].trim() }

  const quote = QUOTE.exec(line)
  if (quote) return { kind: 'quote', text: quote[1].trim() }

  if (isCapsHeading(line)) return { kind: 'heading', text: line, level: 3 }

  return { kind: 'text', text: line }
}

function renderRun(run: Line[]): string {
  const body = (line: Line) => inlineMarkdown(escapeHtml(line.text), true)

  switch (run[0].kind) {
    case 'heading':
      return run.map((l) => `<h${l.level}>${body(l)}</h${l.level}>`).join('')
    case 'rule':
      return run.map(() => '<hr>').join('')
    case 'task':
      return `<ul data-type="taskList">${run
        .map(
          (l) =>
            `<li data-type="taskItem" data-checked="${l.checked ? 'true' : 'false'}">` +
            `<label><input type="checkbox"${l.checked ? ' checked' : ''}><span></span></label>` +
            `<div><p>${body(l)}</p></div></li>`,
        )
        .join('')}</ul>`
    case 'bullet':
      return `<ul>${run.map((l) => `<li><p>${body(l)}</p></li>`).join('')}</ul>`
    case 'ordered':
      return `<ol>${run.map((l) => `<li><p>${body(l)}</p></li>`).join('')}</ol>`
    case 'quote':
      return `<blockquote><p>${run.map(body).join('<br>')}</p></blockquote>`
    case 'text':
      return `<p>${run.map(body).join('<br>')}</p>`
  }
}

/**
 * Turn a note as it was written into HTML the Tiptap schema accepts.
 *
 * Returns `''` for nothing, the input verbatim when it is already HTML, and
 * converted markup otherwise.
 */
export function notesToHtml(raw: string | null | undefined): string {
  const text = (raw ?? '').trim()
  if (!text) return ''
  if (BLOCK_TAG.test(text)) return raw as string

  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .split(/\n{2,}/)

  const html: string[] = []

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .filter((line) => line.trim())
      .map(classify)
    if (!lines.length) continue

    // Group consecutive lines of the same kind. This is what lets an ALL-CAPS
    // first line become its own <h3> while the lines under it form their own
    // paragraph or list, and what preserves order in a block that mixes them.
    let run: Line[] = [lines[0]]
    for (const line of lines.slice(1)) {
      if (line.kind === run[0].kind) {
        run.push(line)
      } else {
        html.push(renderRun(run))
        run = [line]
      }
    }
    html.push(renderRun(run))
  }

  return html.join('')
}

/**
 * Bold, italic, code — nothing block-level. For prose that isn't a note, such
 * as an assistant chat bubble: streamed text is a paragraph of sentences, not
 * headings/lists/quotes, so the block classifier in `notesToHtml` would be
 * the wrong tool (and would swallow a caps-heavy sentence as an `<h3>`).
 * Newlines are left as literal characters — pair with a `white-space:
 * pre-wrap` container to render them as line breaks. Sanitise the result
 * (e.g. with DOMPurify) before using it in `dangerouslySetInnerHTML`.
 */
export function inlineMarkdownToHtml(raw: string): string {
  return inlineMarkdown(escapeHtml(raw))
}
