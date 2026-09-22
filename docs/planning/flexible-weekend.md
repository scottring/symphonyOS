# Flexible weekend planning

Scott clarified on September 22, 2026 that “Plan for this weekend” means either Saturday or Sunday, without assigning a day or time.

The task chooser exposes the action in each open task’s Plan menu with the exact dates. On Week it uses the Saturday in the displayed week; on Today it uses the coming weekend, including the current weekend on Sunday. It updates the existing task, keeps higher commitments, adds its week commitment and stores a Saturday in `tasks.weekend_start`. The window includes Sunday even when Sunday begins a new calendar week. It creates no calendar appointment, duplicate task or automatic new-week commitment.

The week list and chooser show the dates. A task is available to choose on Sunday across the week boundary. Choosing either weekend day retains that context. Explicitly replanning outside the window, sending it to Someday, or keeping/dropping its week commitment clears the old weekend preference. Completion remains completion of the same task.

Apply `supabase/migrations/2026-09-22_task_weekend.sql` before using the action against a database. The migration only adds a nullable date and Saturday constraint; existing rows and RLS policies remain unchanged. The migration was applied to the linked shared database with Scott’s approval on September 22, 2026. The app deployment remains separate.
