---
description: Screen a job posting for fit before generating an application. No files written — just an honest match assessment against Scott's lanes, hard requirements, and comp targets.
argument-hint: <JD-URL | pasted-JD-text>
---

# /screen — Job Fit Screener

You are screening a job posting for Scott Kaufman to decide whether it's worth applying to. **Output is terminal-only. Do NOT write files. Do NOT call `/apply`.** This is the cheap upstream gate before any tailoring work.

## Required reading

Before screening, read these files and apply their constraints:

- `~/Documents/scotts-world/job-search/resume-generic.md` — master resume content (the truth about Scott's actual experience).
- `~/Documents/scotts-world/context/job-search.md` — search lanes and currently-active applications.
- `~/Documents/scotts-world/context/scott-overview.md` — Scott's current priorities, financial situation, and constraints.
- `/Users/scottkaufman/.claude/projects/-Users-scottkaufman-Developer-Developer-symphonyOS/memory/feedback_resume_regulatory_claims.md` — what regulatory experience Scott can actually defend.
- `/Users/scottkaufman/.claude/projects/-Users-scottkaufman-Developer-Developer-symphonyOS/memory/feedback_sustainability_role_framing.md` — Scott's read of the sustainability hiring market (industry-experience gaps don't matter on sustainability roles; don't pad regulatory claims).

## Input

`$1` is either a URL to a job description or pasted JD text. If URL, fetch with WebFetch. If WebFetch returns 4xx/5xx, ask the user to paste the JD body, then proceed.

## Output (terminal only — no files)

Print a structured screen with these four sections, in order:

### 1. Role snapshot (3 lines max)

```
Company: <name>
Role: <title>
Comp: <range or "not listed">
Location: <city/state | remote | hybrid | "not listed">
Type: <one of: Lane 1 (Director Sustainability) | Lane 2 (Climate-tech PM/RegTech) | Lane 3 (UX leadership) | Outside lanes — describe in 5 words>
```

### 2. Match table

A compact table comparing the JD's hard requirements (from minimums + clearly-stated preferred) to Scott's actual experience. Use these markers:

- **✅ Met** — Scott has direct, defensible experience.
- **⚠️ Stretch** — adjacent experience that's defensible with framing.
- **❌ Miss** — Scott doesn't have it; not honestly bridgeable.

Format:

```
| Requirement                       | Status | Note                                    |
|-----------------------------------|--------|-----------------------------------------|
| <e.g., PhD or MS in Env Eng>      | ✅     | Columbia PhD, 2008                      |
| <e.g., 5+ yrs power plant ops>    | ❌     | No power industry exposure              |
| <e.g., NPDES permit experience>   | ❌     | No water-permit work                    |
| <e.g., regulatory interpretation> | ✅     | GHG Protocol, REACH, PAS 2050, ISO LCA  |
| <comp vs target>                  | ✅/⚠️/❌ | $X target; this posts $Y–$Z            |
```

Include only the requirements that are actually load-bearing for the screen. Skip "Microsoft Office Suite proficiency"-type filler.

### 3. Verdict (one line, then 2–3 bullets of reasoning)

Pick ONE of:

- **Strong fit — apply.** ≥3 ✅ on load-bearing reqs; 0–1 ❌; comp acceptable.
- **Stretch — worth a shot.** Clear ❌s but the foundational fit (PhD + regulatory + project mgmt) is real, AND the role would be valuable runway. Honest framing in cover letter required.
- **Skip — too far off.** Multiple load-bearing ❌s with no honest bridge, OR comp materially below target with no offsetting upside, OR the role isn't actually one of Scott's lanes.

Then 2–3 short bullets:
- The one or two specific things that drove the verdict (positive or negative).
- If "Stretch — worth a shot": what to flag honestly in the cover letter.
- If "Skip": one sentence on what would change the verdict (if anything).

### 4. Suggested next action

If verdict is Apply or Stretch: `Run /apply <same JD URL or text> to generate the four-file bundle.`

If verdict is Skip: `No action. Capture the company name to context/job-search.md only if it's a target you want to track for future postings.`

## Calibration rules

- **Be honest, not optimistic.** Scott has been in the sustainability hiring market for years and reads it accurately. Don't soften ❌s into ⚠️s to make him feel better. The screen's job is to save him time, not validate him.
- **Don't pad regulatory claims.** If the JD lists ESPR/DPP/CSRD/CBAM as required and Scott can't defend hands-on, that's a ⚠️ at best, ❌ if it's truly load-bearing. See `feedback_resume_regulatory_claims.md`.
- **Don't penalize industry-experience gaps on sustainability roles.** A footwear sustainability role asking for "5+ yrs in footwear" is wish-list filler — mark as ⚠️ with a note, not ❌. See `feedback_sustainability_role_framing.md`.
- **Comp target is roughly $80–100K floor** per `context/scott-overview.md` (career situation: "wants W2, ~$80-100k"). Anything well below is ❌; anything above and Scott is more flexible on other dimensions.
- **Lane membership matters.** A role that's outside all three named lanes (e.g., environmental engineering at a power utility) can still be a Stretch — but flag it as outside-lanes so Scott calibrates expectations.

## Failure modes

- **WebFetch fails** → ask Scott to paste the JD body.
- **JD is paywalled / requires login** → same fallback.
- **Required reading file missing** → STOP and report which file is missing rather than guess at framing.
- **JD is for a role Scott already has in flight** (check `context/job-search.md` target table) → flag this in the screen output and ask if he wants to proceed anyway.
