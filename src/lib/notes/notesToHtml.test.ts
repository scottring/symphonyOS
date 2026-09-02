import { describe, it, expect } from 'vitest'
import { notesToHtml } from './notesToHtml'

describe('notesToHtml', () => {
  it('returns an empty string for empty or whitespace input', () => {
    expect(notesToHtml('')).toBe('')
    expect(notesToHtml('   \n\n  ')).toBe('')
    expect(notesToHtml(null)).toBe('')
    expect(notesToHtml(undefined)).toBe('')
  })

  it('passes HTML that already has block markup through untouched', () => {
    const html = '<p>Already <strong>rich</strong></p><ul><li>one</li></ul>'
    expect(notesToHtml(html)).toBe(html)
  })

  it('passes a bare table through untouched', () => {
    const html = '<table><tr><td>a</td></tr></table>'
    expect(notesToHtml(html)).toBe(html)
  })

  it('wraps a plain line in a paragraph', () => {
    expect(notesToHtml('Call the plumber')).toBe('<p>Call the plumber</p>')
  })

  it('splits blocks on blank lines', () => {
    expect(notesToHtml('One\n\nTwo')).toBe('<p>One</p><p>Two</p>')
  })

  it('turns single newlines inside a block into line breaks', () => {
    expect(notesToHtml('One\nTwo')).toBe('<p>One<br>Two</p>')
  })

  it('converts markdown headings', () => {
    expect(notesToHtml('# Big')).toBe('<h1>Big</h1>')
    expect(notesToHtml('## Middle')).toBe('<h2>Middle</h2>')
    expect(notesToHtml('### Small')).toBe('<h3>Small</h3>')
  })

  it('clamps deeper markdown headings to h3', () => {
    expect(notesToHtml('#### Deeper')).toBe('<h3>Deeper</h3>')
    expect(notesToHtml('###### Deepest')).toBe('<h3>Deepest</h3>')
  })

  it('treats an ALL-CAPS line as a heading', () => {
    expect(notesToHtml('WHAT I FOUND')).toBe('<h3>WHAT I FOUND</h3>')
  })

  it('does not treat a short or letterless line as a heading', () => {
    expect(notesToHtml('OK')).toBe('<p>OK</p>')
    expect(notesToHtml('2026-09-02')).toBe('<p>2026-09-02</p>')
  })

  it('emits an ALL-CAPS first line as a heading and the rest as its own block', () => {
    expect(notesToHtml('THE HEADER\nbody text here')).toBe(
      '<h3>THE HEADER</h3><p>body text here</p>',
    )
  })

  it('converts a bullet block to an unordered list', () => {
    expect(notesToHtml('- one\n* two\n• three')).toBe(
      '<ul><li><p>one</p></li><li><p>two</p></li><li><p>three</p></li></ul>',
    )
  })

  it('converts a numbered block to an ordered list', () => {
    expect(notesToHtml('1. one\n2) two')).toBe('<ol><li><p>one</p></li><li><p>two</p></li></ol>')
  })

  it('converts checkbox lines to a Tiptap task list', () => {
    expect(notesToHtml('- [ ] todo\n- [x] done')).toBe(
      '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li>' +
        '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>done</p></div></li>' +
        '</ul>',
    )
  })

  it('keeps order when only some lines of a block are list items', () => {
    expect(notesToHtml('Intro line\n- one\n- two\nOutro line')).toBe(
      '<p>Intro line</p><ul><li><p>one</p></li><li><p>two</p></li></ul><p>Outro line</p>',
    )
  })

  it('converts a quoted block to a blockquote', () => {
    expect(notesToHtml('> he said\n> she said')).toBe(
      '<blockquote><p>he said<br>she said</p></blockquote>',
    )
  })

  it('converts a lone rule to an hr', () => {
    expect(notesToHtml('---')).toBe('<hr>')
  })

  it('applies inline bold, italic and code', () => {
    expect(notesToHtml('**bold** and __also bold__')).toBe(
      '<p><strong>bold</strong> and <strong>also bold</strong></p>',
    )
    expect(notesToHtml('*soft* and _quiet_')).toBe('<p><em>soft</em> and <em>quiet</em></p>')
    expect(notesToHtml('run `npm test` now')).toBe('<p>run <code>npm test</code> now</p>')
  })

  it('leaves underscores and asterisks inside words alone', () => {
    expect(notesToHtml('use snake_case_names and 3*4*5')).toBe(
      '<p>use snake_case_names and 3*4*5</p>',
    )
  })

  it('leaves a bare URL as text', () => {
    expect(notesToHtml('See https://example.com/x')).toBe('<p>See https://example.com/x</p>')
  })

  it('escapes markup written as text', () => {
    expect(notesToHtml('Watch for <script>alert(1)</script> & friends')).toBe(
      '<p>Watch for &lt;script&gt;alert(1)&lt;/script&gt; &amp; friends</p>',
    )
  })

  it('formats a realistic agent note', () => {
    const raw = [
      'Here is what I found after reading the thread.',
      '',
      'WHAT HAPPENED',
      'Christian asked twice and got no reply.',
      '',
      'OPEN QUESTIONS',
      '- Does the contract renew automatically?',
      '- Who signs on their side?',
      '',
      'RECOMMENDATION',
      'Reply today with a short note.',
    ].join('\n')

    expect(notesToHtml(raw)).toBe(
      '<p>Here is what I found after reading the thread.</p>' +
        '<h3>WHAT HAPPENED</h3>' +
        '<p>Christian asked twice and got no reply.</p>' +
        '<h3>OPEN QUESTIONS</h3>' +
        '<ul><li><p>Does the contract renew automatically?</p></li>' +
        '<li><p>Who signs on their side?</p></li></ul>' +
        '<h3>RECOMMENDATION</h3>' +
        '<p>Reply today with a short note.</p>',
    )
  })

  it('is idempotent', () => {
    const inputs = [
      '',
      'Call the plumber',
      'One\n\nTwo',
      'One\nTwo',
      '# Big',
      'WHAT I FOUND',
      '- one\n- two',
      '1. one\n2) two',
      '- [ ] todo\n- [x] done',
      '> quoted',
      '---',
      '**bold** and `code`',
      'Watch for <script>alert(1)</script> & friends',
      'THE HEADER\nbody text here\n\n- a\n- b',
    ]
    for (const input of inputs) {
      const once = notesToHtml(input)
      expect(notesToHtml(once)).toBe(once)
    }
  })
})
