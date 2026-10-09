# Branching plan study

Preview: http://127.0.0.1:5245/scripts/plan-shapes/index.html

Replaces the single-line-per-horizon experiment. Nodes have stable IDs, an optional parent, and a horizon. Each parent can have multiple children at the next horizon. All yearly intentions are gathered together; each subsequent page groups all branches by yearly intention and immediate parent. Independent entries need no invented ancestors. Add another beside a parent creates a sibling; editing changes only that node. Missing intermediate horizons have an explicit return path. See all branches reveals the tree.

Family sample includes two seasonal milestones, three monthly plans under More unhurried weekends (picnic, movies, baseball), and multiple weekly picnic actions. Browser-added a fourth monthly sibling successfully without changing the others. Nineteen tests across prototype models/voice pass, including four new branching tests; lab TypeScript passes. Screenshot: ../../docs/planning/living-canvas-evidence/branching-month.jpg.

Local fictional data only, resetting on reload. No account, live voice, dates, cross-tab synchronization, reparenting or transfers to Today. Physical phone and full accessibility verification remain. Visual treatments share the corrected structure; further animation and graphical development remain.

## Vocabulary and scheduling

Year = Intention; Season = Goal; Month = Milestone; Week = Action; Day = Task. Optional task steps are children of actions, not automatically a new horizon. Actions and steps have their own optional date and completion state. Day selects those existing IDs rather than copying them. Independent Day tasks start on the selected date. Parent/child completion is deliberately independent; no automatic rollup yet. Browser checked scheduling the weather step without scheduling its action or sibling. Twenty-three tests pass, including schedule identity, child independence, completion independence, and invalid dates.

## Visual direction after review

Constellation is the default. Branching panorama was removed after user review because its scrolling hierarchy was cluttered. Orbital focus remains an alternative experiment. Season shows the yearly intention once as compact context and gives prominence to seasonal goals. Month and Week name the current items explicitly. Edit controls say Edit; dialogs identify the specific item type, explain wording changes, and offer Save changes. Desktop Season and edit dialog visually verified; narrow-screen follow-up remains.
