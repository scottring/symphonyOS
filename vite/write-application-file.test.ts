// vite/write-application-file.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeApplicationFile,
  isValidSlug,
  resolveApplyPath,
} from './write-application-file';

let tmp: string;
let tasksDir: string;

const SAMPLE = `---\ntype: task\ndomain: job-search\nstatus: looking-at\ncompany: Sample Co\nrole: Engineer\ncomp_low: 100000\ncomp_high: 120000\nlocation: Boston\nremote: hybrid\napplied: null\nnext_step: Submit application\nnext_step_due: 2026-05-08\ncreated: 2026-05-04\ntags: []\nlinked:\n  - "[[resume-sample]]"\n---\n\n# Apply for Sample Co — Engineer\n\nBody content.\n\n- [ ] Submit application\n`;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'symphony-write-app-'));
  tasksDir = join(tmp, 'tasks');
  mkdirSync(tasksDir);
  writeFileSync(join(tasksDir, 'apply-sample-co.md'), SAMPLE);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('isValidSlug', () => {
  it('accepts lowercase alphanumeric with dashes', () => {
    expect(isValidSlug('new-balance')).toBe(true);
    expect(isValidSlug('a')).toBe(true);
    expect(isValidSlug('apply-3e-director')).toBe(true);
  });
  it('rejects path traversal attempts', () => {
    expect(isValidSlug('../etc/passwd')).toBe(false);
    expect(isValidSlug('foo/bar')).toBe(false);
    expect(isValidSlug('foo bar')).toBe(false);
    expect(isValidSlug('Foo')).toBe(false);
    expect(isValidSlug('-leading-dash')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });
});

describe('resolveApplyPath', () => {
  it('returns the apply path inside tasksDir for a valid slug', () => {
    const r = resolveApplyPath(tasksDir, 'sample-co');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toBe(join(tasksDir, 'apply-sample-co.md'));
  });
  it('refuses an invalid slug', () => {
    const r = resolveApplyPath(tasksDir, '../etc');
    expect(r.ok).toBe(false);
  });
});

describe('writeApplicationFile', () => {
  it('updates status and returns the new ParsedApplication', () => {
    const r = writeApplicationFile(tasksDir, 'sample-co', { status: 'applied' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('applied');
    const re = readFileSync(join(tasksDir, 'apply-sample-co.md'), 'utf8');
    expect(re).toMatch(/status: applied/);
    // body must be preserved verbatim
    expect(re).toContain('Body content.');
    expect(re).toContain('- [ ] Submit application');
  });

  it('sets and removes the decision field', () => {
    const r1 = writeApplicationFile(tasksDir, 'sample-co', {
      status: 'decided',
      decision: 'accepted',
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.value.status).toBe('decided');
    expect(r1.value.decision).toBe('accepted');

    const r2 = writeApplicationFile(tasksDir, 'sample-co', {
      status: 'applied',
      decision: null,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.value.decision).toBeUndefined();
    const re = readFileSync(join(tasksDir, 'apply-sample-co.md'), 'utf8');
    expect(re).not.toMatch(/^decision:/m);
  });

  it('rejects decided status without a decision', () => {
    const r = writeApplicationFile(tasksDir, 'sample-co', { status: 'decided' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
    expect(r.error).toMatch(/decision/i);
  });

  it('archives and unarchives', () => {
    const r1 = writeApplicationFile(tasksDir, 'sample-co', { archived: true });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.value.archived).toBe(true);
    expect(readFileSync(join(tasksDir, 'apply-sample-co.md'), 'utf8')).toMatch(/archived: true/);

    const r2 = writeApplicationFile(tasksDir, 'sample-co', { archived: false });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.value.archived).toBe(false);
    expect(readFileSync(join(tasksDir, 'apply-sample-co.md'), 'utf8')).not.toMatch(/^archived:/m);
  });

  it('returns 404 when the apply file does not exist', () => {
    const r = writeApplicationFile(tasksDir, 'no-such-slug', { archived: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });

  it('rejects invalid slugs without touching the filesystem', () => {
    const r = writeApplicationFile(tasksDir, '../passwd', { archived: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
  });

  it('preserves the body across multiple round trips', () => {
    writeApplicationFile(tasksDir, 'sample-co', { status: 'applied' });
    writeApplicationFile(tasksDir, 'sample-co', { next_step: 'Wait one week' });
    const re = readFileSync(join(tasksDir, 'apply-sample-co.md'), 'utf8');
    expect(re).toContain('# Apply for Sample Co — Engineer');
    expect(re).toContain('Body content.');
    expect(re).toContain('- [ ] Submit application');
  });
});
