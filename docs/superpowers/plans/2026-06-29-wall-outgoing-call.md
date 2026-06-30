# Wall-v2 Outgoing Call Interface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a kid place an outbound call from the family wall by tapping a person's face — tap → confirm → in-house handset rings → lift → bridged to the callee.

**Architecture:** Most of the dial path already exists (`placeCall` client → `place-call` edge fn → kid-phone `initiateCall` with `bridgeTo:'handset'`, plus the `current_call` → `CallerIdTakeover` overlay). This plan adds (a) a contacts display feed from kid-phone (no phone numbers leave the backend), (b) `contactId`-based dialing that resolves the number server-side and enforces the allowlist, and (c) a new full-screen **Phone** screen on wall-v2 with big contact buttons and a confirm step.

**Tech Stack:** kid-phone — Firebase Functions v2 (TypeScript, ESM `.js` imports), Firestore, vitest. Web admin — React/Vite (`web/`). symphonyOS — Supabase Edge Functions (Deno), React + Vite + Tailwind, lucide-react icons, vitest + testing-library.

## Global Constraints

- kid-phone functions use **ESM imports with `.js` extensions** (e.g. `import { x } from './data.js'`) even from `.ts` source. Match this exactly.
- The shared secret between kid-phone and Symphony is **`CALL_EVENTS_SECRET`** on the kid-phone side and **`KIDPHONE_CALL_SECRET`** on the Symphony side — same value, different env names. Reuse it; do not invent a new secret.
- **No phone numbers may be returned to the browser.** The contacts feed returns display fields only (`contactId, name, photoURL, favorite, enabled`). Dialing is by `contactId`; the number is resolved server-side in `initiateCall`.
- Symphony edge functions that take a secret-only POST must set `verify_jwt = false` in `supabase/config.toml`; functions called by the authenticated wall keep JWT verification on (Bearer token). The contacts feed and dial path are called by the **logged-in wall**, so they use Bearer auth like the existing `place-call`.
- wall-v2 action dock is a fixed **6-button grid** (`grid-cols-6`). Do not add a 7th button — replace the existing coming-soon `photo` action with the new `phone` action.
- Distinctive ring cadence is **out of scope** (v2). v1 uses the normal ring.
- Firestore data-layer tests run only under the emulator (`describe.skipIf(!HAS_EMULATOR)`); pure-function tests run without it.

---

## File Structure

**kid-phone (`~/Developer/kid-phone`)**
- `functions/src/data.ts` — add `ContactListItem`, `loadContactList()`, `loadContactById()`.
- `functions/src/listContacts.ts` — NEW secret-gated endpoint returning the display feed.
- `functions/src/index.ts` — export `listContacts`.
- `functions/src/initiateCall.ts` — accept `contactId`; resolve number/name/photo server-side; enforce `enabled`.
- `web/src/components/Contacts.jsx` — add a ⭐ favorite toggle per contact row.

**symphonyOS (`~/Developer/Developer/symphonyOS`)**
- `supabase/functions/list-contacts/index.ts` + `lib/validate.ts` — NEW proxy edge fn (Bearer auth → kid-phone `listContacts`).
- `supabase/functions/place-call/lib/validate.ts` + `index.ts` — accept `contactId`, pass through.
- `src/lib/telephony/placeCall.ts` — add `contactId` to the request type.
- `src/lib/telephony/listContacts.ts` — NEW client for the contacts feed.
- `src/hooks/useKidPhoneContacts.ts` — NEW hook: fetch + cache-last-good in localStorage.
- `src/components/wall-v2/WallV2PhoneScreen.tsx` — NEW full-screen grid + confirm overlay.
- `src/components/wall-v2/wallV2Mock.ts` — swap `photo` dock action → `phone`.
- `src/components/wall-v2/WallV2Shell.tsx` — `showPhone` state, `case 'phone'`, render the screen.

---

## Task 1: kid-phone contacts data layer

**Files:**
- Modify: `functions/src/data.ts`
- Test: `functions/src/data.test.ts`

**Interfaces:**
- Produces: `interface ContactListItem { contactId: string; name: string; photoURL?: string; favorite: boolean; enabled: boolean }`
- Produces: `loadContactList(db: Firestore): Promise<ContactListItem[]>` — display fields only, enabled contacts only, **no phoneNumber**.
- Produces: `loadContactById(db: Firestore, id: string): Promise<{ name: string; phoneNumber: string; photoURL?: string; enabled: boolean } | null>`

- [ ] **Step 1: Write the failing tests** — add inside the existing `describe.skipIf(!HAS_EMULATOR)('data access', ...)` block in `functions/src/data.test.ts` (after the existing contacts tests). Also add `favorite: true` to the seeded `grandma` doc in that block's `beforeAll`.

