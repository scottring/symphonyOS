// vite/write-application-file.ts
//
// Helper that takes a slug + a frontmatter patch and rewrites the apply file
// at <tasksDir>/apply-<slug>.md, preserving the body. Returns the new
// ParsedApplication or an error.
//
// This module deliberately has no Vite-specific imports so it can be unit
// tested against a temp directory.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import matter from 'gray-matter';
import {
  parseApplicationFile,
  type ApplicationDecision,
  type ApplicationStatus,
  type ParsedApplication,
} from './parse-application-file';
import { matterOptions } from './yaml-engine';

export interface ApplicationPatch {
  status?: ApplicationStatus;
  decision?: ApplicationDecision | null;
  applied?: string | null;
  next_step?: string | null;
  next_step_due?: string | null;
  archived?: boolean;
}

export type WriteResult =
  | { ok: true; value: ParsedApplication }
  | { ok: false; status: number; error: string };

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/**
 * Resolve a slug to its absolute apply file path inside tasksDir, refusing
 * any slug that resolves outside tasksDir or violates the slug format.
 */
export function resolveApplyPath(
  tasksDir: string,
  slug: string,
): { ok: true; path: string } | { ok: false; status: number; error: string } {
  if (!isValidSlug(slug)) {
    return { ok: false, status: 400, error: `invalid slug: ${slug}` };
  }
  const filename = `apply-${slug}.md`;
  const full = resolve(join(tasksDir, filename));
  const tasksDirResolved = resolve(tasksDir);
  if (!full.startsWith(tasksDirResolved + sep)) {
    return { ok: false, status: 400, error: 'path traversal refused' };
  }
  return { ok: true, path: full };
}

/**
 * Apply a frontmatter patch to the apply file, write it back, and return the
 * new ParsedApplication.
 *
 * - Body content is preserved exactly.
 * - Keys that exist in the original frontmatter are updated in place.
 * - When `decision` is set to `null` it is removed from the frontmatter.
 * - When `archived` is set to `false` it is removed (default state).
 */
export function writeApplicationFile(
  tasksDir: string,
  slug: string,
  patch: ApplicationPatch,
): WriteResult {
  const resolved = resolveApplyPath(tasksDir, slug);
  if (!resolved.ok) return resolved;
  const path = resolved.path;
  if (!existsSync(path)) {
    return { ok: false, status: 404, error: `not found: apply-${slug}.md` };
  }

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    return { ok: false, status: 500, error: `read failed: ${(err as Error).message}` };
  }

  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw, matterOptions);
  } catch (err) {
    return { ok: false, status: 500, error: `frontmatter parse error: ${(err as Error).message}` };
  }

  const data = { ...(parsed.data as Record<string, unknown>) };

  if (patch.status !== undefined) {
    data.status = patch.status;
  }
  if (patch.decision !== undefined) {
    if (patch.decision === null) {
      delete data.decision;
    } else {
      data.decision = patch.decision;
    }
  }
  if (patch.applied !== undefined) {
    // gray-matter writes `null` as `null`. Use string 'null' to mirror existing
    // vault convention (apply files use `applied: null` literal).
    data.applied = patch.applied;
  }
  if (patch.next_step !== undefined) {
    data.next_step = patch.next_step;
  }
  if (patch.next_step_due !== undefined) {
    data.next_step_due = patch.next_step_due;
  }
  if (patch.archived !== undefined) {
    if (patch.archived) {
      data.archived = true;
    } else {
      delete data.archived;
    }
  }

  // Validate the patched data BEFORE writing, so we never persist an invalid
  // file that the parser would reject on next load.
  if (data.status === 'decided' && !data.decision) {
    return {
      ok: false,
      status: 400,
      error: 'decided status requires a decision (rejected | accepted | withdrawn)',
    };
  }

  let stringified: string;
  try {
    stringified = matter.stringify(parsed.content, data, matterOptions);
  } catch (err) {
    return { ok: false, status: 500, error: `stringify failed: ${(err as Error).message}` };
  }

  try {
    writeFileSync(path, stringified);
  } catch (err) {
    return { ok: false, status: 500, error: `write failed: ${(err as Error).message}` };
  }

  // Re-parse to return the canonical ParsedApplication shape.
  const reparsed = parseApplicationFile(`apply-${slug}.md`, stringified);
  if (!reparsed.ok) {
    return { ok: false, status: 500, error: `reparse failed: ${reparsed.error}` };
  }
  return { ok: true, value: reparsed.value };
}
