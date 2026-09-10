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

## One-time setup (app registration)

1. https://entra.microsoft.com → App registrations → New registration.
   - Supported account types: **Accounts in any organizational directory and
     personal Microsoft accounts**.
   - Redirect URI (Web): `https://app.symphony-os.com/calendar-callback`
   - Add a second redirect URI: `http://localhost:5173/calendar-callback`
2. Certificates & secrets → New client secret. Copy the **value** (not the id).
3. API permissions → Add → Microsoft Graph → Delegated:
   `Calendars.Read`, `User.Read`, `offline_access`.
4. Store the credentials as edge-function secrets:

   ```bash
   supabase secrets set MICROSOFT_CLIENT_ID=<application (client) id> MICROSOFT_CLIENT_SECRET=<secret value>
   ```

Personal outlook.com accounts connect immediately. Work / school accounts on
Microsoft 365 need the app to be publisher-verified before people in other
tenants can consent, and some tenants require admin approval regardless.

## Known limits

- Reads only. Writes stay on Google.
- "Hide this event" on a recurring Outlook series hides one occurrence, not
  the series (Graph occurrence ids do not encode the series id).
- Graph calendar colours come as hex from `hexColor`; "auto" becomes no colour.
