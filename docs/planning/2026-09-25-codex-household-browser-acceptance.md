# Same-household browser acceptance — Scott and Iris

User-led browser walkthrough, September 25, 2026. Owner identified by Scott
as smkaufman@gmail.com; member irisleviner@gmail.com, Leviner-Kaufman household.

Scott confirmed through separate signed-in sessions:
- Iris could see the disposable shared Family task `QA household sharing`.
- Iris moved it to a week; it remained there after reload.
- The owner refreshed and saw the same week placement.
- The owner created `QA private access` as Personal/private. Iris refreshed
  and searched for the exact title and could not see it.
- Scott acknowledged completion after being asked to delete only these two
  fixtures. Cleanup was user-reported, not independently checked in the DB.

Evidence is Scott's interactive confirmations, not captured network logs.
This walkthrough verifies shared editing/persistence and private UI visibility;
it does not independently exercise direct unauthorized API writes (covered by
separate prior permission tests).

The former :5211 server had been stopped during Claude's earlier cleanup.
Codex rebuilt a separate /tmp/symphony-household-preview-5211 with
VITE_PLACEMENT_RPC=true and served it on 127.0.0.1:5211 for this walkthrough.
That server was stopped with SIGINT after Scott's cleanup acknowledgment.
:5199 was not modified. No production enablement, deployment or migration
was performed by Codex during this walkthrough.
