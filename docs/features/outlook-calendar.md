# Outlook / Microsoft 365 calendar (reads only)

Symphony can show events from an Outlook or Microsoft 365 calendar next to
Google's. It is view-only: the event panel hides move, delete, and edit for
Outlook events, and "Create events on" stays Google.

## How it works

- One row per provider in `calendar_connections` (`provider = 'microsoft'`).
- `google-calendar-events` and `google-calendar-list` read EVERY connection
  for the user and merge the results. The names are historical.
- Provider adapters live in `supabase/functions/_shared/calendar-providers/`
  (`google.ts`, `microsoft.ts`, `tokens.ts`, `index.ts`). Each normalizes
  into the same event shape; Outlook calendars report `accessRole: 'reader'`.
- OAuth: `microsoft-calendar-auth-url` → Microsoft sign-in → `/calendar-callback`
  (the provider rides in `state`) → `microsoft-calendar-callback`.
- Microsoft rotates refresh tokens on every refresh; `tokens.ts` writes the
  new one back. A refresh without `scope` is rejected by Microsoft, so the
  refresh body always carries the scopes.

## One-time setup — Azure checklist

Nothing works until this is done: `Connect Outlook` returns
`MICROSOFT_CLIENT_ID not configured` and no Outlook events appear anywhere.
One time, top to bottom.

### 0. You need an Entra directory first — read this before starting

A bare personal Microsoft account is **not enough**, and the portal only tells
you once you are already deep in it. Registering an app requires a directory
(tenant); an account without one gets "The ability to create applications
outside of a directory has been deprecated" and a lone Cancel button where the
registration form should be. Confirmed against `scottring@hotmail.com` on
2026-09-11 — `New registration` offers no form, and the tenant-management blade
errors outright because there is nothing to manage.

- [ ] Check which case you are in: <https://portal.azure.com> → App
      registrations. A yellow "not contained within any directory" banner means
      you have no directory and must do one of the below first.
