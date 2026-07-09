// Every step type used by a config must have a registered component.
import { describe, it, expect } from 'vitest'
import './stepTypes'
import { getRegisteredTypes } from './GuidedSession'
import { SESSIONS } from './sessions'

describe('step registry', () => {
  it('covers every type used in the configs', () => {
    const used = new Set(Object.values(SESSIONS).flatMap((c) => c.steps.map((s) => s.type)))
    for (const t of used) expect(getRegisteredTypes(), `missing ${t}`).toContain(t)
  })
})
