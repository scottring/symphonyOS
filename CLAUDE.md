# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Symphony OS is a personal operating system for organizing life tasks, calendar, and contextual information. This is a ground-up rebuild focused on reliability. See VISION.md for full product context.

## Commands

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint
npm test             # Run unit tests (Vitest)
npm run test:ui      # Vitest with UI
npm run test:coverage # Coverage report
npm run test:e2e     # Playwright E2E tests
npm run test:e2e:ui  # Playwright with UI
```

Run a single test file:
```bash
npx vitest src/App.test.tsx
```

Run a single E2E test:
```bash
npx playwright test e2e/example.spec.ts
```

## Tech Stack

- React 19 + TypeScript (strict mode)
- Vite 7 for bundling
- Tailwind CSS v4
- Vitest + React Testing Library for unit tests
- Playwright for E2E (Desktop Chrome + Mobile Chrome)

## Path Aliases

Use `@/` to import from `src/`:
```typescript
import { Component } from '@/components/Component'
```

## Testing

- Unit tests: `src/**/*.{test,spec}.tsx`
- E2E tests: `e2e/` directory
- Test utilities: `src/test/test-utils.tsx` provides a custom `render()` with providers and `userEvent` setup
- Vitest globals enabled (`describe`, `it`, `expect` available without imports)

## Design Tokens (from VISION.md)

- Primary color: Forest green (#3d8b6e)
- Style: Scandinavian-inspired warm neutrals, generous spacing, soft shadows, rounded corners

## Workflow

1. **Think through the problem** — Read the codebase for relevant files
2. **Write a plan** — Create a todo list in `tasks/todo.md` with checkable items
3. **Get approval** — Check in before starting work so the user can verify the plan
4. **Execute** — Work through todo items, marking them complete as you go
5. **Summarize** — Provide high-level explanations of each change
6. **Review** — Add a review section to `tasks/todo.md` summarizing changes

## Code Change Principles

- **Simplicity above all** — Every change should be as simple as possible
- **Minimal impact** — Only touch code directly relevant to the task
- **No laziness** — Find root causes, no temporary fixes
- **Senior-level rigor** — You are a senior developer, act like one
- **Avoid bugs** — Simple changes = fewer bugs introduced