In `beforeAll`, change the grandma seed to include favorite:
```ts
await db.collection('contacts').doc('grandma').set({
  name: 'Grandma', phoneNumber: '+13015551234', enabled: true, favorite: true,
  quietHours: [{ start: '13:00', end: '15:00', days: [0,1,2,3,4,5,6] }],
  photoURL: 'https://example.com/grandma.jpg',
});
```
Add tests:
```ts
it('loadContactList returns display fields only, no phone number', async () => {
  const list = await loadContactList(db);
  const grandma = list.find((c) => c.name === 'Grandma');
  expect(grandma).toBeTruthy();
  expect(grandma?.contactId).toBe('grandma');
  expect(grandma?.favorite).toBe(true);
  expect(grandma?.enabled).toBe(true);
  expect((grandma as Record<string, unknown>).phoneNumber).toBeUndefined();
});

it('loadContactList omits disabled contacts', async () => {
  await db.collection('contacts').doc('blocked').set({ name: 'Blocked', phoneNumber: '+13015550000', enabled: false });
  const list = await loadContactList(db);
  expect(list.find((c) => c.name === 'Blocked')).toBeFalsy();
});

it('loadContactById returns the full contact, or null when missing/unknown', async () => {
  const c = await loadContactById(db, 'grandma');
  expect(c).toMatchObject({ name: 'Grandma', phoneNumber: '+13015551234', enabled: true });
  expect(await loadContactById(db, 'nobody')).toBeNull();
});
```
Add the import at the top of the test file:
```ts
import { loadContacts, loadSettings, logCall, sanitizeWindows, loadContactList, loadContactById } from './data.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Developer/kid-phone/functions && firebase emulators:exec --only firestore "npx vitest run src/data.test.ts"`
Expected: FAIL — `loadContactList is not a function` (and `loadContactById`). (If no emulator is installed, the data-access block is skipped; in that case rely on Task 3's pure tests and verify this task manually at deploy time — note the skip in the commit message.)

- [ ] **Step 3: Implement in `functions/src/data.ts`** — append after `loadContacts`:
```ts
/** Display feed for the wall phone book — NO phone numbers, enabled contacts only. */
export interface ContactListItem {
  contactId: string;
  name: string;
  photoURL?: string;
  favorite: boolean;
  enabled: boolean;
}

export async function loadContactList(db: Firestore): Promise<ContactListItem[]> {
  const snap = await db.collection('contacts').get();
  return snap.docs
    .map((d) => {
      const v = d.data();
      return {
        contactId: d.id,
        name: typeof v.name === 'string' ? v.name : '',
        photoURL: typeof v.photoURL === 'string' ? v.photoURL : undefined,
        favorite: !!v.favorite,
        enabled: !!v.enabled,
      };
    })
    .filter((c) => c.enabled && c.name);
}

export async function loadContactById(
  db: Firestore,
  id: string,
): Promise<{ name: string; phoneNumber: string; photoURL?: string; enabled: boolean } | null> {
  const doc = await db.collection('contacts').doc(id).get();
  if (!doc.exists) return null;
  const v = doc.data() as Record<string, unknown>;
  if (typeof v.phoneNumber !== 'string' || typeof v.name !== 'string') return null;
  return {
    name: v.name,
    phoneNumber: v.phoneNumber,
    photoURL: typeof v.photoURL === 'string' ? v.photoURL : undefined,
    enabled: !!v.enabled,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Developer/kid-phone/functions && firebase emulators:exec --only firestore "npx vitest run src/data.test.ts"`
Expected: PASS (or SKIPPED if no emulator — then `npx tsc --noEmit` must be clean).

- [ ] **Step 5: Commit**
```bash
cd ~/Developer/kid-phone && git add functions/src/data.ts functions/src/data.test.ts
git commit -m "feat(kid-phone): contacts display feed + by-id resolver for wall dialing"
```

---

## Task 2: kid-phone `listContacts` endpoint

**Files:**
- Create: `functions/src/listContacts.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/listContacts.test.ts`

**Interfaces:**
- Consumes: `loadContactList` (Task 1).
- Produces: `validateListSecret(provided: string | undefined, expected: string): boolean` (pure, testable).
- Produces: HTTP endpoint `listContacts` — POST, header `x-kidphone-secret`, returns `{ contacts: ContactListItem[] }`; 401 on bad/missing secret.

- [ ] **Step 1: Write the failing test** — `functions/src/listContacts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateListSecret } from './listContacts.js';

describe('validateListSecret', () => {
  it('rejects missing or wrong secret', () => {
    expect(validateListSecret(undefined, 's3cr3t')).toBe(false);
    expect(validateListSecret('nope', 's3cr3t')).toBe(false);
  });
  it('rejects when no expected secret is configured', () => {
    expect(validateListSecret('anything', '')).toBe(false);
  });
  it('accepts the matching secret', () => {
    expect(validateListSecret('s3cr3t', 's3cr3t')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Developer/kid-phone/functions && npx vitest run src/listContacts.test.ts`
Expected: FAIL — cannot find module `./listContacts.js`.

- [ ] **Step 3: Implement `functions/src/listContacts.ts`**
```ts
// LIST-CONTACTS — display feed for the wall phone book. Secret-gated (reuses
// CALL_EVENTS_SECRET). Returns name/photo/favorite/enabled per contact and
// NEVER phone numbers — the wall dials by contactId, resolved server-side in
// initiateCall.

import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadContactList } from './data.js';

const LIST_SECRET = defineString('CALL_EVENTS_SECRET', { default: '' });

if (getApps().length === 0) initializeApp();

/** Pure: the request secret must be present, configured, and match. */
export function validateListSecret(provided: string | undefined, expected: string): boolean {
  return !!expected && provided === expected;
}

export const listContacts = onRequest({ region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  if (!validateListSecret(req.header('x-kidphone-secret') ?? undefined, LIST_SECRET.value())) {
    res.status(401).json({ error: 'invalid or missing kidphone secret' });
    return;
  }
  try {
    const contacts = await loadContactList(getFirestore());
    res.status(200).json({ contacts });
  } catch (e) {
    console.error('listContacts failed:', e);
    res.status(502).json({ error: e instanceof Error ? e.message : 'firestore error' });
  }
});
```

- [ ] **Step 4: Export it** — add to `functions/src/index.ts`:
```ts
export { listContacts } from './listContacts.js';
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd ~/Developer/kid-phone/functions && npx vitest run src/listContacts.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**
```bash
cd ~/Developer/kid-phone && git add functions/src/listContacts.ts functions/src/listContacts.test.ts functions/src/index.ts
git commit -m "feat(kid-phone): listContacts endpoint (secret-gated display feed)"
```

---

## Task 3: kid-phone `initiateCall` — dial by `contactId` (allowlist enforcement)

**Files:**
- Modify: `functions/src/initiateCall.ts`
- Test: `functions/src/initiateCall.test.ts`

**Interfaces:**
- Consumes: `loadContactById` (Task 1), existing `normalizeToE164`, `buildBridgeCallParams`, `chooseBridgeTarget`.
- Changes: `InitiateBody` gains `contactId?: string`. `validateInitiate` returns `{ ok: true; mode: 'bridge'; toE164: string | null; contactId: string | null }` — accepts EITHER a normalizable `toNumber` OR a `contactId`.
- Behavior: when `contactId` is given, the handler resolves it via `loadContactById`; rejects `404` if missing, `403` if not `enabled`, `422` if the stored number is unnormalizable; otherwise dials it and publishes the takeover with the resolved name/photo.

- [ ] **Step 1: Write the failing tests** — extend the `validateInitiate` describe block in `functions/src/initiateCall.test.ts`:
```ts
it('accepts a contactId with no toNumber (resolved later)', () => {
  const r = validateInitiate(SECRET, SECRET, { contactId: 'grandma' });
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.contactId).toBe('grandma');
    expect(r.toE164).toBeNull();
  }
});

it('still accepts a toNumber and sets contactId null', () => {
  const r = validateInitiate(SECRET, SECRET, { toNumber: '(612) 555-0148' });
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.toE164).toBe('+16125550148');
    expect(r.contactId).toBeNull();
  }
});

