# ClassDojo transport — observed 2026-08-25

Recorded from a live logged-in session (Chrome DevTools + in-page fetch).
Everything below is observed, not assumed.

## Login

`POST https://home.classdojo.com/api/session`
Content-Type: `application/json`
Body: `{"login": "<email>", "password": "<password>"}`

A probe with `{}` returns:

```
400 {"error":{"type":400,"message":"Bad Request",
     "detail":"Missing required property: `login`","code":"ERR_SCHEMA_INVALID"}}
```

So the endpoint is a plain JSON schema-validated login. **No captcha and no 2FA
step in the request path.** Success sets a session cookie; every subsequent
call is cookie-authenticated. A cookie jar is all the client needs.

Note the same path serves `GET /api/session?includeExtras=location&supportsChildAsParent=true`
for the current session — useful as a cheap "am I still logged in?" check.

## Listing a class story

`GET https://home.classdojo.com/api/storyFeed?withStudentCommentsAndLikes=true&withSyntheticPosts=true`

- Returns **one combined feed across every class and school** the parent is
  connected to — not one feed per class. Split by `targetId` client-side.
- Sorted **newest first**.
- Pagination is **backwards only**, via `_links.prev` / `_links.next`, whose
  only cursor parameter is `before=<ISO timestamp>`. There is no `since`.
  So "everything since T" = fetch page 1, and keep following `before` until
  the oldest item on a page is older than T.
- `_metadata` carries `postsExist`, `expiresAfter`, `availableTranslations`.

## Response shape

```jsonc
{
  "_items": [
    {
      "_id": "string",
      "time": "2026-08-25T19:22:55.259Z",   // ISO 8601, UTC
      "targetId": "6a8452539348bd1650fd2748",
      "targetType": "class",                 // "class" | "school"
      "senderId": "string",
      "senderName": "string",
      "headerText": "Gorby",                 // teacher
      "headerSubtext": "3-01 - Mr. Gorby (AM) & Ms. Rozanc (PM)_SY 26-27",
      "private": false,
      "pending": false,
      "scheduled": false,
      "type": "textAndAttachment",
      "contents": {
        "body": "string",                    // the post text
        "attachments": [ /* ... */ ],
        "sentLanguage": "string",
        "translation": null
      }
    }
  ],
  "_links": { "prev": {...}, "next": {...} },
  "_metadata": { "postsExist": true, "expiresAfter": "...", "availableTranslations": [...] }
}
```

Observed: 14 items spanning 2026-08-20 to 2026-08-25, all `type:"textAndAttachment"`.

## Stable identifiers

`targetId` is stable and is what becomes `source_key` as `classdojo:<targetId>`.

| targetType | targetId | Who |
|---|---|---|
| class | `6a8452539348bd1650fd2748` | 3-01 — Mr. Gorby (AM) & Ms. Rozanc (PM) |
| class | `6a845289e2061fccdd9e2a19` | 3-02 — Ms. Rozanc (AM) & Mr. Gorby (PM) |
| school | `4eece76df64aa62934ed9433` | Hampden Elementary (Dr. Burton) |

The twins are split across 3-01 and 3-02, so both class targets matter.

Parent id observed in other calls: `64f36c8b3beefcab013012c8` (not needed by
the connector — the feed is scoped by the session).

## Notes for the adapter

- One fetch serves every source. Fetch once per tick, then bucket by `targetId`.
- `contents.body` is the only text; attachments are not downloaded (a post whose
  meaning lives in an attached PDF should raise a gap flag downstream).
- Skip `pending` and `scheduled` posts — they are not live yet.

VERDICT: API path viable. Task 12 implements the HTTP client.
