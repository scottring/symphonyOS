// src/apps/job-pipeline/data/applicationsClient.ts
//
// Thin fetch wrapper around the dev/preview-only middleware that writes back
// to the vault apply files. Returns a discriminated result so callers can
// surface errors without throwing.
import type { VaultApplication } from 'virtual:vault-applications';

export interface ApplicationPatch {
  status?: 'looking-at' | 'applied' | 'interviewing' | 'decided';
  decision?: 'rejected' | 'accepted' | 'withdrawn' | null;
  applied?: string | null;
  next_step?: string | null;
  next_step_due?: string | null;
  archived?: boolean;
}

export interface NewApplicationInput {
  company: string;
  role: string;
  status?: 'looking-at' | 'applied' | 'interviewing' | 'decided';
  comp_low?: number | null;
  comp_high?: number | null;
  location?: string | null;
  remote?: 'onsite' | 'hybrid' | 'remote' | null;
  applied?: string | null;
  next_step?: string | null;
  next_step_due?: string | null;
  tags?: string[];
}

export type PatchResult =
  | { ok: true; application: VaultApplication }
  | { ok: false; error: string };

export type CreateResult =
  | { ok: true; application: VaultApplication }
  | { ok: false; error: string };

const NETWORK_FALLBACK_MESSAGE =
  "Couldn't reach the local write-back endpoint. Restart `npm run dev` (or `npm run preview` if that's how you run it). Static deploys don't support edits — use Obsidian instead.";

async function postVault<T>(
  url: string,
  body: unknown,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const e = err as Error;
    // The browser reports the same "Failed to fetch" / "NetworkError" for any
    // unreachable origin. The likeliest cause here is that the local Vite
    // middleware that handles writes isn't reachable — either the dev/preview
    // server isn't running, or this build was served as static files.
    if (
      e.name === 'TypeError' &&
      /failed to fetch|network/i.test(e.message)
    ) {
      return { ok: false, error: NETWORK_FALLBACK_MESSAGE };
    }
    return { ok: false, error: e.message };
  }
  if (!res.ok) {
    let error = `${res.status} ${res.statusText}`;
    try {
      const responseBody = (await res.json()) as { error?: string };
      if (responseBody.error) error = responseBody.error;
    } catch {
      // body wasn't JSON; keep the status text
    }
    return { ok: false, error };
  }
  const value = (await res.json()) as T;
  return { ok: true, value };
}

export async function patchApplication(
  slug: string,
  patch: ApplicationPatch,
): Promise<PatchResult> {
  const r = await postVault<VaultApplication>(
    `/__vault/applications/${encodeURIComponent(slug)}`,
    patch,
  );
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, application: r.value };
}

export async function createApplication(
  input: NewApplicationInput,
): Promise<CreateResult> {
  const r = await postVault<VaultApplication>('/__vault/applications', input);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, application: r.value };
}
