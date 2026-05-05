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

export type PatchResult =
  | { ok: true; application: VaultApplication }
  | { ok: false; error: string };

export async function patchApplication(
  slug: string,
  patch: ApplicationPatch,
): Promise<PatchResult> {
  let res: Response;
  try {
    res = await fetch(`/__vault/applications/${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
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
      return {
        ok: false,
        error:
          "Couldn't reach the local write-back endpoint. Restart `npm run dev` (or `npm run preview` if that's how you run it). Static deploys don't support edits — use Obsidian instead.",
      };
    }
    return { ok: false, error: e.message };
  }
  if (!res.ok) {
    let error = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) error = body.error;
    } catch {
      // body wasn't JSON; keep the status text
    }
    return { ok: false, error };
  }
  const application = (await res.json()) as VaultApplication;
  return { ok: true, application };
}
