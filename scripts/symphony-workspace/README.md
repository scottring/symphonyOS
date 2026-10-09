# Cohesive Symphony workspace study

Open `/scripts/symphony-workspace/index.html` on the local prototype server. Fictional data only; reload resets state. No Supabase writes, microphone, AI requests, calls or deployment.

## Clickable coverage

- Today includes a calendar event, actions, routine occurrence and meal.
- Weekly choices reveal/collapse; selecting details takes their space. Closing details restores choices.
- Weekly actions can be placed onto Today by button or drag, maintaining local identity and connection.
- Notes survive switching Details/Conversation and closing/reopening an item. Save-failure scenario preserves draft wording.
- Week groups actions under monthly context and accepts repeated linked entry; independent capture also works.
- Plan shows all items within each horizon before continuing. Multiple items can be added. This is a presentation study, not a full editable relationship graph; reuse the connected planning model on integration.
- Kitchen opens recipe details and a cooking takeover; routine occurrence checks are shared between Today details and Routines.
- Search finds sample tasks. Capture creates local tasks.
- Device controls show desktop, phone-width and larger kiosk treatment. Use real viewport checks as well.
- State menu demonstrates loading, empty, filtered, failed notes save and disconnected calendar. The filter state is explanatory, not an implemented permission filter; all sample content is Family.

## Evidence and limits

Browser checked desktop populated details, draft retention across conversation, weekly action placement and kiosk composition. TypeScript lab check passed. Conversation is deliberately scripted and labeled. Existing notes/attachments/people/location/contact calling capabilities are mapped in the inventory; most are not interactive in this study. Calendar editing, routine pattern editing, full relationship editing, household switching and live voice remain in the existing app or later integration.

Before production integration: add focus trapping/restoration to phone sheet and cooking takeover, wire shared existing detail surfaces and commands, use actual period/date selectors and permissions, verify all relevant data survives failures and navigation. No replacement of production surfaces is implied by this prototype.

## Symphony identity reconciliation

`theme.ts` reads the production `src/index.css` token definitions and place overrides as raw source, without applying production layout selectors. `identity.css` maps the study's surfaces, typography, text, borders and accents to those tokens. The existing tree logo and Marcellus wordmark replace the placeholder mark. Layout and spacing remain in `style.css` unchanged. The preview theme selector is session-local; it never writes localStorage or a user profile. Woodsy Cabin and Farm were visually checked with Today/details; lab TypeScript passes. This preview adapter should be replaced by the existing PlaceProvider during real-app integration, not duplicated there.

Scenery restoration: the study now reuses Symphony's actual painted and woodblock scenery through `sceneryArt`, with local preview controls for place, art style, and lighting. Artwork sits below the content in normal flow, smaller on phones and more generous on kiosk; no saved account preferences are changed. Desktop painting and woodblock and narrow-phone woodblock were visually checked; the lab TypeScript check passes. Evidence: `docs/planning/living-canvas-evidence/workspace-scenery.jpg`.

Footer correction: scenery now sits outside the constrained app/workspace and spans the screen edge to edge. Phone simulation confines it only to the simulated device width. Content alignment is unchanged.

Copy convention: follow legacy Symphony's factual page names, dates, periods and action labels. Removed aspirational mastheads, introductory slogans and decorative footer copy. Today uses its date; Week its date range; Plan the selected year/season/month/week; Meals and Routines their functional names. Preserve this convention during connected integration.

Kiosk now renders `Kiosk.tsx`, adapted from the earlier `symphony-design-study` wall layout, rather than a larger desktop page. Recipe checks survive returning home; adding basil opens the local grocery list; child routine checks are local. Phone and conversational planning explicitly report their unconnected status. Keyboard navigation moves focus to each new screen heading. Preview scenario selection is disabled on this dedicated surface because those desktop scenarios are not implemented here. The real kiosk's scratchpad, upcoming list, freshness, and utility sheets must be preserved during integration.
