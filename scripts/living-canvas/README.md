# Living Canvas rehearsal

Run the repository Vite server and open `/scripts/living-canvas/index.html`.

This is a scripted, fictional-data interaction study. Use the suggested conversational replies, edit a plan item, detour into dinner and a recipe, and return to planning. Data lives only in memory. There is no microphone, live AI, or account integration. Optional speech requires an available local English browser voice.

See `../../docs/planning/2026-10-09-living-canvas.md` for scope, architecture, checks, and next steps.

Checks:

```sh
npx tsc -p tsconfig.lab.json
npx vitest run --config scripts/living-canvas/vitest.config.ts
```
