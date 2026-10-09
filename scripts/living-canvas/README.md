# Living Canvas rehearsal

Run the repository Vite server and open `/scripts/living-canvas/index.html`.

This is a scripted, fictional-data interaction study. Use the suggested conversational replies, edit a plan item, detour into dinner and a recipe, and return to planning. Data lives only in memory. There is no microphone, live AI, or account integration. Optional speech requires an available local English browser voice.

See `../../docs/planning/2026-10-09-living-canvas.md` for scope, architecture, checks, and next steps.

Checks:

```sh
npx tsc -p tsconfig.lab.json
npx vitest run --config scripts/living-canvas/vitest.config.ts
```

## Local live voice connection (not yet audio-verified)

Run `npx vite --config scripts/living-canvas/voice.vite.config.ts` in a shell with `OPENAI_API_KEY` securely set, then open `http://127.0.0.1:5257/scripts/living-canvas/index.html`. Never put the key in a VITE variable or browser field. Only this separate local server enables the Start natural voice control. Starting sends microphone audio to OpenAI and incurs API usage. No live session was started during implementation.

The local server accepts the matching loopback Host and Origin, keeps the key server-side, caps request size, limits session creation to one per 30 seconds, and proxies SDP to the Realtime calls endpoint. Browser sessions stop after five minutes; that is a client cap, not a production billing enforcement guarantee. Production requires authenticated session quotas and authoritative server lifetime enforcement.

The model can select allowlisted planning/meal scenes only. No saves, calls, account data, or routine writes. The new everyday routine/contact examples remain direct-interaction fixtures, not voice tools yet. Typed suggested phrases end a live voice session and return to scripted mode. Touch edits are not synchronized to the live model yet; the initial connection is for voice-and-view validation, not complete planning.

Current environment: OPENAI_API_KEY not set in the launching shell. Live audio, interruption quality and upstream session schema remain unverified by a real call. Twelve offline tests and TypeScript pass.

Reference: https://developers.openai.com/api/docs/guides/voice-webrtc
