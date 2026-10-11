# Home: a page to get your bearings (2026-10-11)

**Route:** `/overview` (`/home` is the House app). **Reached by:** the Symphony mark (desktop) and the dock's Home (phone). The app still opens on Today.
**Approved mockup:** https://claude.ai/artifact/PphxtskNXVv9KU8GGnqH5M (Scott: "it's PERFECT, ship it").

## What it shows, top to bottom

1. **Masthead.** The daybook numeral, a greeting, the date and weather. When the area or people filter is narrower than everything, one line says so ("Showing Work only, for Iris").
2. **A good next step.** One suggestion picked from the state (`src/lib/home/bearings.ts`, `nextSteps`). The order is: plan an unplanned week (while ≥3 days remain), look back at a month or season that closed with open lines, write an empty month, sort an Inbox of ≥5, choose for today, else go do today. "Not now" sets one aside for the rest of the day on this device (`symphony-home-set-aside`).
3. **Today.** A "next up" sentence, the day's events and the things chosen for today, with "↳ for" the month line each was written for.
4. **Waiting on you.** Inbox, unread discussions and pending look-backs. It never repeats the suggestion, and it is hidden when empty.
5. **Where you are.** Year · Season · Month · Week · Today, each with a status in words and one line from its list. Today is marked "You are here", and an unplanned week is marked for attention.
6. **Everything else.** Library destinations with one-line descriptions, for orientation.
7. **The place's landscape at full strength,** in flow below the page (`PlaceScenery vivid`). Every other page keeps its faint scene.

## Rules it keeps

- **Same lens as the pages.** Tasks use `filterTasksForLayers` and the people lens (`planPeopleLens`), with the same period selectors as Month, Season and Week. Events use `filterEventsForLayers` (with calendar mappings, overrides, and family sharing), hidden events, and the people filter on event notes. Discussions about a task follow that task's area. Discussions about events or routines show only with every area on.
- **No scoreboards.** Small numbers are written out in sentences, and there are no tallies or percentages.
- **Phone dock is now Home · Today · + · Plan · More.** Plan opens the week, and its title menu (plus Home's ladder) reaches Month, Season and Year.

## Not yet

- The "sense of place" fore-edge (time already spent in each horizon, drawn as page edges under each step of "Where you are") is proposed and not built. See `claude/rail-edges` for the earlier rail version.
- Routines are not listed in Home's Today.