it('rejects when neither toNumber nor contactId is given', () => {
  expect(validateInitiate(SECRET, SECRET, {})).toMatchObject({ ok: false, status: 400 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Developer/kid-phone/functions && npx vitest run src/initiateCall.test.ts`
Expected: FAIL — `contactId` missing on the validation result / type errors.

- [ ] **Step 3: Implement** — in `functions/src/initiateCall.ts`:

(a) Add the import:
```ts
import { loadSettings, logCall, loadContactById } from './data.js';
```
(replace the existing `import { loadSettings, logCall } from './data.js';` line).

(b) Extend `InitiateBody` (add the field):
```ts
export interface InitiateBody {
  toNumber?: string;
  contactId?: string;
  mode?: 'bridge' | 'agent';
  bridgeTo?: BridgeTo;
  name?: string;
  photoURL?: string;
  context?: string;
}
```

(c) Replace the `InitiateValidation` type and `validateInitiate` body:
```ts
export type InitiateValidation =
  | { ok: true; mode: 'bridge'; toE164: string | null; contactId: string | null }
  | { ok: false; status: number; error: string };

/** Pure validation: secret, mode (agent gated), and either a number or a contactId. */
export function validateInitiate(
  provided: string | undefined,
  expectedSecret: string,
  body: Partial<InitiateBody>,
): InitiateValidation {
  if (!expectedSecret || provided !== expectedSecret) {
    return { ok: false, status: 401, error: 'invalid or missing kidphone secret' };
  }
  const mode = body.mode ?? 'bridge';
  if (mode === 'agent') return { ok: false, status: 403, error: 'agent mode not enabled (Phase 5)' };
  if (mode !== 'bridge') return { ok: false, status: 400, error: 'mode must be bridge|agent' };
  if (body.contactId) return { ok: true, mode, toE164: null, contactId: body.contactId };
  const toE164 = body.toNumber ? normalizeToE164(body.toNumber) : null;
  if (!toE164) return { ok: false, status: 400, error: 'toNumber or contactId required' };
  return { ok: true, mode, toE164, contactId: null };
}
```

(d) In the `initiateCall` handler, resolve the contact before building params. Replace the block from `try {` down to the `const params = buildBridgeCallParams(...)` line with:
```ts
  try {
    const now = new Date();
    const db = getFirestore();

    // Resolve a contactId → number/name/photo server-side (allowlist enforcement).
    let toE164 = v.toE164;
    let name = (req.body as InitiateBody)?.name;
    let photoURL = (req.body as InitiateBody)?.photoURL;
    if (v.contactId) {
      const c = await loadContactById(db, v.contactId);
      if (!c) { res.status(404).json({ error: 'contact not found' }); return; }
      if (!c.enabled) { res.status(403).json({ error: 'contact not allowed' }); return; }
      const e164 = normalizeToE164(c.phoneNumber);
      if (!e164) { res.status(422).json({ error: 'contact number invalid' }); return; }
      toE164 = e164;
      name = c.name;
      photoURL = c.photoURL;
    }
    if (!toE164) { res.status(400).json({ error: 'no number to dial' }); return; }

    const settings = await loadSettings(db).catch(() => null);
    if (settings && isQuietNow(now, TIMEZONE.value(), settings.quietHours)) {
      res.status(409).json({ error: 'quiet hours' });
      return;
    }

    const client = twilio(accountSid, TWILIO_AUTH_TOKEN.value());
    const params = buildBridgeCallParams(target, TWILIO_NUMBER.value(), toE164, CALL_STATUS_URL.value());
    const call = await client.calls.create(params);
```

(e) Update the `publishCallEvent` and `logCall` calls in that handler to use the resolved `toE164`, `name`, `photoURL` (replace the inline `v.toE164` / `req.body...name` / `req.body...photoURL` references):
```ts
    await publishCallEvent(CALL_EVENTS_URL.value(), INITIATE_SECRET.value(), {
      callSid: call.sid,
      direction: 'outbound',
      state: 'ringing',
      name,
      number: toE164,
      photoURL,
    });

    await logCall(db, {
      dialedNumber: toE164,
      matchedName: name ?? null,
      allowed: true,
      reason: 'ok',
      at: now,
      direction: 'outbound',
    }).catch((e) => console.error('logCall failed:', e));
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd ~/Developer/kid-phone/functions && npx vitest run src/initiateCall.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**
```bash
cd ~/Developer/kid-phone && git add functions/src/initiateCall.ts functions/src/initiateCall.test.ts
git commit -m "feat(kid-phone): dial by contactId with server-side allowlist enforcement"
```

---

## Task 4: kid-phone web — ⭐ favorite toggle

**Files:**
- Modify: `web/src/components/Contacts.jsx`

**Interfaces:**
- Consumes: existing Firestore `updateDoc(ref, ...)` pattern in `ContactRow`.
- Produces: per-contact `favorite` boolean written to the `contacts` doc; absence = not a favorite.

- [ ] **Step 1: Add the toggle to `ContactRow`** — in `web/src/components/Contacts.jsx`, destructure `favorite` and add a handler. Change the line `const { id, name, phoneNumber, enabled } = contact;` to:
```jsx
  const { id, name, phoneNumber, enabled, favorite } = contact;
```
Add this handler next to `toggle` (after the existing `toggle` function):
```jsx
  const toggleFavorite = async () => {
    setBusy(true);
    try { await updateDoc(ref, { favorite: !favorite }); } finally { setBusy(false); }
  };
```
Add a star button in the row's button cluster, immediately before the Quiet hours button:
```jsx
        <button
          onClick={toggleFavorite}
          disabled={busy}
          role="switch"
          aria-checked={!!favorite}
          aria-label={`${favorite ? 'Favorite' : 'Not a favorite'}: ${name}`}
          title={favorite ? 'Favorite — shown big on the wall' : 'Mark as favorite'}
          className={[
            'font-display text-base px-3 py-2 rounded-chunk border-[3px] border-ink transition-transform hover:-translate-y-0.5',
            favorite ? 'bg-sunshine' : 'bg-white',
          ].join(' ')}
        >
          {favorite ? '★' : '☆'}
        </button>
```

- [ ] **Step 2: Build the web app to verify it compiles**

Run: `cd ~/Developer/kid-phone/web && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**
```bash
cd ~/Developer/kid-phone && git add web/src/components/Contacts.jsx
git commit -m "feat(kid-phone): favorite ⭐ toggle on contacts (surfaces big on the wall)"
```

---

## Task 5: symphony `list-contacts` edge function

**Files:**
- Create: `supabase/functions/list-contacts/index.ts`
- Create: `supabase/functions/list-contacts/lib/validate.ts`
- Test: `supabase/functions/list-contacts/lib/validate.test.ts`
- Modify: `supabase/config.toml` (only if functions are individually listed there — see step 4)

**Interfaces:**
- Produces: edge fn `list-contacts` — POST, `Authorization: Bearer <jwt>`, no body required; proxies kid-phone `listContacts` with the shared secret; returns `{ contacts: ContactListItem[] }`.
- Produces (pure, testable): `parseContactsResponse(raw: unknown): { contacts: ContactListItemDTO[] }` and `type ContactListItemDTO = { contactId: string; name: string; photoURL?: string; favorite: boolean; enabled: boolean }`.

- [ ] **Step 1: Write the failing test** — `supabase/functions/list-contacts/lib/validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseContactsResponse } from './validate.ts';

describe('parseContactsResponse', () => {
  it('passes through a well-formed list and coerces flags', () => {
    const out = parseContactsResponse({
      contacts: [{ contactId: 'grandma', name: 'Grandma', photoURL: 'x', favorite: true, enabled: true }],
    });
    expect(out.contacts).toHaveLength(1);
    expect(out.contacts[0]).toMatchObject({ contactId: 'grandma', name: 'Grandma', favorite: true });
  });
  it('drops entries missing a contactId or name', () => {
    const out = parseContactsResponse({
      contacts: [{ contactId: '', name: 'X' }, { contactId: 'y' }, { contactId: 'z', name: 'Z' }],
    });
    expect(out.contacts.map((c) => c.contactId)).toEqual(['z']);
  });
  it('returns an empty list for malformed input', () => {
    expect(parseContactsResponse(null).contacts).toEqual([]);
    expect(parseContactsResponse({}).contacts).toEqual([]);
    expect(parseContactsResponse({ contacts: 'nope' }).contacts).toEqual([]);
  });
  it('never leaks a phoneNumber field even if present upstream', () => {
    const out = parseContactsResponse({
      contacts: [{ contactId: 'g', name: 'G', phoneNumber: '+13015551234', favorite: false, enabled: true }],
    });
    expect((out.contacts[0] as Record<string, unknown>).phoneNumber).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run supabase/functions/list-contacts/lib/validate.test.ts`
Expected: FAIL — cannot find `./validate.ts`.

- [ ] **Step 3: Implement `supabase/functions/list-contacts/lib/validate.ts`**
```ts
// Pure parsing for the list-contacts proxy. Display fields only — phone numbers
// are stripped defensively even if the upstream ever includes them.

export interface ContactListItemDTO {
  contactId: string;
  name: string;
  photoURL?: string;
  favorite: boolean;
  enabled: boolean;
}

export function parseContactsResponse(raw: unknown): { contacts: ContactListItemDTO[] } {
  const list = (raw as { contacts?: unknown })?.contacts;
  if (!Array.isArray(list)) return { contacts: [] };
  const contacts: ContactListItemDTO[] = [];
  for (const item of list) {
    const v = item as Record<string, unknown>;
    const contactId = typeof v.contactId === 'string' ? v.contactId : '';
    const name = typeof v.name === 'string' ? v.name : '';
    if (!contactId || !name) continue;
    contacts.push({
      contactId,
      name,
      photoURL: typeof v.photoURL === 'string' ? v.photoURL : undefined,
      favorite: !!v.favorite,
      enabled: v.enabled !== false,
    });
  }
  return { contacts };
}
```

- [ ] **Step 4: Implement `supabase/functions/list-contacts/index.ts`**
```ts
// LIST-CONTACTS — proxies the kid-phone display feed to the authenticated wall.
// Keeps the shared secret server-side; returns name/photo/favorite/enabled only.
//
// Auth: the caller's Supabase JWT (Authorization: Bearer). No body required.
// No-op-safe: returns 503 until KIDPHONE_LIST_CONTACTS_URL + KIDPHONE_CALL_SECRET
// are configured.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseContactsResponse } from './lib/validate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'missing bearer token' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401)

  const listUrl = Deno.env.get('KIDPHONE_LIST_CONTACTS_URL') ?? ''
  const secret = Deno.env.get('KIDPHONE_CALL_SECRET') ?? ''
  if (!listUrl || !secret) return jsonResponse({ error: 'telephony not configured' }, 503)

  try {
    const res = await fetch(listUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kidphone-secret': secret },
      body: '{}',
    })
    if (!res.ok) return jsonResponse({ error: `bridge error ${res.status}` }, 502)
    const raw = await res.json().catch(() => ({}))
    return jsonResponse(parseContactsResponse(raw))
  } catch (e) {
    return jsonResponse({ error: `bridge unreachable: ${e instanceof Error ? e.message : 'unknown'}` }, 502)
  }
})
```

- [ ] **Step 5: config.toml** — check whether functions are individually declared:

Run: `cd ~/Developer/Developer/symphonyOS && grep -n "place-call\|\[functions" supabase/config.toml`
- If `place-call` has a `[functions.place-call]` block, add a matching one for `list-contacts` with the **same `verify_jwt`** value (it should be `true` / default — Bearer auth). If functions are not individually listed (deploy-by-folder), do nothing.

- [ ] **Step 6: Run test + typecheck**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run supabase/functions/list-contacts/lib/validate.test.ts`
Expected: PASS. (The Deno `index.ts` is not type-checked by vitest; it deploys via the Supabase CLI.)

- [ ] **Step 7: Commit**
```bash
cd ~/Developer/Developer/symphonyOS && git add supabase/functions/list-contacts supabase/config.toml
git commit -m "feat(wall): list-contacts edge fn — proxy kid-phone display feed to the wall"
```

---

## Task 6: symphony `place-call` — accept `contactId`

**Files:**
- Modify: `supabase/functions/place-call/lib/validate.ts`
- Modify: `supabase/functions/place-call/index.ts`
- Test: `supabase/functions/place-call/lib/validate.test.ts`

**Interfaces:**
- Changes: `PlaceCallBody` gains `contactId?: string`. `validateBody` accepts a request with `contactId` (in addition to `taskId` / `toNumber`).
- Behavior: when `contactId` is present, `index.ts` forwards it to kid-phone `initiateCall` and skips number resolution.

- [ ] **Step 1: Write the failing test** — add to `supabase/functions/place-call/lib/validate.test.ts`:
```ts
it('accepts a contactId alone', () => {
  expect(validateBody({ contactId: 'grandma' })).toMatchObject({ ok: true, mode: 'bridge' });
});
```
(Keep the existing import of `validateBody` at the top of that file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run supabase/functions/place-call/lib/validate.test.ts`
Expected: FAIL — `validateBody` returns `{ ok:false, status:400 }` because no `taskId`/`toNumber`.

- [ ] **Step 3: Implement** — in `supabase/functions/place-call/lib/validate.ts`:

(a) Add `contactId` to the interface:
```ts
export interface PlaceCallBody {
  taskId?: string
  toNumber?: string
  contactId?: string
  mode?: 'bridge' | 'agent'
  source?: 'app' | 'kiosk'
  context?: 'work' | 'family' | 'personal'
}
```
(b) Relax the required-target check in `validateBody` — change:
```ts
  if (!body.taskId && !body.toNumber) {
    return { ok: false, status: 400, error: 'taskId or toNumber required' }
  }
```
to:
```ts
  if (!body.taskId && !body.toNumber && !body.contactId) {
    return { ok: false, status: 400, error: 'taskId, toNumber or contactId required' }
  }
```

- [ ] **Step 4: Forward `contactId`** — in `supabase/functions/place-call/index.ts`:

(a) Short-circuit number resolution when a `contactId` is supplied. Immediately after `const v = validateBody(parsed)` ... `if (!v.ok) return ...`, the existing code resolves `toNumber`. Wrap that resolution so it is skipped for contactId calls. Replace the block:
```ts
  // Resolve the number: explicit toNumber wins, else the task's phone_number.
  let toNumber = parsed.toNumber
  if (!toNumber && parsed.taskId) {
    ...
  }
  if (!toNumber) return jsonResponse({ error: 'no phone number available for this call' }, 422)
```
with:
```ts
  // contactId path: kid-phone resolves the number server-side. Otherwise resolve
  // a number here (explicit toNumber wins, else the task's phone_number).
  let toNumber = parsed.toNumber
  if (!parsed.contactId) {
    if (!toNumber && parsed.taskId) {
      const { data: task } = await userClient
        .from('tasks')
        .select('id, phone_number')
        .eq('id', parsed.taskId)
        .maybeSingle()
      if (!task) return jsonResponse({ error: 'task not found' }, 404)
      toNumber = (task as { phone_number?: string }).phone_number
    }
    if (!toNumber) return jsonResponse({ error: 'no phone number available for this call' }, 422)
  }
```
(b) Include `contactId` in the body POSTed to kid-phone. Change:
```ts
      body: JSON.stringify({ toNumber, mode: v.mode, bridgeTo: bridgeToFor(parsed.source), context: parsed.context }),
```
to:
```ts
      body: JSON.stringify({ toNumber, contactId: parsed.contactId, mode: v.mode, bridgeTo: bridgeToFor(parsed.source), context: parsed.context }),
```
(c) The `call_log` insert uses `buildLogRow(userId, toNumber, ...)`. For contactId calls `toNumber` is undefined; pass a placeholder so the log still records the attempt. Change the insert line:
```ts
    .insert(buildLogRow(userId, toNumber, v.mode, parsed.taskId, callSid))
```
to:
```ts
    .insert(buildLogRow(userId, toNumber ?? `contact:${parsed.contactId}`, v.mode, parsed.taskId, callSid))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run supabase/functions/place-call/lib/validate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
cd ~/Developer/Developer/symphonyOS && git add supabase/functions/place-call
git commit -m "feat(wall): place-call forwards contactId for allowlist-safe kiosk dialing"
```

---

## Task 7: symphony telephony clients (`placeCall` + `listContacts`)

**Files:**
- Modify: `src/lib/telephony/placeCall.ts`
- Create: `src/lib/telephony/listContacts.ts`
- Test: `src/lib/telephony/listContacts.test.ts`

**Interfaces:**
- Changes: `PlaceCallRequest` gains `contactId?: string`.
- Produces: `type KidPhoneContact = { contactId: string; name: string; photoURL?: string; favorite: boolean; enabled: boolean }`.
- Produces: `fetchKidPhoneContacts(): Promise<{ ok: boolean; contacts: KidPhoneContact[]; error?: string }>` — invokes the `list-contacts` edge fn.

- [ ] **Step 1: Add `contactId` to `PlaceCallRequest`** — in `src/lib/telephony/placeCall.ts`, add to the interface:
```ts
  /** Dial a kid-phone allowlist contact by id (number resolved server-side). */
  contactId?: string
```

- [ ] **Step 2: Write the failing test** — `src/lib/telephony/listContacts.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
import { supabase } from '@/lib/supabase';
import { fetchKidPhoneContacts } from './listContacts';

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

describe('fetchKidPhoneContacts', () => {
  it('returns contacts on success', async () => {
    invoke.mockResolvedValueOnce({
      data: { contacts: [{ contactId: 'g', name: 'Grandma', favorite: true, enabled: true }] },
      error: null,
    });
    const r = await fetchKidPhoneContacts();
    expect(r.ok).toBe(true);
    expect(r.contacts).toHaveLength(1);
    expect(r.contacts[0].name).toBe('Grandma');
  });
  it('returns ok:false with an empty list on error', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const r = await fetchKidPhoneContacts();
    expect(r.ok).toBe(false);
    expect(r.contacts).toEqual([]);
    expect(r.error).toBe('boom');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run src/lib/telephony/listContacts.test.ts`
Expected: FAIL — cannot find `./listContacts`.

- [ ] **Step 4: Implement `src/lib/telephony/listContacts.ts`**
```ts
// Client for the kid-phone contacts feed (powers the wall phone book). Invokes
// the list-contacts edge fn, which proxies kid-phone's secret-gated listContacts.
// Display fields only — no phone numbers ever reach the browser.

import { supabase } from '@/lib/supabase'

export interface KidPhoneContact {
  contactId: string
  name: string
  photoURL?: string
  favorite: boolean
  enabled: boolean
}

export interface KidPhoneContactsResult {
  ok: boolean
  contacts: KidPhoneContact[]
  error?: string
}

export async function fetchKidPhoneContacts(): Promise<KidPhoneContactsResult> {
  const { data, error } = await supabase.functions.invoke('list-contacts', { body: {} })
  if (error) return { ok: false, contacts: [], error: error.message }
  const contacts = (data as { contacts?: KidPhoneContact[] })?.contacts ?? []
  return { ok: true, contacts }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run src/lib/telephony/listContacts.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
cd ~/Developer/Developer/symphonyOS && git add src/lib/telephony/placeCall.ts src/lib/telephony/listContacts.ts src/lib/telephony/listContacts.test.ts
git commit -m "feat(wall): telephony clients — contactId on placeCall + fetchKidPhoneContacts"
```

---

## Task 8: symphony `useKidPhoneContacts` hook (fetch + cache-last-good)

**Files:**
- Create: `src/hooks/useKidPhoneContacts.ts`
- Test: `src/hooks/useKidPhoneContacts.cache.test.ts`

**Interfaces:**
- Consumes: `fetchKidPhoneContacts`, `KidPhoneContact` (Task 7).
- Produces (pure, testable helpers): `CONTACTS_CACHE_KEY = 'wallv2.kidphone.contacts.v1'`, `readCachedContacts(store: Pick<Storage,'getItem'>): KidPhoneContact[]`, `writeCachedContacts(store: Pick<Storage,'setItem'>, c: KidPhoneContact[]): void`.
- Produces: `useKidPhoneContacts(enabled: boolean): { contacts: KidPhoneContact[]; favorites: KidPhoneContact[]; others: KidPhoneContact[]; loading: boolean; error?: string }` — fetches when `enabled` flips true; seeds from cache so the grid never flashes empty; partitions by `favorite`, each partition name-sorted.

- [ ] **Step 1: Write the failing test (pure cache helpers + partition)** — `src/hooks/useKidPhoneContacts.cache.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readCachedContacts, writeCachedContacts, partitionContacts, CONTACTS_CACHE_KEY } from './useKidPhoneContacts';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('contacts cache helpers', () => {
  it('round-trips through the store', () => {
    const store = memStore();
    writeCachedContacts(store, [{ contactId: 'g', name: 'Grandma', favorite: true, enabled: true }]);
    expect(store.getItem(CONTACTS_CACHE_KEY)).toBeTruthy();
    expect(readCachedContacts(store)).toHaveLength(1);
  });
  it('returns [] for missing or corrupt cache', () => {
    expect(readCachedContacts(memStore())).toEqual([]);
    const bad = memStore(); bad.setItem(CONTACTS_CACHE_KEY, 'not json');
    expect(readCachedContacts(bad)).toEqual([]);
  });
});

describe('partitionContacts', () => {
  it('splits favorites from others, each sorted by name', () => {
    const { favorites, others } = partitionContacts([
      { contactId: '2', name: 'Zed', favorite: false, enabled: true },
      { contactId: '1', name: 'Anna', favorite: false, enabled: true },
      { contactId: '3', name: 'Gary', favorite: true, enabled: true },
      { contactId: '4', name: 'Beth', favorite: true, enabled: true },
    ]);
    expect(favorites.map((c) => c.name)).toEqual(['Beth', 'Gary']);
    expect(others.map((c) => c.name)).toEqual(['Anna', 'Zed']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run src/hooks/useKidPhoneContacts.cache.test.ts`
Expected: FAIL — cannot find `./useKidPhoneContacts`.

- [ ] **Step 3: Implement `src/hooks/useKidPhoneContacts.ts`**
```ts
import { useEffect, useMemo, useState } from 'react'
import { fetchKidPhoneContacts, type KidPhoneContact } from '@/lib/telephony/listContacts'

export const CONTACTS_CACHE_KEY = 'wallv2.kidphone.contacts.v1'

export function readCachedContacts(store: Pick<Storage, 'getItem'>): KidPhoneContact[] {
  try {
    const raw = store.getItem(CONTACTS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as KidPhoneContact[]) : []
  } catch {
    return []
  }
}

export function writeCachedContacts(store: Pick<Storage, 'setItem'>, contacts: KidPhoneContact[]): void {
  try {
    store.setItem(CONTACTS_CACHE_KEY, JSON.stringify(contacts))
  } catch {
    /* ignore quota/serialization errors — cache is best-effort */
  }
}

export function partitionContacts(contacts: KidPhoneContact[]): {
  favorites: KidPhoneContact[]
  others: KidPhoneContact[]
} {
  const byName = (a: KidPhoneContact, b: KidPhoneContact) => a.name.localeCompare(b.name)
  return {
    favorites: contacts.filter((c) => c.favorite).sort(byName),
    others: contacts.filter((c) => !c.favorite).sort(byName),
  }
}

/** Fetch the kid-phone contacts feed when `enabled` becomes true. Seeds from the
 *  last-good localStorage cache so the phone book never flashes empty. */
export function useKidPhoneContacts(enabled: boolean) {
  const store = typeof window !== 'undefined' ? window.localStorage : undefined
  const [contacts, setContacts] = useState<KidPhoneContact[]>(() =>
    store ? readCachedContacts(store) : [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(undefined)
    fetchKidPhoneContacts().then((r) => {
      if (cancelled) return
      if (r.ok) {
        setContacts(r.contacts)
        if (store) writeCachedContacts(store, r.contacts)
      } else {
        setError(r.error) // keep showing cached contacts
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [enabled])

  const { favorites, others } = useMemo(() => partitionContacts(contacts), [contacts])
  return { contacts, favorites, others, loading, error }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run src/hooks/useKidPhoneContacts.cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd ~/Developer/Developer/symphonyOS && git add src/hooks/useKidPhoneContacts.ts src/hooks/useKidPhoneContacts.cache.test.ts
git commit -m "feat(wall): useKidPhoneContacts hook with last-good cache + favorites partition"
```

---

## Task 9: symphony `WallV2PhoneScreen` (grid + confirm overlay)

**Files:**
- Create: `src/components/wall-v2/WallV2PhoneScreen.tsx`
- Test: `src/components/wall-v2/WallV2PhoneScreen.test.tsx`

**Interfaces:**
- Consumes: `useKidPhoneContacts` (Task 8), `placeCall` (Task 7), `KidPhoneContact`, `TINTS`.
- Produces: `WallV2PhoneScreen({ onClose }: { onClose: () => void })` — full-screen overlay. Renders favorites as large photo buttons and an "All contacts" section. Tapping a contact opens a confirm overlay ("Call <name>?"); **Call** invokes `placeCall({ contactId, source: 'kiosk' })`; **Cancel** returns to the grid. On placeCall failure, shows an inline message; on success, shows "Calling <name>…" briefly (the wall's `CallerIdTakeover` then takes over) and auto-closes.

- [ ] **Step 1: Write the test** — `src/components/wall-v2/WallV2PhoneScreen.test.tsx`. (Note: this repo's render-test env has a known happy-dom localStorage quirk — if `render` throws at import time, mark the file `describe.skip` with a `// happy-dom env (pre-existing)` comment and rely on the Task 8 pure tests + manual verification. Try it unskipped first.)
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/useKidPhoneContacts', () => ({
  useKidPhoneContacts: () => ({
    contacts: [{ contactId: 'g', name: 'Grandma', favorite: true, enabled: true }],
    favorites: [{ contactId: 'g', name: 'Grandma', favorite: true, enabled: true }],
    others: [{ contactId: 'i', name: 'Iris', favorite: false, enabled: true }],
    loading: false,
    error: undefined,
  }),
}));
const placeCall = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: (...a: unknown[]) => placeCall(...a) }));

import { WallV2PhoneScreen } from './WallV2PhoneScreen';

describe('WallV2PhoneScreen', () => {
  it('requires a confirm before placing the call', async () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    expect(placeCall).not.toHaveBeenCalled();            // confirm gates the call
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(placeCall).toHaveBeenCalledWith({ contactId: 'g', source: 'kiosk' }));
  });

  it('cancel returns to the grid without calling', () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Iris/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(placeCall).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Iris/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run src/components/wall-v2/WallV2PhoneScreen.test.tsx`
Expected: FAIL — cannot find `./WallV2PhoneScreen`.

- [ ] **Step 3: Implement `src/components/wall-v2/WallV2PhoneScreen.tsx`**
```tsx
// src/components/wall-v2/WallV2PhoneScreen.tsx
//
// Full-screen kid phone book on the wall. Big photo buttons (favorites first,
// then all allowed contacts). Tap a face → confirm → the in-house handset rings
// and bridges to the callee (placeCall with source:'kiosk'). Numbers never reach
// the browser; we dial by contactId.

import { useState } from 'react'
import { Phone, X, PhoneCall } from 'lucide-react'
import { useKidPhoneContacts } from '@/hooks/useKidPhoneContacts'
import { placeCall } from '@/lib/telephony/placeCall'
import type { KidPhoneContact } from '@/lib/telephony/listContacts'

type Pending = { state: 'confirm' | 'calling' | 'error'; contact: KidPhoneContact; message?: string }

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

function ContactButton({ c, large, onTap }: { c: KidPhoneContact; large?: boolean; onTap: (c: KidPhoneContact) => void }) {
  const size = large ? 'w-40 h-40 text-5xl' : 'w-28 h-28 text-3xl'
  const label = large ? 'text-2xl' : 'text-lg'
  return (
    <button
      type="button"
      onClick={() => onTap(c)}
      aria-label={`Call ${c.name}`}
      className="flex flex-col items-center gap-3 p-3 rounded-3xl hover:bg-white/60 dark:hover:bg-stone-800/60 transition-colors"
    >
      <span className={`grid place-items-center ${size} rounded-full overflow-hidden bg-amber-100 text-amber-900 border-4 border-white shadow-lg`}>
        {c.photoURL
          ? <img src={c.photoURL} alt="" className="w-full h-full object-cover" />
          : <span className="font-bold">{initials(c.name)}</span>}
      </span>
      <span className={`font-bold text-stone-800 dark:text-stone-100 ${label} leading-tight text-center`}>{c.name}</span>
    </button>
  )
}

export function WallV2PhoneScreen({ onClose }: { onClose: () => void }) {
  const { favorites, others, loading, error } = useKidPhoneContacts(true)
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = async () => {
    if (!pending) return
    const contact = pending.contact
    setPending({ state: 'calling', contact })
    const r = await placeCall({ contactId: contact.contactId, source: 'kiosk' })
    if (r.ok) {
      // The CallerIdTakeover paints "Calling …" from here; close the book.
      setTimeout(onClose, 1200)
    } else {
      setPending({ state: 'error', contact, message: "Couldn't ring the phone — try again." })
    }
  }

  const empty = !loading && favorites.length === 0 && others.length === 0

  return (
    <div className="fixed inset-0 z-40 bg-[var(--color-bg-base)] dark:bg-stone-950 overflow-auto">
      <div className="sticky top-0 flex items-center justify-between px-8 py-6 bg-inherit">
        <h1 className="flex items-center gap-3 text-3xl font-extrabold text-stone-800 dark:text-stone-100">
          <Phone className="w-8 h-8" /> Call someone
        </h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid place-items-center w-14 h-14 rounded-full bg-white/85 dark:bg-stone-800/85 border border-stone-300/70 dark:border-stone-700/70 shadow-md hover:bg-white dark:hover:bg-stone-800 transition-colors"
        >
          <X className="w-7 h-7" />
        </button>
      </div>

      <div className="px-8 pb-16">
        {loading && favorites.length === 0 && others.length === 0 && (
          <p className="mt-10 text-xl text-stone-500">Loading the phone book…</p>
        )}
        {empty && <p className="mt-10 text-xl text-stone-500">No one to call yet.</p>}
        {error && (favorites.length > 0 || others.length > 0) && (
          <p className="mb-4 text-sm text-amber-700">Showing the last saved list.</p>
        )}

        {favorites.length > 0 && (
          <div className="flex flex-wrap gap-6 justify-center mb-12">
            {favorites.map((c) => <ContactButton key={c.contactId} c={c} large onTap={(x) => setPending({ state: 'confirm', contact: x })} />)}
          </div>
        )}

        {others.length > 0 && (
          <>
            <h2 className="text-lg font-bold text-stone-500 uppercase tracking-wide mb-4">All contacts</h2>
            <div className="flex flex-wrap gap-4 justify-center">
              {others.map((c) => <ContactButton key={c.contactId} c={c} onTap={(x) => setPending({ state: 'confirm', contact: x })} />)}
            </div>
          </>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-900/60 backdrop-blur-sm p-8">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-stone-900 p-8 text-center shadow-2xl">
            <div className="grid place-items-center w-32 h-32 mx-auto rounded-full overflow-hidden bg-amber-100 text-amber-900 text-4xl font-bold border-4 border-white shadow-lg mb-5">
              {pending.contact.photoURL
                ? <img src={pending.contact.photoURL} alt="" className="w-full h-full object-cover" />
                : initials(pending.contact.name)}
            </div>
            {pending.state === 'calling' ? (
              <p className="flex items-center justify-center gap-2 text-2xl font-bold text-stone-800 dark:text-stone-100">
                <PhoneCall className="w-6 h-6 animate-pulse" /> Calling {pending.contact.name}…
              </p>
            ) : (
              <>
                <p className="text-2xl font-extrabold text-stone-800 dark:text-stone-100 mb-1">Call {pending.contact.name}?</p>
                {pending.state === 'error'
                  ? <p className="text-base text-tomato font-semibold mb-6">{pending.message}</p>
                  : <p className="text-base text-stone-500 mb-6">The phone will ring — pick it up to talk.</p>}
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="flex-1 py-4 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    className="flex-1 py-4 rounded-2xl bg-emerald-500 text-white text-xl font-bold shadow-lg"
                  >
                    Call
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes (or skip per the env note)**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run src/components/wall-v2/WallV2PhoneScreen.test.tsx`
Expected: PASS. (If render throws at import due to the known happy-dom env issue, wrap the suite in `describe.skip` with the comment and proceed — the Task 8 pure tests cover the logic.)

- [ ] **Step 5: Commit**
```bash
cd ~/Developer/Developer/symphonyOS && git add src/components/wall-v2/WallV2PhoneScreen.tsx src/components/wall-v2/WallV2PhoneScreen.test.tsx
git commit -m "feat(wall): WallV2PhoneScreen — big-button phone book with confirm step"
```

---

## Task 10: symphony shell wiring (dock button + overlay)

**Files:**
- Modify: `src/components/wall-v2/wallV2Mock.ts`
- Modify: `src/components/wall-v2/WallV2Shell.tsx`

**Interfaces:**
- Consumes: `WallV2PhoneScreen` (Task 9).
- Behavior: the dock's `photo` action becomes a `phone` action; tapping it opens `WallV2PhoneScreen`; the screen's `onClose` hides it.

- [ ] **Step 1: Swap the dock action** — in `src/components/wall-v2/wallV2Mock.ts`:

(a) Add `Phone` to the lucide import (find the existing `lucide-react` import that includes `Camera`/`Calendar` and add `Phone`).
(b) Replace the `photo` action line in `MOCK_ACTIONS`:
```ts
  { id: 'photo', label: 'Add photo', caption: 'Share a moment', icon: Camera, tint: 'honey' },
```
with:
```ts
  { id: 'phone', label: 'Call someone', caption: 'Ring the phone', icon: Phone, tint: 'mint' },
```
(If `Camera` is now unused elsewhere in the file, remove it from the import to keep the build lint-clean.)

- [ ] **Step 2: Wire the overlay into the shell** — in `src/components/wall-v2/WallV2Shell.tsx`:

(a) Import the screen (next to the other wall-v2 component imports near `CallerIdTakeover`):
```tsx
import { WallV2PhoneScreen } from './WallV2PhoneScreen';
```
(b) Add overlay state (in the `// ─── Overlay state ───` group, next to `showQuickCapture`):
```tsx
  const [showPhone, setShowPhone] = useState(false);
```
(c) Add the `phone` case to `handleAction`, replacing the `case 'photo':` block:
```tsx
      case 'phone':
        setShowPhone(true);
        break;
```
(d) Render the overlay — just before `<CallerIdTakeover />` near the end of the returned JSX:
```tsx
      {showPhone && <WallV2PhoneScreen onClose={() => setShowPhone(false)} />}
```

- [ ] **Step 3: Typecheck + build**

Run: `cd ~/Developer/Developer/symphonyOS && npx tsc --noEmit && npm run build`
Expected: tsc clean, build succeeds.

- [ ] **Step 4: Run the wall-v2 test suite**

Run: `cd ~/Developer/Developer/symphonyOS && npx vitest run src/components/wall-v2 src/hooks/useKidPhoneContacts.cache.test.ts src/lib/telephony`
Expected: PASS (modulo any pre-existing skips).

- [ ] **Step 5: Commit**
```bash
cd ~/Developer/Developer/symphonyOS && git add src/components/wall-v2/wallV2Mock.ts src/components/wall-v2/WallV2Shell.tsx
git commit -m "feat(wall): add Phone to the action dock — opens the kid phone book"
```

---

## Task 11: Provisioning & deploy (Scott-gated)

Nothing is live until env is set on both sides. This task has no unit test — it is the deploy runbook. Do NOT skip the verification step.

**kid-phone (Firebase, `us-central1`):**
- [ ] **Step 1:** Ensure `CALL_EVENTS_SECRET` is set for functions (it already is for the inbound caller-ID bridge — reuse the same value).
- [ ] **Step 2:** Deploy: `cd ~/Developer/kid-phone && firebase deploy --only functions:listContacts,functions:initiateCall`
- [ ] **Step 3:** If `initiateCall`/`listContacts` are not yet public, make them invocable from Symphony the same way the other webhook fns are (the repo already does `gcloud run add-iam-policy-binding ... allUsers` for `callStatusWebhook`). Note the deployed `listContacts` Run URL.
- [ ] **Step 4:** Deploy the web admin so the ⭐ favorite toggle ships: `cd ~/Developer/kid-phone/web && npm run build && cd ~/Developer/kid-phone && firebase deploy --only hosting`. Then mark a few contacts as favorites (Grandma, Iris, Scott Cell, Gary).

**symphony (Supabase + Vercel):**
- [ ] **Step 5:** Set secrets (dashboard — CLI `supabase secrets set` is known-broken in this repo per the caller-ID notes): `KIDPHONE_LIST_CONTACTS_URL` = the `listContacts` Run URL; confirm `KIDPHONE_INITIATE_URL` (already set for inbound work) and `KIDPHONE_CALL_SECRET` (== kid-phone's `CALL_EVENTS_SECRET`).
- [ ] **Step 6:** Deploy edge fns: `cd ~/Developer/Developer/symphonyOS && supabase functions deploy list-contacts && supabase functions deploy place-call`. (If the gateway 401s a Bearer call, confirm these two keep `verify_jwt = true` — they require the wall's JWT, unlike the secret-only `kid-phone-call`.)
- [ ] **Step 7:** The wall front-end deploys via the normal symphony Vercel pipeline (push to `main`); the wall auto-reloads via `useBuildAutoReload`.

**End-to-end verification:**
- [ ] **Step 8:** On the wall, tap **Call someone** → grid shows favorites big + all contacts → tap **Grandma** → confirm **Call** → the in-house handset rings → lift it → bridged to Grandma; the `CallerIdTakeover` shows "Calling Grandma…" and clears on hang-up. Tap **Cancel** on the confirm and verify no call is placed. Confirm a disabled contact never appears in the grid.

---

## Self-Review

**Spec coverage:**
- Phone screen (dedicated full-screen) → Tasks 9–10. ✓
- Favorites surfaced big + all allowed below → Task 8 partition + Task 9 layout. ✓
- Confirm step → Task 9. ✓
- Contacts data path (live proxy-fetch, kid-phone source of truth, cache last-good) → Tasks 1,2,5,7,8. ✓
- contactId dialing + server-side allowlist enforcement → Tasks 3,6. ✓
- Favorites managed on kid-phone Contacts tab (⭐) → Task 4. ✓
- Takeover reused → Task 9 relies on existing `CallerIdTakeover`; no change needed. ✓
- Quiet hours already enforced → `initiateCall` returns 409 (Task 3 keeps the check); confirm overlay shows a generic failure for v1 (acceptable per spec). ✓
- Distinctive ring deferred to v2 → out of scope, noted. ✓
- No phone numbers in the browser → enforced in Tasks 1 (feed omits number), 5 (defensive strip), 7 (display type only). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `ContactListItem` (kid-phone) / `ContactListItemDTO` (edge fn) / `KidPhoneContact` (client) carry the same fields `{contactId,name,photoURL?,favorite,enabled}`. `contactId` threads consistently: `placeCall({contactId})` → `place-call` body `contactId` → `initiateCall` `InitiateBody.contactId` → `validateInitiate` returns `contactId` → handler `loadContactById`. `source:'kiosk'` → `bridgeToFor` → `'handset'` (existing). ✓
