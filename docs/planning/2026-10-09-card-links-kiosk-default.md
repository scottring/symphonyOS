# Existing horizon links and default kiosk

Request: link existing horizon cards and make the approved kiosk available in production.

Select a seasonal goal, monthly milestone, or weekly action and use “Link or change parent.” The parent picker uses already authorized, filtered cards at the preceding horizon and selected planning date, including cards currently hidden by branch focus. It supports change/removal without creating a duplicate or changing scheduling. Year intentions have no parent. One record committed to two adjacent periods keeps its same-record relationship; this cannot be independently reparented at only one appearance with the existing data model.

Season links use goalId. Month/week links reuse relinkUpdates and its legacy fallback removal rules. No schema or permissions changes. Failed saves retain selection; dates and editor controls lock while saving. Link choices reflect filters and period, rather than searching private or other-period data.

The normal /wall-v2 route now renders ConnectedWall, previously opt-in via view=workspace. Existing /wall redirects continue to work. Recipes, groceries, routines, utility sheets, phone callbacks and dark theme remain on the existing wall shell. This does not add kiosk voice.

Validation before release:
- 30 focused tests: create failures, existing seasonal/year link, monthly link retry, weekly unlink clearing fallback, journal grouping, existing kiosk interactions.
- Production build passed.
- Signed-in disposable account: linked existing picnic seasonal card to “Constellation test: make time outdoors”; reloaded and confirmed persisted connection.
- Plain local /wall-v2 shows approved household header, tools, schedule, family question and routines.

Released b02506f3. Mandatory pre-push: 806 files, 8,336 tests passed, 3 skipped; typecheck passed. Vercel dpl_88xs6Ev1xbqZcanezuNeSy6vwRaT Ready and aliased to app.symphony-os.com. Browser verified plain production /wall-v2 renders approved household tools/layout, and existing seasonal card opens the parent picker; canceled without modifying that production record. Screenshot of tested linking UI: /private/tmp/symphony-card-link.png.
