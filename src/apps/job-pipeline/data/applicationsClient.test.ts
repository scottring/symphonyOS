// src/apps/job-pipeline/data/applicationsClient.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createApplication,
  patchApplication,
} from './applicationsClient';
import type { VaultApplication } from 'virtual:vault-applications';

const SAMPLE_APP: VaultApplication = {
  slug: 'acme-engineer',
  type: 'task',
  domain: 'job-search',
  status: 'looking-at',
  company: 'Acme',
  role: 'Engineer',
  comp_low: null,
  comp_high: null,
  location: null,
  remote: null,
  applied: null,
  next_step: 'Submit application',
  next_step_due: '2026-05-10',
  created: '2026-05-05',
  tags: [],
  linked: [],
  filename: 'apply-acme-engineer.md',
  body: '',
  isStalled: false,
  archived: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createApplication', () => {
  it('POSTs to /__vault/applications and returns the new VaultApplication', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_APP), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const r = await createApplication({ company: 'Acme', role: 'Engineer' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.application.slug).toBe('acme-engineer');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/__vault/applications',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company: 'Acme', role: 'Engineer' }),
      }),
    );
  });

  it('forwards optional fields verbatim in the request body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_APP), { status: 201 }),
    );

    await createApplication({
      company: 'Patagonia',
      role: 'LCA Lead',
      comp_low: 120000,
      comp_high: 150000,
      location: 'Ventura, CA',
      remote: 'hybrid',
      tags: ['priority'],
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      company: 'Patagonia',
      role: 'LCA Lead',
      comp_low: 120000,
      comp_high: 150000,
      location: 'Ventura, CA',
      remote: 'hybrid',
      tags: ['priority'],
    });
  });

  it('returns a structured error when the server responds with an error JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'company is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const r = await createApplication({ company: '', role: 'Engineer' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('company is required');
  });

  it('returns a friendly error when fetch throws a TypeError network failure', async () => {
    const err = new TypeError('Failed to fetch');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(err);
    const r = await createApplication({ company: 'Acme', role: 'Engineer' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/local write-back endpoint/i);
  });
});

describe('patchApplication', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_APP), { status: 200 }),
    );
  });

  it('POSTs to /__vault/applications/<slug>', async () => {
    const r = await patchApplication('acme-engineer', { status: 'applied' });
    expect(r.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/__vault/applications/acme-engineer',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
