# Conversation-first design rehearsal

Isolated from production: run Vite and open `/scripts/conversation-lab/index.html`.
No app entry points, account credentials, database writers, model calls, or microphone access. Draft storage uses a separate local key via the existing planning draft serializer.

## Design contract

- One conversation alongside one visible, editable plan.
- Work across intentions at a horizon before moving to the next horizon.
- Start at any horizon; allow freeform unlinked work.
- Whole-horizon checkpoints, explicit progress, edit without restarting, pause/resume.
- Today selects existing weekly tasks rather than duplicating them.
- Use the existing planning reducer, not a second data model.

## Deliberate limits

This is a scripted typed rehearsal, not an AI conversation or live voice. It does not parse multiple intentions from a paragraph or execute correction commands; users edit plan cards directly. Exact parent selection when several seasonal/monthly lines serve one intention still needs design work before connecting to real records. No production route or deployment.

Next review: run one full planning conversation together, then test with someone unfamiliar with Symphony. Refine the questions and corrections before adding a model adapter. Live model transmission, voice latency/cost limits, and real-account write integration require a separate implementation and verification stage.
