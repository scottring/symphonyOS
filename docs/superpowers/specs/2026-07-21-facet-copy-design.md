# Facet copy-to-clipboard — design

**Date:** 2026-07-21
**Problem:** After taking a photo in the detail panel, `analyze-attachment` parses it into typed facets, but only the access-code chip can be copied to the clipboard. Phone, location, datetime, link, purchase-item, and checklist facets can't, and there's no way to copy the whole parse at once.

## Scope

All changes live in `src/components/surface/sections/AttachmentFacets.tsx` and its test. No panel wiring changes — every panel that renders facets (task, event, project) gets the feature automatically.

## 1. Per-chip copy

Generalize the existing `CopyCode` component into `CopyButton({ text, label })` — same copy icon → green check feedback, 1.5s reset.

| Facet | Copies |
|---|---|
| access_code | the code (unchanged behavior) |
| phone | the number |
| location | the address |
| link | the URL |
| datetime | the formatted date (e.g. "Sat, Jul 25, 3:00 PM") |
| purchase_item | "Name — specs" |
| checklist | button on the header line; copies all items newline-separated |
| summary | no button (caption text; chip clutter buys nothing) |

For anchor chips (location/phone/link) the button sits outside the `<a>`, beside the existing promotion buttons, so tapping copy never navigates.

## 2. Copy all

Exported `facetsToText(facets: Facet[]): string` serializes the parse as plain text: one line per facet (`Label: value` where a label exists), checklist items as `- item` lines under their header, summary first. A "Copy all" text button renders at the top right of the facet block only when there are 2+ facets (with one facet it duplicates the chip button).

## 3. Testing

Extend `AttachmentFacets.test.tsx`: mock `navigator.clipboard.writeText`; assert per-chip payloads for each facet type and the `facetsToText` serialization; assert Copy all hidden with a single facet.

## Alternatives rejected

- Aggregate copy-all at `PanelPhotos` level across attachments — more plumbing; per-photo is the natural unit (one photo = one parsed document).
- `navigator.share` sheet — different UX than requested; clipboard works in iOS Safari tap handlers.
