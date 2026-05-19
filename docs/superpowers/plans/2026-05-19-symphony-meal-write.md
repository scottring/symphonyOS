# Symphony AI Meal-Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The general Symphony assistant fulfills "add/replace/remove a meal this week" by delegating to the existing, proven `ask-symphony-meal` card/apply pipeline — no duplicate meal-write logic, no changes to the meal rail's behavior.

**Architecture:** `symphony-chat` emits a `:::meal-request:::` handoff block (mirroring `:::vault-draft:::`). `useChat` parses it. `ChatPanel` renders a new `MealRequestCards` (modeled on `VaultDraftCard`) that calls `ask-symphony-meal` for the current week and applies returned cards through a single shared `useApplyMealSuggestion` hook extracted verbatim from `MealPlanRitualPage`.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, Supabase Edge (Deno), Anthropic Haiku 4.5.

**Worktree:** All work in `.worktrees/symphony-meal-write` on branch `feat/symphony-meal-write`. Never touch the shared `main` worktree.

**Pre-req (once):** `cp /Users/scottkaufman/Developer/Developer/symphonyOS/.env .worktrees/symphony-meal-write/.env` (git worktree skips gitignored `.env`; without it the dev server blanks).

---

### Task 1: Standalone `fetchMealSuggestions` SSE caller

Reason it's standalone (not a refactor of `useAskSymphony`): the meal rail's streaming UX is proven and in scope-guard "do not touch." A small, self-contained collector that reads the same SSE to completion is lower risk than refactoring the working hook.

**Files:**
- Create: `src/lib/askSymphonyMeal.ts`
- Test: `src/lib/askSymphonyMeal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/askSymphonyMeal.test.ts
import { describe, it, expect, vi } from 'vitest'
import { collectMealStream } from './askSymphonyMeal'

function sse(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) { for (const l of lines) c.enqueue(enc.encode(l)); c.close() },
  })
}

describe('collectMealStream', () => {
  it('accumulates text deltas and returns final cards', async () => {
    const stream = sse([
      'data: {"type":"text","delta":"Hello "}\n\n',
      'data: {"type":"text","delta":"world"}\n\n',
      'data: {"type":"done","cards":[{"kind":"add","kicker":"k","title":"t","why":"w","apply":{"dayOfWeek":2,"slot":"dinner","adHocTitle":"X"}}],"text":"Hello world"}\n\n',
    ])
    const res = await collectMealStream(stream)
    expect(res.text).toBe('Hello world')
    expect(res.cards).toHaveLength(1)
    expect(res.cards[0].kind).toBe('add')
  })

  it('returns empty cards and error text on error event', async () => {
    const stream = sse(['data: {"type":"error","message":"boom"}\n\n'])
    const res = await collectMealStream(stream)
    expect(res.cards).toEqual([])
    expect(res.error).toBe('boom')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/askSymphonyMeal.test.ts`
Expected: FAIL — `collectMealStream` is not exported.

- [ ] **Step 3: Implement**

