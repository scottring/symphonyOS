# Kid pages on the wall — design

Brief: vault `projects/symphony-os/briefs/2026-09-03-kid-pages-on-the-wall.md`.

## 1. Digest → wall, hands off
`DIGEST_TO` on the Fly worker now includes the household inbound address
(`4495671b582ff10b@symphony-os.com`), so the 17:00 school digest reaches
`inbound-email` → `extract-email` with nobody forwarding. Gmail copies stay.
`inbound-email` labels a `School digest …` subject "School digest" rather than
the sending parent, so notices read as school mail.

## 2. Reading earns screen time
- One target routine per kid: "Read", 20 minutes, daily, assigned to the kid.
- Kid page "Reading" card: a Start/Stop timer (persisted in localStorage per
  kid+day so the page's idle-close cannot lose it) plus the existing +5/+10/Exact
  chips. Stop logs whole minutes through `addProgress`.
- Earned screen time = min(minutes read today, 20). Written as ONE
  `screen_time_adjustments` row per kid per day, reason `Reading`, updated in
  place (never a second row). The card shows the earned number big.
- `computeScreenTimeSummaries`: a child is anyone who is not a parent and not a
  full user (Scott's kids carry role_label 'family'); with no budget row the
  base is 0, so "read nothing, earn nothing" holds.

## 3. School and FFG as blocks; walk/pickup on the on-duty parent
- Calendar carries two new weekday series on the family calendar, flagged Free:
  `School — Ella & Kaleb` 7:30–2:10 and `FFG — Ella & Kaleb` 2:10–5:30
  (Mon–Thu; Fri 2:10–4:00). Times live on the calendar, not in code.
- Gantt: a free event two hours or longer is a **stay** — a pale filled box with
  the label inside, on the kid's row. A free event wholly inside a stay on the
  same row is not drawn (the stay already says where they are).
- Attribution: a **handoff** event (title starts with walk / pick up / drop off /
  take / drive / bring / collect) belongs to an adult, not to the kids it names.
  With an explicit assignee (`event_notes.assigned_to`, instance first, then
  series) it draws on that parent's row; unassigned it draws on the Everyone row.
  The wall now loads `assigned_to` alongside `is_free`.
- The strip's question card asks the open handoff questions: today's not yet
  started, and tomorrow's from 17:00 (same threshold as Needed Today). Tapping
  opens a sheet with the adults' faces; a tap writes the assignment for that
  instance and the board redraws.

## 4. Two or three more things a kid would use
- **Today at school**: the kid's special (from the Specials rotation via
  `titleForMember`), the sentence in its description that names the kid
  ("Ella has PE — sneakers."), and who picks them up and when (the day's
  pickup event + its assignee). After 17:00 it adds tomorrow's special.
- **What to wear**: one line from the weather (rain → raincoat, cold → coat,
  cool → jacket, warm → shorts).
- **Screen time** (from §2).

## Guardrails honoured
Kid page scrolls by drag (`useDragScroll`) because the Pi's touch is a mouse.
Touch targets ≥ 56px, text ≥ 0.85rem, Nordic wall tokens only.
