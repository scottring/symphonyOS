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
    return { ok: false, error: (err as Error).message };
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
