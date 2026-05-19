# Inline Capture — Manual Verification Matrix (for PR)

Branch: feat/interactive-timeline. Run dev server FROM THE WORKTREE
(cp .env into the worktree first if missing) — do NOT use the shared main worktree.

- [ ] Desktop: pick Task at a gap → inline serif input + chips appear; type
      "Dentist 3pm #<project>" → time + project chips render; click a chip ×
      → chip clears (input stays open); Enter → bottom-left confirm toast
      "Task added · 3:00 PM" with Undo; Undo removes the task.
- [ ] Desktop: pick Event → inline input; Enter "Standup" → Google Calendar
      event created at the gap's anchor (+30m); Undo deletes the GCal event.
- [ ] Desktop: pick Routine → inline input; Enter → routine at hh:mm; Undo
      deletes it.
- [ ] Desktop: pick Note → existing TimelineNoteComposer opens (unchanged);
      create-new → "Note added" confirm + Undo.
- [ ] Empty Morning/Afternoon/Evening section: single full-width + → wheel →
      input works the same.
- [ ] Esc / clicking the + again dismisses the inline input with no create.
- [ ] Mobile (<768px): input + chips reachable; toast tappable.
- [ ] Wall kiosk (TV ~8 ft): serif input legible; Undo target ≥64px.
- [ ] No emojis in any toast message (plain text + "·").
