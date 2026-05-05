// vite/parse-application-file.ts
import matter from 'gray-matter';
import { matterOptions } from './yaml-engine';

export type ApplicationStatus = 'looking-at' | 'applied' | 'interviewing' | 'decided';
export type ApplicationDecision = 'rejected' | 'accepted' | 'withdrawn';
export type ApplicationRemote = 'onsite' | 'hybrid' | 'remote';

export interface ParsedApplication {
  slug: string;
  type: 'task';
  domain: 'job-search';
  status: ApplicationStatus;
  decision?: ApplicationDecision;
  company: string;
  role: string;
  comp_low: number | null;
  comp_high: number | null;
  location: string | null;
  remote: ApplicationRemote | null;
  applied: string | null;
  next_step: string | null;
  next_step_due: string | null;
  created: string;
  tags: string[];
  linked: string[];
  filename: string;
  body: string;
  isStalled: boolean;
  archived: boolean;
}

export type ParseResult =
  | { ok: true; value: ParsedApplication }
  | { ok: false; error: string };

const VALID_STATUS: ApplicationStatus[] = [
  'looking-at',
  'applied',
  'interviewing',
  'decided',
];
const VALID_DECISION: ApplicationDecision[] = [
  'rejected',
  'accepted',
  'withdrawn',
];
const VALID_REMOTE: ApplicationRemote[] = ['onsite', 'hybrid', 'remote'];

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  // gray-matter parses unquoted YAML dates (e.g. `applied: 2026-04-15`) into
  // Date objects. Normalize back to a yyyy-mm-dd string so downstream
  // consumers see a consistent shape.
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function slugFromFilename(filename: string): string {
  return filename.replace(/^apply-/, '').replace(/\.md$/, '');
}

export function parseApplicationFile(
  filename: string,
  raw: string,
): ParseResult {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw, matterOptions);
  } catch (err) {
    return { ok: false, error: `frontmatter parse error: ${(err as Error).message}` };
  }
  const fm = parsed.data as Record<string, unknown>;

  const status = fm.status;
  if (typeof status !== 'string' || !VALID_STATUS.includes(status as ApplicationStatus)) {
    return { ok: false, error: `invalid status "${String(status)}"; expected one of ${VALID_STATUS.join(', ')}` };
  }

  let decision: ApplicationDecision | undefined;
  if (status === 'decided') {
    if (typeof fm.decision !== 'string' || !VALID_DECISION.includes(fm.decision as ApplicationDecision)) {
      return { ok: false, error: `decided status requires decision in ${VALID_DECISION.join(', ')}` };
    }
    decision = fm.decision as ApplicationDecision;
  }

  const remote = asString(fm.remote);
  const remoteValid = remote && VALID_REMOTE.includes(remote as ApplicationRemote)
    ? (remote as ApplicationRemote)
    : null;

  const company = asString(fm.company);
  if (!company) return { ok: false, error: 'company is required' };
  const role = asString(fm.role);
  if (!role) return { ok: false, error: 'role is required' };
  const created = asString(fm.created);
  if (!created) return { ok: false, error: 'created is required' };

  const tags = Array.isArray(fm.tags) ? (fm.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [];
  const linked = Array.isArray(fm.linked) ? (fm.linked as unknown[]).filter((t): t is string => typeof t === 'string') : [];

  const next_step_due = asString(fm.next_step_due);

  const value: ParsedApplication = {
    slug: slugFromFilename(filename),
    type: 'task',
    domain: 'job-search',
    status: status as ApplicationStatus,
    decision,
    company,
    role,
    comp_low: asNumber(fm.comp_low),
    comp_high: asNumber(fm.comp_high),
    location: asString(fm.location),
    remote: remoteValid,
    applied: asString(fm.applied),
    next_step: asString(fm.next_step),
    next_step_due,
    created,
    tags,
    linked,
    filename,
    body: parsed.content,
    isStalled: false, // computed below
    archived: fm.archived === true,
  };

  value.isStalled = computeIsStalled(value, new Date());

  return { ok: true, value };
}

export function computeIsStalled(app: ParsedApplication, today: Date): boolean {
  if (app.archived) return false;
  if (app.status === 'decided') return false;
  if (!app.next_step_due) return false;
  // Compare ISO date strings only (yyyy-mm-dd) to avoid TZ skew.
  const todayIso = today.toISOString().slice(0, 10);
  return app.next_step_due < todayIso;
}