- [ ] **Route A — sign up for Azure** (<https://azure.microsoft.com/free>).
      Creates a "Default Directory" and is the normal path. The free tier costs
      nothing, but Microsoft requires a **credit card on file** for identity
      verification. This is the real price of Outlook support: a permanent
      Microsoft account with a card attached, not the twenty free minutes the
      rest of this checklist implies.
- [ ] **Route B — an organizational tenant you already control.** If you have
      Microsoft 365 for a business, register the app there instead and skip
      Route A entirely. Do *not* register Symphony's app inside an employer's
      tenant you do not own — the app would belong to them, not to you.
- [ ] Route C, the M365 Developer Program, is what the portal banner suggests.
      It is now gated behind a Visual Studio subscription, so treat it as
      unavailable unless you already have one.

Steps 1-6 assume you finished this one and are signed in to an account that has
a directory.

### 1. Register the app

- [ ] Sign in to <https://entra.microsoft.com> with the Microsoft account that
      should **own** the registration. This is not the calendar account — it is
      the developer account. A personal outlook.com account is fine.
- [ ] **App registrations → New registration.**
- [ ] Name: `Symphony OS` (users see this on the consent screen).
- [ ] Supported account types: **Accounts in any organizational directory (any
      Microsoft Entra ID tenant — multitenant) and personal Microsoft
      accounts**. This one is load-bearing: the code signs in through the
      `/common` authority (`MICROSOFT_AUTHORITY` in
      `_shared/calendar-providers/microsoft.ts`). A single-tenant registration
      fails at sign-in with `AADSTS50194`.
- [ ] Redirect URI → platform **Web** → `https://app.symphony-os.com/calendar-callback`
- [ ] **Register**, then copy the **Application (client) ID** from the overview
      page. That is `MICROSOFT_CLIENT_ID`.

### 2. Add the dev redirect URI

- [ ] **Authentication → Web → Add URI** → `http://localhost:5173/calendar-callback`
- [ ] Save.

The frontend sends `window.location.origin + '/calendar-callback'`
(`useGoogleCalendar.tsx`, `CalendarCallback.tsx`), and Microsoft demands an
exact string match — scheme, port, no trailing slash. Miss it and sign-in dies
with `AADSTS50011: redirect URI does not match`. Add any other origin you plan
to connect from (a Vercel preview URL, a second dev port) the same way.

### 3. Create the client secret

- [ ] **Certificates & secrets → Client secrets → New client secret.**
- [ ] Expires: **24 months** (the maximum). Shorter means an earlier silent
      outage.
- [ ] Copy the **Value** column, not **Secret ID**. The value is shown once; if
      you navigate away it is gone and you create a new one.
- [ ] Write the expiry date down — step 6.

### 4. Grant the Graph permissions

- [ ] **API permissions → Add a permission → Microsoft Graph → Delegated
      permissions.**
- [ ] Tick `Calendars.Read`, `User.Read`, `offline_access`. These are exactly
      `MICROSOFT_SCOPES` in `microsoft.ts` — if that list ever changes, this
      list changes with it.
- [ ] Add permissions. No admin consent needed: all three are user-consentable,
      and a personal account consents on first sign-in.

Read-only by design. Do not add `Calendars.ReadWrite` — Symphony never writes to
Outlook, and the wider scope buys a scarier consent screen for nothing.

### 5. Hand the credentials to the edge functions

- [ ] Run:

      npx supabase secrets set --project-ref mwadppyrqzuzgstmwpuy \
        MICROSOFT_CLIENT_ID='<application (client) id>' \
        MICROSOFT_CLIENT_SECRET='<secret value>'

- [ ] Confirm both land: `npx supabase secrets list --project-ref mwadppyrqzuzgstmwpuy`
      (values show as hashes — you are checking the names are present).
- [ ] If `Connect Outlook` still says `not configured`, the running instances
      have stale env. Redeploy the two functions:

      npx supabase functions deploy microsoft-calendar-auth-url --use-api
      npx supabase functions deploy microsoft-calendar-callback --use-api

### 6. Prove it against a real account

Everything above is untested against Microsoft's servers — the adapters have
only ever seen mocks. Do not skip this.

- [ ] Sign up for a throwaway <https://outlook.com> account if you have no
      Outlook calendar yet (5 minutes, free, works through `/common`).
- [ ] Put two events on it: one one-off at a distinctive time, one weekly
      recurring. Add an all-day event as a third if you want the full sweep.
- [ ] **Settings → Calendar → Connect Outlook.** Expect the account chooser —
      `prompt=select_account` is deliberate, connecting the wrong account is
      the failure mode this prevents.
- [ ] Check the events land on Today **at the right clock time**. The
      `calendarView` + `Prefer: outlook.timezone="UTC"` path returns a
      `dateTime` with no offset and the adapter appends `Z`; if that ever
      breaks, events arrive intact but shifted by your UTC offset, not
      missing. A whole-hours shift is the tell.
- [ ] Open one in the panel: move, delete, and edit must all be absent
      (`accessRole: 'reader'`).
- [ ] Leave it connected for an hour and reload. That exercises the refresh
      path, which is where Microsoft differs from Google twice over: the
      refresh body must carry `scope`, and the refresh token **rotates** on
      every use. A second-hour failure means `tokens.ts` is not persisting the
      returned token.
- [ ] Add the secret's expiry date (step 3) to the calendar, a month early.
      When it lapses, refreshes start failing and Outlook events quietly stop
      updating — it does not announce itself.

### Work / school accounts

Personal outlook.com accounts connect immediately. A Microsoft 365 tenant is a
different story: cross-tenant consent needs the app to be **publisher
verified** (an MPN account linked to the registration), and plenty of tenants
require admin approval no matter what. Worth doing when there is an actual
employer tenant to connect — the rules are the tenant's, so guessing at them
in advance is wasted work.

## Known limits

- Reads only. Writes stay on Google.
- "Hide this event" on a recurring Outlook series hides one occurrence, not
  the series (Graph occurrence ids do not encode the series id).
- Graph calendar colours come as hex from `hexColor`; "auto" becomes no colour.
