// vite/create-application-file.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createApplicationFile,
  buildSlug,
  toSlugFragment,
  findUniqueSlug,
} from './create-application-file';

let tmp: string;
let tasksDir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'symphony-create-app-'));
  tasksDir = join(tmp, 'tasks');
  mkdirSync(tasksDir);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('toSlugFragment', () => {
  it('lowercases and replaces non-alphanumerics', () => {
    expect(toSlugFragment('Dwell Magazine')).toBe('dwell-magazine');
    expect(toSlugFragment('Sustainability Editor')).toBe('sustainability-editor');
  });
  it('collapses runs and trims edges', () => {
    expect(toSlugFragment('  Foo!!!Bar  ')).toBe('foo-bar');
    expect(toSlugFragment('a/b/c')).toBe('a-b-c');
  });
  it('returns empty string for all-punctuation input', () => {
    expect(toSlugFragment('!!!---???')).toBe('');
  });
});

describe('buildSlug', () => {
  it('joins company and role with a dash', () => {
    expect(buildSlug('Dwell Magazine', 'Sustainability Editor')).toBe(
      'dwell-magazine-sustainability-editor',
    );
  });
  it('caps at 80 characters and trims trailing dashes', () => {
    const s = buildSlug('A'.repeat(60), 'B'.repeat(60));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith('-')).toBe(false);
  });
  it('returns empty when both inputs slugify to nothing', () => {
    expect(buildSlug('!!!', '???')).toBe('');
  });
});

describe('findUniqueSlug', () => {
  it('returns the base slug when no file exists', () => {
    expect(findUniqueSlug(tasksDir, 'foo-bar')).toBe('foo-bar');
  });
  it('appends -2, -3 when collisions exist', () => {
    writeFileSync(join(tasksDir, 'apply-foo-bar.md'), 'x');
    expect(findUniqueSlug(tasksDir, 'foo-bar')).toBe('foo-bar-2');
    writeFileSync(join(tasksDir, 'apply-foo-bar-2.md'), 'x');
    expect(findUniqueSlug(tasksDir, 'foo-bar')).toBe('foo-bar-3');
  });
});

describe('createApplicationFile', () => {
  it('writes a parseable file with sensible defaults', () => {
    const r = createApplicationFile(
      tasksDir,
      { company: 'Dwell Magazine', role: 'Sustainability Editor' },
      new Date('2026-05-05T12:00:00Z'),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slug).toBe('dwell-magazine-sustainability-editor');
    expect(r.value.status).toBe('looking-at');
    expect(r.value.company).toBe('Dwell Magazine');
    expect(r.value.role).toBe('Sustainability Editor');
    expect(r.value.created).toBe('2026-05-05');
    expect(r.value.next_step).toBe('Submit application');
    expect(r.value.next_step_due).toBe('2026-05-10');
    expect(r.value.tags).toEqual([]);
    expect(r.value.linked).toEqual([]);

    const path = join(tasksDir, 'apply-dwell-magazine-sustainability-editor.md');
    const raw = readFileSync(path, 'utf8');
    expect(raw).toMatch(/^---\n/);
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('# Apply for Dwell Magazine — Sustainability Editor');
    expect(raw).toContain('## Steps');
    expect(raw).toContain('- [ ] Tailor resume');
    expect(raw).toContain('- [ ] Draft cover letter');
    expect(raw).toContain('- [ ] Submit application');
    expect(raw).toContain('- [ ] Follow up after 14 days if no response');
    expect(raw).toContain('linked: []');
    expect(raw).toContain('tags: []');
  });

  it('appends a numeric suffix on slug collision', () => {
    const a = createApplicationFile(
      tasksDir,
      { company: 'Acme', role: 'Engineer' },
      new Date('2026-05-05T12:00:00Z'),
    );
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.slug).toBe('acme-engineer');

    const b = createApplicationFile(
      tasksDir,
      { company: 'Acme', role: 'Engineer' },
      new Date('2026-05-05T12:00:00Z'),
    );
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.value.slug).toBe('acme-engineer-2');
    expect(existsSync(join(tasksDir, 'apply-acme-engineer.md'))).toBe(true);
    expect(existsSync(join(tasksDir, 'apply-acme-engineer-2.md'))).toBe(true);
  });

  it('honors caller-provided next_step and due date', () => {
    const r = createApplicationFile(
      tasksDir,
      {
        company: 'Acme',
        role: 'PM',
        next_step: 'Reach out to Yui',
        next_step_due: '2026-06-01',
      },
      new Date('2026-05-05T12:00:00Z'),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.next_step).toBe('Reach out to Yui');
    expect(r.value.next_step_due).toBe('2026-06-01');
  });

  it('supports comp band, location, remote, applied, tags', () => {
    const r = createApplicationFile(
      tasksDir,
      {
        company: 'Patagonia',
        role: 'LCA Lead',
        comp_low: 120000,
        comp_high: 150000,
        location: 'Ventura, CA',
        remote: 'hybrid',
        applied: '2026-05-04',
        tags: ['priority', 'sustainability'],
      },
      new Date('2026-05-05T12:00:00Z'),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.comp_low).toBe(120000);
    expect(r.value.comp_high).toBe(150000);
    expect(r.value.location).toBe('Ventura, CA');
    expect(r.value.remote).toBe('hybrid');
    expect(r.value.applied).toBe('2026-05-04');
    expect(r.value.tags).toEqual(['priority', 'sustainability']);
  });

  it('refuses missing company or role', () => {
    const r1 = createApplicationFile(
      tasksDir,
      { company: '', role: 'Engineer' },
    );
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.status).toBe(400);

    const r2 = createApplicationFile(
      tasksDir,
      { company: 'Acme', role: '' },
    );
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.status).toBe(400);
  });

  it('refuses status "decided" on the create path', () => {
    const r = createApplicationFile(
      tasksDir,
      { company: 'Acme', role: 'PM', status: 'decided' },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
    expect(r.error).toMatch(/decided/);
  });

  it('refuses a company/role pair that slugifies to nothing', () => {
    const r = createApplicationFile(
      tasksDir,
      { company: '!!!', role: '???' },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
  });

  it('refuses a path-traversal-style input by virtue of slug normalization', () => {
    // ../etc/passwd should slugify down to "etc-passwd", which is fine —
    // the protection is that we never let a slash through. Verify the file
    // lands inside tasksDir.
    const r = createApplicationFile(
      tasksDir,
      { company: '../etc', role: 'passwd' },
      new Date('2026-05-05T12:00:00Z'),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slug).toBe('etc-passwd');
    expect(existsSync(join(tasksDir, 'apply-etc-passwd.md'))).toBe(true);
  });
});
