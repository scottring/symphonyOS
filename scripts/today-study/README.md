# Today comparison

Local prototype: `/scripts/today-study/index.html` on the existing port 5245 server.

Three presentations share a single in-memory task model: Alongside, On demand, Conversation assisted. Schedule through a date selector, Plan for today button, or HTML drag/drop onto a day tab or selected-day region. Add independent tasks, complete/reopen, and switch layouts without resetting. Fixed sample dates October 12–14, 2026; no account integration or persistence. Conversation is explicitly scripted and only reveals choices.

Validation: TypeScript and 15 tests across the canvas and Today models pass. Browser-verified Plan for today and variant switching preserve task/connection. Desktop visual captured in ../../docs/planning/living-canvas-evidence/today-comparison.jpg. Browser automation drag attempt produced no state change; drag behavior requires further verification before approval. Phone CSS stacks the columns; physical touch testing remains outstanding. Production selectors and authenticated demo-account persistence are not yet connected.

## Selected direction

The comparison now has one Alongside layout. A Show/Hide this week control toggles the weekly column without changing tasks. It starts visible on desktop and collapsed below 700px. The scripted conversation reveals the same column. Browser-verified scheduling followed by hide/reopen retains the task and connection. TypeScript passed. Drag and physical-phone validation remain outstanding.

## Dashboard pass

Added sample calendar appointments, a day-specific evening routine, and an inline recipe. Monday’s routine checks remain on Monday when browsing Tuesday; they return when returning to Monday. Browser checked task completion into Completed, scheduling for Tuesday, and native dragging of the picnic task from Week into Today with its parent connection retained. The previous desktop drag-verification gap is resolved; physical touch/phone and real account integration are still outstanding. Screenshot: today-dashboard.jpg in the evidence directory. Fifteen existing model/voice tests and lab TypeScript pass; routine behavior was browser-checked, not included in those unit tests.
