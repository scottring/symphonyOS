# Branching plan study

Preview: http://127.0.0.1:5245/scripts/plan-shapes/index.html

Replaces the single-line-per-horizon experiment. Nodes have stable IDs, an optional parent, and a horizon. Each parent can have multiple children at the next horizon. All yearly intentions are gathered together; each subsequent page groups all branches by yearly intention and immediate parent. Independent entries need no invented ancestors. Add another beside a parent creates a sibling; editing changes only that node. Missing intermediate horizons have an explicit return path. See all branches reveals the tree.

Family sample includes two seasonal milestones, three monthly plans under More unhurried weekends (picnic, movies, baseball), and multiple weekly picnic actions. Browser-added a fourth monthly sibling successfully without changing the others. Nineteen tests across prototype models/voice pass, including four new branching tests; lab TypeScript passes. Screenshot: ../../docs/planning/living-canvas-evidence/branching-month.jpg.

Local fictional data only, resetting on reload. No account, live voice, dates, cross-tab synchronization, reparenting or transfers to Today. Physical phone and full accessibility verification remain. Visual treatments share the corrected structure; further animation and graphical development remain.
