# Symphony landing — scroll-craft brief

**Self-authored under explicit creative delegation** (Scott, 2026-09-26: "Use your judgment").
Scott's recorded choices from that same prompt:

- Imagery: **real app surfaces**, no generated photography. There's no generation key, and the page should be honest about what the product does.
- Structure: **my call**.
- Copy: **keep the message, new words OK.** Every claim must stay inside what the current landing already says (checked against the parity punch list, 2026-09-02). No new capability claims.

Evidence used: `landing/index.html` (the live page), `POSITIONING.md`, `src/index.css` (the app's design system: Crimson Pro + DM Sans, neutral #FBFBFA page, place accent, Woodsy Cabin forest green by default), `src/components/place/*` (the place skylines and the PlaceBand behind desktop navigation), `src/components/layout/MastheadCard.tsx` (the open daybook masthead), `src/lib/domainColors.ts` (life-area dots).

## The eight topics

1. **Vibe:** calm, capable, domestic, unhurried, a little bookish. References: a well-kept paper planner, the kitchen wall calendar, *Kinfolk*'s whitespace (not its palette).
2. **Journey:** everything arrives in a pile → each thing gets a home → the horizons, year to today → one task, followed all the way down, arrives ready → the rest of the week holds up → leave your email.
3. **Energy:** calm open, busier as the inbox fills, quiet at the cadence strip, loudest in the descent, calm and confident after, still at the close.
4. **Feeling, and the one moment:** see the curve below. The moment: following one errand from the year down to this morning and ticking it.
5. **What no other site does:** the visitor ticks one box on Today, and the same checkmark lands on the week's list and the month's list stacked behind it.
6. **Range:** editorial, close to premium-minimal but warmer. It's paper and ink, and it uses the app's own neutral page. No cream and no brass (Scott, 2026-09-23: "no cream, no brown or red cast").
7. **World vs scenes:** distinct scenes, but every scene is the product surface itself.
8. **Assets:** the app's design system, the five place skylines (Woodsy Cabin is the default), the wordmark. No photography.

## Grammar: Live surface

The honest pitch is "watch what it does", and the app has a real, specific idiom: the daybook masthead, ruled rows, the life-area dots and the place band. Every panel is real markup with sample data, and the page says so. The other seven grammars lost for these reasons:
- **Filmic one-shot:** needs footage, and it would hide the product behind mood.
- **Chaptered editorial:** close (the horizons are a natural set of chapters), but it forbids the one continuous object the peak depends on: one task persisting across pages.
- **Continuous world:** there's no real geography to travel through.
- **Typographic poster:** the asset is the product, not a sentence.
- **Gallery:** the visitor's question is "does this fit my life", not "what are the options".
- **Split stage:** there's no honest two-sided argument. A "chaos vs. calm" split would be a cliché.
- **Rhythmic cutlist:** wrong energy for a calm household tool.

## Journey

1. Recognition: the Inbox filling with a real week's worth of things
2. Turn: every item gets a home (horizon, life area, context)
3. Breath: plan at the pace that suits you
4. Proof (peak): one task, from the year down to today, arrives with what you need
5. Substance: routines, reviews, paper and phone hold it up
6. Commitment: leave your email in the capture bar

## Feeling curve

```
1  Recognition   the Inbox fills a line at a time with the ordinary pile of a family week; the count climbs under their hand
2  Relief        a wipe, and the same pile is sorted: Today, this week, this month, each with a coloured life area and its context
3  Calm          plain type on paper: year, season, month, week, today, and "you don't have to plan your whole life first"
4  Awe → clarity the planner pages stack in depth; the year's goal, the season's, the month's task, the week's, and today's row opens with the number and last notes
5  Confidence    the rest of the surface slides past sideways: a routine's own checkmarks, a review's four choices, a photographed paper plan
6  Resolve       everything stops at one input with a cursor in it: the Inbox capture bar, asking for their email
```

**Peak:** act 4. *"I followed one errand from the year all the way down to this morning, ticked it, and the same tick showed up on the week and the month behind it."* It has the most scroll room (4.0vh against 1.8–3.0 elsewhere), and act 3 is the silence before it.

**Tell-someone sentence:** *It's the site where you follow one errand from your year down to this morning, tick it, and it's done on every page it lived on.*

**Authored silence:** act 3 is deliberately plain (flow, no pinning), so the descent has something to arrive from. It is short, not dead.

## Signature move

**One checkmark, every page.** At the end of the descent, Today's task is a real button. Ticking it cascades the same checkmark up through the week and month pages peeking behind it, and a status line confirms "Done on Today, this week and this month. One task, one checkmark." Tick it again to undo. Goals (year, season) are deliberately left alone, because a task doesn't complete a goal.

## Score

| Beat | Device | Why this one |
|---|---|---|
| Recognition | `pin` + page-local stream, `parallax` place planes | The surface is already in a state; items arriving under the hand is "life brings things" made physical |
| Relief | `reveal` (wipe, left) inside a pin | A wipe is a change of state: pile → sorted |
| Calm | `flow` + `in` | The only act that reads like a document; it's the quiet before the peak |
| Proof (peak) | `pin` + page-local depth stack (scale, overlap, shadow) + signature | Pages recede like a planner; the task persists as the one continuous object |
| Substance | `pan` | Lateral travel reads as breadth: "and the rest of the week" |
| Commitment | `flow`, actual input | Live surface ends on something the visitor puts a cursor in |

Families: pin, parallax, reveal, flow, pan (five). There's no family twice in a row and no `scrub`. Total is about 12.9vh over 6 acts, outside the 13.6–13.8 band.

## Honesty constraints

- Sample household (Sam, Jess, Mia, Leo), labelled on the page as a sample. Nothing is saved.
- Only claims the live landing already makes: capture to Inbox; domains (Work/Personal private, Family shared with the household); year/season/month/week/today horizons; one task with one checkmark across week and today; context on the task (number, notes, last time); routines with per-occurrence checkmarks; reviews that carry forward; Plan from paper; plan on the computer, carry the day on the phone; ten founding households, personally onboarded, $25/month locked for life.
- No counters, no statistics, no testimonials.

## Addendum 2026-09-26: Your place

At Scott's request the hero carries the app's own theme picker ("Your place": Densely Urban, Small City, Small Mountain Town, Woodsy Cabin, Farm). Each place re-tints the page, the accent and the skyline planes, using the values from `src/index.css` and `PlaceSkyline.tsx`. The choice is remembered per visitor in localStorage. Life-area colours never change.
