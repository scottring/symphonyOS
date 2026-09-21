# Navigation hierarchy

The primary destinations are Today, Plan, Inbox, and More on desktop and phone.
Plan defaults to Week and remembers the most recently opened period view in local
storage. Only the period name is stored; existing /week, /month, /season, and /year
routes and deep links are retained. Week ranges remain available inside Plan.

Week, Month, Season, and Year are page-local links within Plan. They are not
parallel top-level destinations or hidden in More. Someday and Routines remain
in More.

Choose tasks opens the existing selection panel without navigating. On desktop
it is a page tool outside the main navigation. Today and Week retain their
mobile date-aware sheet controls; other period pages also offer the sheet.
Panel headings and accessible labels use Choose tasks. Scheduling, focus,
completion, data access, and task placement are unchanged.

Validation: targeted navigation, panel, Today and Week tests; production build;
full-suite check; actual navigation-component rendering at 1280px and 390px.
The browser check used a local fixture, not a signed-in production walkthrough.
