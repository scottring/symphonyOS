# Symphony design study

Open `/scripts/symphony-design-study/index.html` through Vite in this worktree.

Three distinct surfaces grounded in the existing app: desktop rail/journal/side panel, phone horizon picker/dock, and wall moments/cooking. This supersedes the universal-navigation direction in `canvas-lab`.

See [design decisions, coverage, evidence, and limitations](../../docs/planning/2026-10-09-symphony-design-study.md).

All interactions use fictional in-memory data. No production imports for writes, no AI/voice, no auth, no calls. Reload resets the study. Local fixture types are disposable and must not replace production models.

Validation: `npx tsc -p tsconfig.lab.json`; `npx eslint scripts/symphony-design-study --max-warnings 10`. Browser checks and screenshots are recorded in the design document.
