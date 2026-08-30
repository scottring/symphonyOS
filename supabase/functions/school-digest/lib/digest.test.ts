import { describe, it, expect } from 'vitest'
import { buildDigestPrompt, parseDigestResponse, renderDigestHtml, renderDigestText, digestDateLabel } from './digest'

const raw = JSON.stringify({
  sections: [
    {
      source: '3-01 Ms. Reynolds',
      toDo: [
        { title: 'Return picture day form', when: 'by Fri Sep 4', details: 'For Ella · $18 · from Ms. Reynolds' },
        { title: 'PTO meeting', when: 'Mon Aug 31 5:30pm' },
        { title: '' },
      ],
      goodToKnow: ['Notify the office of any dismissal change before 1pm.', 42],
      chatter: 'Photos from the first day and a few thank-yous.',
    },
    { source: '', toDo: [] },
    'garbage',
  ],
})

describe('parseDigestResponse', () => {
  it('keeps well-formed sections and drops the malformed', () => {
    const d = parseDigestResponse(raw)
    expect(d.sections).toHaveLength(1)
    const s = d.sections[0]
    expect(s.source).toBe('3-01 Ms. Reynolds')
    expect(s.toDo).toEqual([
      { title: 'Return picture day form', when: 'by Fri Sep 4', details: 'For Ella · $18 · from Ms. Reynolds' },
      { title: 'PTO meeting', when: 'Mon Aug 31 5:30pm', details: undefined },
    ])
    expect(s.goodToKnow).toEqual(['Notify the office of any dismissal change before 1pm.'])
    expect(s.chatter).toBe('Photos from the first day and a few thank-yous.')
  })

  it('tolerates a markdown fence and leading prose', () => {
    expect(parseDigestResponse('```json\n' + raw + '\n```').sections).toHaveLength(1)
    expect(parseDigestResponse('Here you go: ' + raw).sections).toHaveLength(1)
  })

  it('returns an empty digest for unparseable text', () => {
    expect(parseDigestResponse('nope')).toEqual({ sections: [] })
    expect(parseDigestResponse('[]')).toEqual({ sections: [] })
  })
})

describe('buildDigestPrompt', () => {
  it('names every source and carries the date', () => {
    const p = buildDigestPrompt([
      { label: 'A', text: '[2026-08-28, 09:00:00] Amy: hi' },
      { label: 'B', text: '[2026-08-28, 10:00:00] Ben: yo' },
    ], 'Fri, Aug 28')
    expect(p).toContain('=== A ===')
    expect(p).toContain('=== B ===')
    expect(p).toContain('Today is Fri, Aug 28')
    expect(p).toContain('Ben: yo')
  })
})

describe('render', () => {
  const d = parseDigestResponse(raw)

  it('html escapes and lists to-dos before the rest', () => {
    const html = renderDigestHtml({ sections: [{ ...d.sections[0], source: 'A & B <c>' }] }, 'Fri, Aug 28')
    expect(html).toContain('A &amp; B &lt;c&gt;')
    expect(html.indexOf('Return picture day form')).toBeLessThan(html.indexOf('Good to know'))
    expect(html.indexOf('Good to know')).toBeLessThan(html.indexOf('thank-yous'))
  })

  it('says so when there is nothing', () => {
    expect(renderDigestHtml({ sections: [] }, 'x')).toContain('Nothing new today.')
    expect(renderDigestText({ sections: [] }, 'x')).toContain('Nothing new today.')
  })

  it('renders a plain-text twin', () => {
    const t = renderDigestText(d, 'Fri, Aug 28')
    expect(t).toContain('3-01 MS. REYNOLDS')
    expect(t).toContain('- Return picture day form — by Fri Sep 4')
    expect(t).toContain('  For Ella · $18 · from Ms. Reynolds')
    expect(t).toContain('Good to know:')
  })

  it('labels the day in the household zone', () => {
    // 01:00Z on the 29th is still Friday the 28th in New York.
    expect(digestDateLabel(new Date('2026-08-29T01:00:00Z'), 'America/New_York')).toBe('Fri, Aug 28')
  })
})