```ts
// src/lib/askSymphonyMeal.ts
import type { AskSymphonySuggestion } from '@/hooks/useAskSymphony'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'

export interface MealStreamResult {
  text: string
  cards: AskSymphonySuggestion[]
  error?: string
}

/** Read an ask-symphony-meal SSE body to completion and return the final
 *  text + cards. Pure over the stream so it is unit-testable. */
export async function collectMealStream(
  body: ReadableStream<Uint8Array>,
): Promise<MealStreamResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  let text = ''
  let cards: AskSymphonySuggestion[] = []
  let error: string | undefined
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    acc += decoder.decode(value, { stream: true })
    const lines = acc.split('\n')
    acc = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const json = line.slice(5).trim()
      if (!json) continue
      let evt: { type?: string; delta?: string; cards?: AskSymphonySuggestion[]; text?: string; message?: string }
      try { evt = JSON.parse(json) } catch { continue }
      if (evt.type === 'text' && typeof evt.delta === 'string') text += evt.delta
      else if (evt.type === 'done') {
        cards = evt.cards ?? []
        if (typeof evt.text === 'string' && evt.text.length > 0) text = evt.text
      } else if (evt.type === 'error') error = evt.message ?? 'stream error'
    }
  }
  return { text, cards, error }
}

/** Invoke ask-symphony-meal for a one-off request (no chat session) and
 *  return its suggestion cards. Used by the general-chat meal handoff. */
export async function fetchMealSuggestions(
  message: string,
  weekStart: Date,
): Promise<MealStreamResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { text: '', cards: [], error: 'not authenticated' }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-symphony-meal`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      weekStart: toIsoDate(weekStart),
      clientToday: toIsoDate(new Date()),
    }),
  })
  if (!res.ok || !res.body) {
    return { text: '', cards: [], error: await res.text().catch(() => 'request failed') }
  }
  return collectMealStream(res.body)
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/askSymphonyMeal.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/symphony-meal-write add src/lib/askSymphonyMeal.ts src/lib/askSymphonyMeal.test.ts
git -C .worktrees/symphony-meal-write commit -m "feat(meal): standalone fetchMealSuggestions SSE caller"
```

---

### Task 2: Extract `useApplyMealSuggestion` (single shared apply path)

**Files:**
- Create: `src/hooks/useApplyMealSuggestion.ts`
- Test: `src/hooks/useApplyMealSuggestion.test.ts`
- Modify: `src/components/meals/plan/MealPlanRitualPage.tsx` (replace inline `onApplySuggestion` body with the hook; lines ~213–271 and the `<AskSymphonyRail onApplySuggestion={...}>` prop at ~601)

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useApplyMealSuggestion.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useApplyMealSuggestion } from './useApplyMealSuggestion'

const addMeal = vi.fn().mockResolvedValue(undefined)
const removeMeal = vi.fn().mockResolvedValue(undefined)
vi.mock('@/hooks/useMealPlan', () => ({
  useMealPlan: () => ({ addMeal, removeMeal, plan: null, loading: false, error: null,
    refresh: vi.fn(), setParameter: vi.fn(), clearWeek: vi.fn(), updateMealPreparer: vi.fn() }),
}))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [{ id: 'fm1', name: 'Iris' }] }),
}))

describe('useApplyMealSuggestion', () => {
  beforeEach(() => { addMeal.mockClear(); removeMeal.mockClear() })

  it('add → addMeal with mapped args', async () => {
    const { result } = renderHook(() => useApplyMealSuggestion(new Date('2026-05-17')))
    await result.current.applySuggestion({
      kind: 'add', kicker: '', title: '', why: '',
      apply: { dayOfWeek: 2, slot: 'dinner', adHocTitle: 'Pasta' },
    })
    expect(addMeal).toHaveBeenCalledWith(expect.objectContaining({ dayOfWeek: 2, slot: 'dinner', adHocTitle: 'Pasta' }))
  })

  it('swap → removeMeal(originalEntryId) then addMeal', async () => {
    const { result } = renderHook(() => useApplyMealSuggestion(new Date('2026-05-17')))
    await result.current.applySuggestion({
      kind: 'swap', kicker: '', title: '', why: '', originalEntryId: 'e1',
      apply: { dayOfWeek: 3, slot: 'dinner', adHocTitle: 'Tofu' },
    })
    expect(removeMeal).toHaveBeenCalledWith('e1')
    expect(addMeal).toHaveBeenCalledWith(expect.objectContaining({ dayOfWeek: 3, adHocTitle: 'Tofu' }))
  })

  it('remove → removeMeal(entryId)', async () => {
    const { result } = renderHook(() => useApplyMealSuggestion(new Date('2026-05-17')))
    await result.current.applySuggestion({
      kind: 'remove', kicker: '', title: '', why: '', apply: { entryId: 'e9' },
    })
    expect(removeMeal).toHaveBeenCalledWith('e9')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/hooks/useApplyMealSuggestion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (logic lifted verbatim from `MealPlanRitualPage.onApplySuggestion`)**

```ts
// src/hooks/useApplyMealSuggestion.ts
import { useCallback } from 'react'
import type { MealSlot } from '@/types/meal-planner'
import type { AskSymphonySuggestion } from '@/hooks/useAskSymphony'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'

