// vite/create-application-file.ts
//
// Creates a brand-new tasks/apply-<slug>.md file from a NewApplicationInput.
// Generates a unique slug from company+role, writes the file, and reparses
// to return a canonical ParsedApplication.
//
// This module deliberately has no Vite-specific imports so it can be unit
// tested against a temp directory.
//
// Companion to write-application-file.ts which handles in-place patches.

import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import matter from 'gray-matter';
import {
  parseApplicationFile,
  type ApplicationRemote,
  type ApplicationStatus,
  type ParsedApplication,
} from './parse-application-file';
import { matterOptions } from './yaml-engine';
import { isValidSlug } from './write-application-file';

export interface NewApplicationInput {
  company: string;
  role: string;
  status?: ApplicationStatus;
  comp_low?: number | null;
  comp_high?: number | null;
  location?: string | null;
  remote?: ApplicationRemote | null;
  applied?: string | null;
  next_step?: string | null;
  next_step_due?: string | null;
  tags?: string[];
}

export type CreateResult =
  | { ok: true; value: ParsedApplication }
  | { ok: false; status: number; error: string };

const VALID_STATUS: ApplicationStatus[] = [
  'looking-at',
  'applied',
  'interviewing',
  'decided',
];
const VALID_REMOTE: ApplicationRemote[] = ['onsite', 'hybrid', 'remote'];

/**
 * Convert a free-form string into a kebab-case ASCII slug fragment.
 * - lowercase
 * - replace runs of non-alphanumerics with `-`
 * - collapse multiple `-`
 * - trim leading/trailing `-`
 */
export function toSlugFragment(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build a slug from `company-role`, capped at 80 chars. Returns '' if both
 * inputs slugify to empty strings.
 */
export function buildSlug(company: string, role: string): string {
  const c = toSlugFragment(company);
  const r = toSlugFragment(role);
  let combined: string;
  if (c && r) combined = `${c}-${r}`;
  else combined = c || r;
  if (!combined) return '';
  if (combined.length > 80) combined = combined.slice(0, 80).replace(/-+$/, '');
  return combined;
}

/**
 * Find a unique slug under tasksDir by appending `-2`, `-3`, ... if the
 * base apply file already exists.
 */
export function findUniqueSlug(tasksDir: string, base: string): string {
  if (!existsSync(join(tasksDir, `apply-${base}.md`))) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!existsSync(join(tasksDir, `apply-${candidate}.md`))) return candidate;
  }
  // Pathological fallback — shouldn't realistically hit this.
  return `${base}-${Date.now()}`;
}

function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function addDaysIso(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Compose the markdown body for a freshly-tracked application with the
 * standard Steps checklist.
 */
function buildBody(company: string, role: string): string {
  return [
    '',
    `# Apply for ${company} — ${role}`,
    '',
    '## Steps',
    '',
    '- [ ] Tailor resume',
    '- [ ] Draft cover letter',
    '- [ ] Submit application',
    '- [ ] Follow up after 14 days if no response',
    '',
  ].join('\n');
}

/**
 * Create a new apply file in tasksDir. Returns the parsed application
 * representation on success.
 *
 * Defaults applied:
 * - status: 'looking-at'
 * - created: today (yyyy-mm-dd)
 * - next_step: 'Submit application' (if not provided)
 * - next_step_due: today + 5 days (if not provided)
 * - tags: []
 * - linked: []
 */
export function createApplicationFile(
  tasksDir: string,
  input: NewApplicationInput,
  now: Date = new Date(),
): CreateResult {
  const company = (input.company ?? '').trim();
  const role = (input.role ?? '').trim();
  if (!company) return { ok: false, status: 400, error: 'company is required' };
  if (!role) return { ok: false, status: 400, error: 'role is required' };

  const status: ApplicationStatus = input.status ?? 'looking-at';
  if (!VALID_STATUS.includes(status)) {
    return { ok: false, status: 400, error: `invalid status: ${status}` };
  }
  if (status === 'decided') {
    // We don't accept decisions on the create path — the create flow is for
    // tracking-only and should leave decision unset. Decided requires a
    // decision per parser; force the user to set it via the patch flow later.
    return {
      ok: false,
      status: 400,
      error: 'cannot create with status "decided"; set status after creating',
    };
  }

  if (input.remote != null && !VALID_REMOTE.includes(input.remote)) {
    return { ok: false, status: 400, error: `invalid remote: ${input.remote}` };
  }

  const base = buildSlug(company, role);
  if (!base) {
    return { ok: false, status: 400, error: 'company/role produced an empty slug' };
  }
  const slug = findUniqueSlug(tasksDir, base);
  if (!isValidSlug(slug)) {
    return { ok: false, status: 400, error: `generated slug invalid: ${slug}` };
  }

  // Path safety: refuse anything that would escape tasksDir.
  const filename = `apply-${slug}.md`;
  const full = resolve(join(tasksDir, filename));
  const tasksDirResolved = resolve(tasksDir);
  if (!full.startsWith(tasksDirResolved + sep)) {
    return { ok: false, status: 400, error: 'path traversal refused' };
  }

  const created = todayIso(now);
  const nextStep = input.next_step ?? 'Submit application';
  const nextStepDue = input.next_step_due ?? addDaysIso(5, now);
  const tags = Array.isArray(input.tags)
    ? input.tags.filter((t): t is string => typeof t === 'string')
    : [];

  // Build frontmatter object. Keep field ordering consistent with the rest
  // of the vault apply files for human readability.
  const data: Record<string, unknown> = {
    type: 'task',
    domain: 'job-search',
    status,
    company,
    role,
    comp_low: input.comp_low ?? null,
    comp_high: input.comp_high ?? null,
    location: input.location ?? null,
    remote: input.remote ?? null,
    applied: input.applied ?? null,
    next_step: nextStep,
    next_step_due: nextStepDue,
    created,
    tags,
    linked: [],
  };

  let stringified: string;
  try {
    stringified = matter.stringify(buildBody(company, role), data, matterOptions);
  } catch (err) {
    return { ok: false, status: 500, error: `stringify failed: ${(err as Error).message}` };
  }
  // Ensure trailing newline.
  if (!stringified.endsWith('\n')) stringified += '\n';

  try {
    writeFileSync(full, stringified, { flag: 'wx' });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EEXIST') {
      // Lost a race against another writer — surface as 409 so the client
      // can retry (the slug we picked is no longer unique).
      return { ok: false, status: 409, error: `apply file already exists: ${filename}` };
    }
    return { ok: false, status: 500, error: `write failed: ${e.message}` };
  }

  const reparsed = parseApplicationFile(filename, stringified);
  if (!reparsed.ok) {
    return {
      ok: false,
      status: 500,
      error: `wrote but failed to parse: ${reparsed.error}`,
    };
  }
  return { ok: true, value: reparsed.value };
}
