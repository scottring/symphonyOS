import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

describe('transaction catalog coverage map', () => {
  it('accounts for every catalog row without presenting planned cases as passed', () => {
    const root = resolve(__dirname, '../..')
    const catalog = JSON.parse(readFileSync(resolve(__dirname, 'coverage.json'), 'utf8'))
    const text = readFileSync(resolve(root, catalog.source), 'utf8').split('## Known gaps')[0]
    const intents = text.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Intent') && !line.startsWith('| Behavior')).map(line => line.split('|')[1].trim())
    expect(catalog.entries.map(e => e.intent)).toEqual(intents)
    expect(new Set(catalog.entries.map(e => e.id)).size).toBe(catalog.entries.length)
    for (const entry of catalog.entries) {
      expect(['needed', 'partial', 'unsupported-boundary-test-needed']).toContain(entry.automation)
      expect(entry.supportingTestFiles.length).toBeGreaterThan(0)
      for (const file of entry.supportingTestFiles) expect(existsSync(resolve(root, file))).toBe(true)
      for (const id of entry.scenarios) expect(existsSync(resolve(__dirname, 'scenarios', `${id}.json`))).toBe(true)
    }
  })
})
