// vite/parse-application-file.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseApplicationFile,
  ParsedApplication,
  computeIsStalled,
} from './parse-application-file';

const fixture = (name: string) =>
  readFileSync(resolve('tests/fixtures/vault/tasks', name), 'utf8');

describe('parseApplicationFile', () => {
  it('parses a well-formed apply file', () => {
    const raw = fixture('apply-test-company.md');
    const result = parseApplicationFile('apply-test-company.md', raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const app = result.value;
    expect(app.slug).toBe('test-company');
    expect(app.status).toBe('applied');
    expect(app.company).toBe('Test Co');
    expect(app.comp_low).toBe(100000);
    expect(app.comp_high).toBe(120000);
    expect(app.applied).toBe('2026-04-15');
    expect(app.next_step_due).toBe('2026-04-29');
    expect(app.linked).toEqual(['[[resume-test]]']);
    expect(app.body).toContain('# Apply for Test Co');
  });

  it('rejects a file with an unknown status', () => {
    const raw = fixture('apply-malformed.md');
    const result = parseApplicationFile('apply-malformed.md', raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/status/i);
  });
});

describe('computeIsStalled', () => {
  const base: ParsedApplication = {
    slug: 's',
    type: 'task',
    domain: 'job-search',
    status: 'applied',
    company: 'C',
    role: 'R',
    comp_low: null,
    comp_high: null,
    location: null,
    remote: null,
    applied: '2026-01-01',
    next_step: 'follow up',
    next_step_due: '2026-01-15',
    created: '2026-01-01',
    tags: [],
    linked: [],
    filename: 'apply-s.md',
    body: '',
    isStalled: false,
  };

  it('returns true when next_step_due is in the past and status is not decided', () => {
    expect(
      computeIsStalled({ ...base, status: 'applied', next_step_due: '2025-01-01' }, new Date('2026-05-05')),
    ).toBe(true);
  });

  it('returns false when status is decided', () => {
    expect(
      computeIsStalled({ ...base, status: 'decided', next_step_due: '2025-01-01' }, new Date('2026-05-05')),
    ).toBe(false);
  });

  it('returns false when next_step_due is null', () => {
    expect(
      computeIsStalled({ ...base, next_step_due: null }, new Date('2026-05-05')),
    ).toBe(false);
  });

  it('returns false when next_step_due is today or later', () => {
    expect(
      computeIsStalled({ ...base, next_step_due: '2026-05-05' }, new Date('2026-05-05')),
    ).toBe(false);
    expect(
      computeIsStalled({ ...base, next_step_due: '2026-05-06' }, new Date('2026-05-05')),
    ).toBe(false);
  });
});
