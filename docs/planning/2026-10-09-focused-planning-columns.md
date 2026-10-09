# Independent horizon columns and focused branches

Requested by Scott after the live conversation canvas test.

The connected planning map now gives each desktop horizon a fixed header and independently scrolling card area. On narrow screens it remains a single page scroll. Selecting a card shows only that appearance, its ancestors, and all descendants, preserving multiple children at every horizon. Show all plans (or selecting the same card again) restores the complete filtered dataset. Focus is presentation state only. Focused columns shrink to their content, up to their normal maximum height.

The production screenshot was /week, which still uses standard Open journal. The redesigned connected workspace is /week?view=alongside, and the four-horizon map is /year?view=constellation&horizon=3. The Week page now has explicit links to both views so these are discoverable without manually entering query parameters. Existing route defaults and saved data are unchanged.

Validation: branch model tests cover ancestors, multiple descendants, unrelated siblings, and missing/filtered parents. UI test restores hidden plans without writes. Browser verification: scrolling Month changed only its scrollTop (1173px); other horizon columns stayed at zero. Selecting the sample seasonal baking goal retained both milestones and its weekly action (4 cards total), hiding 20 unrelated cards. Build passed.