export function useApplyMealSuggestion(weekStart: Date): {
  applySuggestion: (s: AskSymphonySuggestion) => Promise<void>
} {
  const { addMeal, removeMeal } = useMealPlan(weekStart)
  const { members: familyMembers } = useFamilyMembers()

  const applySuggestion = useCallback(async (s: AskSymphonySuggestion) => {
    try {
      if (s.kind === 'add' || s.kind === 'swap') {
        if (s.kind === 'swap' && s.originalEntryId) await removeMeal(s.originalEntryId)
        const apply = s.apply as {
          dayOfWeek?: number; slot?: MealSlot
          recipeId?: string | null; adHocTitle?: string | null
          familyMemberId?: string | null
        }
        if (typeof apply.dayOfWeek !== 'number' || !apply.slot) {
          throw new Error(`${s.kind} card missing dayOfWeek/slot: ${JSON.stringify(apply)}`)
        }
        let familyMemberId: string | null = apply.familyMemberId ?? null
        if (familyMemberId && !familyMembers.find(m => m.id === familyMemberId)) {
          const byName = familyMembers.find(m => m.name?.toLowerCase() === String(familyMemberId).toLowerCase())
          familyMemberId = byName?.id ?? null
        }
        await addMeal({
          dayOfWeek: apply.dayOfWeek,
          slot: apply.slot,
          recipeId: apply.recipeId ?? undefined,
          adHocTitle: apply.adHocTitle ?? undefined,
          familyMemberId,
        })
      } else if (s.kind === 'remove') {
        const apply = s.apply as { entryId?: string }
        if (apply.entryId) await removeMeal(apply.entryId)
      }
    } catch (e) {
      console.error('[useApplyMealSuggestion] failed:', e)
      alert(`Couldn't apply: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [addMeal, removeMeal, familyMembers])

  return { applySuggestion }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/hooks/useApplyMealSuggestion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `MealPlanRitualPage` to use the hook (no behavior change)**

In `src/components/meals/plan/MealPlanRitualPage.tsx`:
1. Add import: `import { useApplyMealSuggestion } from '@/hooks/useApplyMealSuggestion'`
2. Near the other hooks (after line ~56): `const { applySuggestion } = useApplyMealSuggestion(weekStart)`
3. Delete the entire inline `const onApplySuggestion = async (s: Suggestion) => { ... }` block (~lines 213–271).
4. Replace its usage in JSX `onApplySuggestion={onApplySuggestion}` (~line 601) with `onApplySuggestion={applySuggestion}`.
5. Leave `onPreviewSuggestion` untouched.

- [ ] **Step 6: Verify no regression**

Run: `npx tsc --noEmit 2>&1 | grep -E "MealPlanRitualPage|useApplyMealSuggestion" || echo clean`
Expected: `clean`
Run: `npx vitest run src/hooks/useApplyMealSuggestion.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git -C .worktrees/symphony-meal-write add src/hooks/useApplyMealSuggestion.ts src/hooks/useApplyMealSuggestion.test.ts src/components/meals/plan/MealPlanRitualPage.tsx
git -C .worktrees/symphony-meal-write commit -m "refactor(meal): extract useApplyMealSuggestion; one shared apply path"
```

---

### Task 3: `symphony-chat` emits `:::meal-request:::` for meal-write intent

**Files:**
- Modify: `supabase/functions/symphony-chat/index.ts` (the `: \`You are Symphony's contextual AI assistant...\`` system prompt — the non-guided branch)
- Test: `supabase/functions/symphony-chat/index_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/symphony-chat/index_test.ts
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { mealHandoffRule } from "./index.ts"

Deno.test("mealHandoffRule instructs the meal-request block + no refusal", () => {
  assertStringIncludes(mealHandoffRule, ":::meal-request")
  assertStringIncludes(mealHandoffRule, "do NOT answer it from notes")
  assert(!/I (don't|do not) have access/i.test(mealHandoffRule))
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd supabase/functions/symphony-chat && deno test --allow-net index_test.ts`
Expected: FAIL — `mealHandoffRule` not exported.

- [ ] **Step 3: Implement**

In `supabase/functions/symphony-chat/index.ts`, add near the top (module scope, exported so it is testable):

```ts
export const mealHandoffRule = `
MEAL PLAN WRITES — IMPORTANT:
If the user asks to add, replace, swap, or remove a planned meal (e.g. "add
pasta to Tuesday this week", "swap Wednesday's dinner"), do NOT answer it from
notes and do NOT say you can't. Acknowledge in one short sentence, then emit a
handoff block exactly in this form (verbatim user request inside):

:::meal-request
<the user's meal request, one line, lightly normalized>
:::

Emit nothing else after the block. The app turns it into editable meal cards.`
```

Append `mealHandoffRule` to the contextual-assistant system prompt. Find the
non-guided branch that begins ``: `You are Symphony's contextual AI assistant.`` and ends with `${contextBlock}\`` (around line 377–390). Change its final line from:

```ts
${contextBlock}`
```

to:

```ts
${contextBlock}

${mealHandoffRule}`
```

(Only the non-guided branch. Do not modify the `guided_reflection` prompt.)

- [ ] **Step 4: Run test, verify it passes**

Run: `cd supabase/functions/symphony-chat && deno test --allow-net index_test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/symphony-meal-write add supabase/functions/symphony-chat/index.ts supabase/functions/symphony-chat/index_test.ts
git -C .worktrees/symphony-meal-write commit -m "feat(chat): symphony-chat emits :::meal-request::: handoff for meal writes"
```

---

### Task 4: `useChat` parses `:::meal-request:::`

**Files:**
- Modify: `src/hooks/useChat.ts` (add `parseMealRequest`, extend `ChatMessage`, call it in `sendMessage` after `parseVaultDraft`)
- Test: `src/hooks/useChat.parseMealRequest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useChat.parseMealRequest.test.ts
import { describe, it, expect } from 'vitest'
import { parseMealRequest } from './useChat'

describe('parseMealRequest', () => {
  it('extracts the request and strips the block', () => {
    const txt = 'On it.\n:::meal-request\nadd pasta to Tuesday this week\n:::'
    const r = parseMealRequest(txt)
    expect(r.mealRequest).toBe('add pasta to Tuesday this week')
    expect(r.content).toBe('On it.')
  })
  it('returns undefined when no block', () => {
    const r = parseMealRequest('just a normal answer')
    expect(r.mealRequest).toBeUndefined()
    expect(r.content).toBe('just a normal answer')
  })
  it('treats an empty block as no request', () => {
    const r = parseMealRequest(':::meal-request\n\n:::')
    expect(r.mealRequest).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/hooks/useChat.parseMealRequest.test.ts`
Expected: FAIL — `parseMealRequest` not exported.

- [ ] **Step 3: Implement**

In `src/hooks/useChat.ts`:

1. Add exported function below `parseVaultDraft` (mirror its shape):

```ts
/** Parse :::meal-request fenced blocks from AI response */
export function parseMealRequest(text: string): { content: string; mealRequest: string | undefined } {
  const match = text.match(/:::meal-request\s*\n([\s\S]*?):::/)
  const body = match?.[1]?.trim()
  if (!body) return { content: text, mealRequest: undefined }
  const cleanContent = text.replace(/:::meal-request\s*\n[\s\S]*?:::/, '').trim()
  return { content: cleanContent, mealRequest: body }
}
```

2. Add to `ChatMessage` interface: `mealRequest?: string`
3. In `sendMessage`, replace the assistant-message construction (lines ~101–109) with:

```ts
        const draftParsed = parseVaultDraft(data.message)
        const mealParsed = parseMealRequest(draftParsed.content)
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: mealParsed.content,
          sources: data.sources,
          vaultDraft: draftParsed.draft,
          mealRequest: mealParsed.mealRequest,
          timestamp: new Date(),
        }
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/hooks/useChat.parseMealRequest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/symphony-meal-write add src/hooks/useChat.ts src/hooks/useChat.parseMealRequest.test.ts
git -C .worktrees/symphony-meal-write commit -m "feat(chat): useChat parses :::meal-request::: into ChatMessage.mealRequest"
```

---

### Task 5: `MealRequestCards` component (modeled on `VaultDraftCard`)

**Files:**
- Create: `src/components/chat/MealRequestCards.tsx`
- Test: `src/components/chat/MealRequestCards.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/chat/MealRequestCards.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MealRequestCards } from './MealRequestCards'

const applySuggestion = vi.fn().mockResolvedValue(undefined)
vi.mock('@/hooks/useApplyMealSuggestion', () => ({
  useApplyMealSuggestion: () => ({ applySuggestion }),
}))
vi.mock('@/lib/askSymphonyMeal', () => ({
  fetchMealSuggestions: vi.fn().mockResolvedValue({
    text: 'Here are options',
    cards: [{ kind: 'add', kicker: 'Tue', title: 'Pasta', why: 'veg-forward',
      apply: { dayOfWeek: 2, slot: 'dinner', adHocTitle: 'Pasta' } }],
  }),
}))

describe('MealRequestCards', () => {
  it('fetches and renders a suggestion, applies on click', async () => {
    render(<MealRequestCards request="add pasta to Tuesday" />)
    await waitFor(() => expect(screen.getByText('Pasta')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(applySuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'add' }),
    ))
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/components/chat/MealRequestCards.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/chat/MealRequestCards.tsx
import { useEffect, useState } from 'react'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { fetchMealSuggestions } from '@/lib/askSymphonyMeal'
import { useApplyMealSuggestion } from '@/hooks/useApplyMealSuggestion'
import type { AskSymphonySuggestion } from '@/hooks/useAskSymphony'

/** Renders meal suggestion cards for a :::meal-request::: handoff from the
 *  general chat. Delegates fetching to the existing ask-symphony-meal
 *  pipeline and applying to the shared useApplyMealSuggestion hook. */
export function MealRequestCards({ request }: { request: string }) {
  const weekStart = sundayOfWeek(new Date())
  const { applySuggestion } = useApplyMealSuggestion(weekStart)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [text, setText] = useState('')
  const [cards, setCards] = useState<AskSymphonySuggestion[]>([])
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = await fetchMealSuggestions(request, weekStart)
      if (cancelled) return
      if (r.error && r.cards.length === 0) { setState('error'); setText(r.error); return }
      setText(r.text); setCards(r.cards); setState('ready')
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  if (state === 'loading') {
    return <div className="mx-2 mb-3 text-xs text-neutral-500">Checking the meal plan…</div>
  }
  if (state === 'error') {
    return <div className="mx-2 mb-3 text-xs text-rose-600">Couldn't reach the meal planner: {text}</div>
  }
  if (cards.length === 0) {
    return <div className="mx-2 mb-3 text-xs text-neutral-600">{text || 'No meal changes proposed.'}</div>
  }

  return (
    <div className="mx-2 mb-3 space-y-2">
      {cards.map((c, i) => (
        <div key={i} className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">{c.kicker}</div>
          <div className="text-sm font-medium text-neutral-800">{c.title}</div>
          <div className="text-xs text-neutral-600 mt-0.5">{c.why}</div>
          <div className="flex justify-end mt-2">
            {appliedIdx.has(i) ? (
              <span className="text-xs text-emerald-700 font-medium">✓ Applied</span>
            ) : (
              <button
                onClick={async () => { await applySuggestion(c); setAppliedIdx(prev => new Set([...prev, i])) }}
                className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-medium transition-colors"
              >
                Apply
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/components/chat/MealRequestCards.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/symphony-meal-write add src/components/chat/MealRequestCards.tsx src/components/chat/MealRequestCards.test.tsx
git -C .worktrees/symphony-meal-write commit -m "feat(chat): MealRequestCards renders + applies meal handoff cards"
```

---

### Task 6: Render `MealRequestCards` in `ChatPanel`

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx` (sibling to the existing `VaultDraftCard` render, ~lines 271–278)

- [ ] **Step 1: Add the render branch**

In `src/components/chat/ChatPanel.tsx`:
1. Add import: `import { MealRequestCards } from './MealRequestCards'`
2. Immediately after the existing `{msg.vaultDraft && onSaveToVault && !dismissedDrafts.has(msg.id) && ( <VaultDraftCard ... /> )}` block (closes ~line 278), add:

```tsx
              {msg.mealRequest && (
                <MealRequestCards request={msg.mealRequest} />
              )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "ChatPanel|MealRequestCards" || echo clean`
Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git -C .worktrees/symphony-meal-write add src/components/chat/ChatPanel.tsx
git -C .worktrees/symphony-meal-write commit -m "feat(chat): wire MealRequestCards into ChatPanel"
```

---

### Task 7: Full verification

- [ ] **Step 1: Full test suite (changed areas)**

Run: `npx vitest run src/lib/askSymphonyMeal.test.ts src/hooks/useApplyMealSuggestion.test.ts src/hooks/useChat.parseMealRequest.test.ts src/components/chat/MealRequestCards.test.tsx`
Expected: all PASS.

- [ ] **Step 2: Deno edge test**

Run: `cd supabase/functions/symphony-chat && deno test --allow-net index_test.ts`
Expected: PASS.

- [ ] **Step 3: Build + lint**

Run: `npm run build` → Expected: `✓ built`
Run: `npm run lint 2>&1 | tail -3` → Expected: no *new* errors vs `main` (pre-existing baseline errors in unrelated files are acceptable; introduce none in the files this plan touches).

- [ ] **Step 4: Manual smoke (requires `.env` copied — see Pre-req)**

`npm run dev`, open the general assistant (ChatPanel), send "add a tofu stir fry to Wednesday this week". Expected: assistant acks, a meal card renders, **Apply** writes to `meal_plan_entries` (verify in the meal planner / wall).

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git -C .worktrees/symphony-meal-write add -A
git -C .worktrees/symphony-meal-write commit -m "chore(meal): meal-write delegation verification" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:** shared apply hook (Task 2 ✓), symphony-chat handoff (Task 3 ✓), useChat parse (Task 4 ✓), MealRequestCards modeled on VaultDraftCard (Task 5 ✓), ChatPanel render (Task 6 ✓), reuse ask-symphony-meal unchanged (Task 1 — standalone caller, pipeline untouched ✓), tests incl. deno contract (Tasks 1–7 ✓), MealPlanRitualPage unchanged behavior (Task 2 Step 5–6 ✓). No spec requirement is unaddressed. Auto-apply-empty correctly absent (deferred per spec).

**Placeholder scan:** none — every code/command step contains literal content.

**Type consistency:** `AskSymphonySuggestion` used consistently (Tasks 1,2,5); `applySuggestion` signature identical across Tasks 2/5; `parseMealRequest` return shape matches its consumer in Task 4; `mealRequest?: string` defined (Task 4) before use (Tasks 5/6).
