// src/hooks/useReferenceFacts.ts
import { useCallback } from 'react'
import type { Fact } from '@/types/home'

type UpdateSpace = (id: string, patch: { facts: Fact[] }) => Promise<void> | void

function validateFact(f: Fact): void {
  if (!f.label || f.label.trim().length === 0) throw new Error('Fact label is required')
  if (!f.value || f.value.trim().length === 0) throw new Error('Fact value is required')
  const valid: Fact['type'][] = ['wifi','paint','code','supply','measurement','freetext']
  if (!valid.includes(f.type)) throw new Error(`Unknown fact type: ${f.type}`)
}

export function useReferenceFacts(
  spaceId: string,
  facts: Fact[],
  updateSpace: UpdateSpace,
) {
  const addFact = useCallback((f: Fact) => {
    validateFact(f)
    void updateSpace(spaceId, { facts: [...facts, f] })
  }, [spaceId, facts, updateSpace])

  const updateFact = useCallback((idx: number, patch: Partial<Fact>) => {
    if (idx < 0 || idx >= facts.length) throw new Error('Index out of range')
    const next = facts.map((f, i) => i === idx ? { ...f, ...patch } : f)
    validateFact(next[idx])
    void updateSpace(spaceId, { facts: next })
  }, [spaceId, facts, updateSpace])

  const removeFact = useCallback((idx: number) => {
    if (idx < 0 || idx >= facts.length) return
    void updateSpace(spaceId, { facts: facts.filter((_, i) => i !== idx) })
  }, [spaceId, facts, updateSpace])

  return { addFact, updateFact, removeFact }
}
