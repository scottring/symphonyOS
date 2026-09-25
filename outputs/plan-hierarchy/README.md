# Does a step read as being under its goal?

Scott, 2026-09-24: on a plan page a goal wears a tick, a caret and a goal
glyph, while a step wears only a tick — so the goal's **title** started further
right than its own children's, and the hierarchy read backwards.

happy-dom does no layout, so the test suite cannot answer "is this title to the
right of that one". Chromium can.

```
npm run build
npx vitest run --config outputs/plan-hierarchy/vitest.config.mts
node outputs/plan-hierarchy/check-indent.mjs
```

It renders a goal with steps, a goal without, and the "Add a step" field, with
the built stylesheet inlined, and measures where each title's left edge lands
at 1200px and at 390px:

- a step's title is to the **right** of its goal's;
- steps agree with each other;
- goals in one list start at the same x, with or without a disclosure;
- the "Add a step" field starts where a step's title does.

## Before and after

```
desktop   before   goal 105 · goal-without 91  · step 57   ← child 48px LEFT of parent
          after    goal 105 · goal-without 105 · step 129  ← child 24px right
phone     before   goal  79 · goal-without 55  · step 45
          after    goal  79 · goal-without  79 · step 103
```

The lane widths are named once in `index.css` (`--plan-lane-caret`,
`--plan-lane-glyph`, `--plan-lane-gap`, `--plan-step-indent`) and both the
caret placeholder and the step indent are derived from them, so the two cannot
drift apart again — which is how the goal came to sit to the right of its child
in the first place. `PlanRow.test.tsx` pins the structure; this pins the pixels.
