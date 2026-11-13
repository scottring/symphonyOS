import { describe, it, expect } from 'vitest'
import { sourceMark } from './sourceMark'

describe('sourceMark (2026-11-13)', () => {
  it('marks an Amazon task and an emailed one by its sender; nothing else', () => {
    expect(sourceMark({ title: 'amazon returns' })?.label).toBe('Amazon')
    const school = sourceMark({ title: 'Return audition slip', captureId: 'c1', notes: 'From Oak Hill School · Auditions\n\n“bring the slip”' })
    expect(school).toMatchObject({ letter: 'O', label: 'Oak Hill School' })
    expect(sourceMark({ title: 'Return audition slip', notes: 'From Oak Hill School · Auditions' })).toBeNull()
    expect(sourceMark({ title: 'Book the neurologist' })).toBeNull()
  })
})
