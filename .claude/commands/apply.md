---
description: Generate a tailored job application — resume, cover letter, role-description capture, and apply task — into Scott's vault from a JD URL or pasted text.
argument-hint: <JD-URL | pasted-JD-text>
---

# /apply — Job Application Generator

You are generating a tailored sustainability job application for Scott Kaufman. Output goes to Scott's Obsidian vault at `~/Documents/scotts-world/`.

## Required reading

Before generating, read these files and apply their constraints:

- `~/Documents/scotts-world/job-search/resume-generic.md` — master resume content. Pull bullets from here; do not invent new ones.
- `~/Documents/scotts-world/context/job-search.md` — search lanes (Director of Sustainability / Climate-tech PM / UX leadership) and target framing.
- `~/Documents/scotts-world/context/scott-overview.md` — Scott's current priorities and constraints.
- `/Users/scottkaufman/.claude/projects/-Users-scottkaufman-Developer-Developer-symphonyOS/memory/feedback_resume_regulatory_claims.md` — only claim regulatory experience Scott actually has (REACH, GHG Protocol, PAS 2050, ISO LCA, SBTi). Do NOT pad with EU acronyms (ESPR, DPP, CSRD, CBAM) he can't defend.
- `/Users/scottkaufman/.claude/projects/-Users-scottkaufman-Developer-Developer-symphonyOS/memory/feedback_sustainability_role_framing.md` — lead with sustainability expertise confidently. Industry knowledge is learnable; don't apologize for industry-experience gaps.
- `~/Documents/scotts-world/docs/superpowers/specs/2026-05-05-symphony-shell-apps-and-job-app.md` — frontmatter schema for the apply task file.

## Input

`$1` is either a URL to a job description, or pasted JD text. If a URL, fetch with WebFetch. If WebFetch returns 4xx/5xx, ask the user to paste the JD body, then proceed.

## Output

Write four files to the vault. Slug = `{company-kebab}-{role-kebab}` (e.g., `new-balance-project-dev-lead`).

If a file with the chosen slug already exists, append `-2` to the slug.

### 1. `~/Documents/scotts-world/tasks/apply-{slug}.md`

```yaml
---
type: task
domain: job-search
status: looking-at
company: <Company>
role: <Role title>
comp_low: <number, USD annual; null if unknown>
comp_high: <number, USD annual; null if unknown>
location: <City, State or 'Remote' or null>
remote: <onsite | hybrid | remote | null>
applied: null
next_step: Submit application
next_step_due: <today + 5 days, YYYY-MM-DD>
created: <today, YYYY-MM-DD>
tags: []
linked:
  - "[[resume-{slug}]]"
  - "[[cover-letter-{slug}]]"
  - "[[role-description-{slug}]]"
---

# Apply for {Company} — {Role}

{2-3 sentences: what the role does, why it's a fit for Scott, which lane (1, 2, or 3) it falls in.}

## Steps

- [ ] Tailor resume → `[[resume-{slug}]]`
- [ ] Draft cover letter → `[[cover-letter-{slug}]]`
- [ ] Submit application via {posting URL or method}
- [ ] Follow up after 14 days if no response
```

### 2. `~/Documents/scotts-world/job-search/resume-{slug}.md`

A tailored resume in markdown. Pull bullets from `resume-generic.md`. Reorder/rephrase to emphasize the bullets most relevant to this role. Do NOT add bullets not in the master.

Top of file:
- Name, contact info (copy from generic).
- One-line summary tailored to this role.
- Sections: Education / Experience / Skills / Selected Work — same as generic, content tailored.

### 3. `~/Documents/scotts-world/job-search/cover-letter-{slug}.md`

A tailored cover letter, ~3-4 short paragraphs, using the lane-specific framing below.

### 4. `~/Documents/scotts-world/job-search/role-description-{slug}.md`

The cleaned JD text plus any additional context (recruiter name, application URL, comp band source, etc.).

## Lane-specific framing examples

**Lane 1 — Director of Sustainability (Corporate).** Lead with: "PhD environmental engineer, contributor to the GHG Protocol Product Standard via the Carbon Trust, with 13 years building the software that operationalizes corporate sustainability commitments." Avoid: defending why Scott isn't from the target industry. Industry knowledge is learnable; deep regulatory + technical capability is not.

**Lane 2 — Climate-tech / RegTech / Compliance Product Management.** Lead with: "13 years running product for B2B regulatory data SaaS, with the technical depth to design systems and the domain expertise to ground them in real compliance workflows." Cite specific regs only where Scott has operational experience: REACH, GHG Protocol, PAS 2050, ISO 14040/44 LCA, Science-Based Targets.

**Lane 3 — UX/Product Design Leadership (B2B SaaS, regulated).** Lead with: "Decade designing complex multi-stakeholder workflows where non-technical users interact with regulatory data — questionnaire-and-response loops, polarity-aware compliance displays, review/flag/approve workflows."

## Validation

After writing all four files, run this validation:

1. Read `~/Documents/scotts-world/tasks/apply-{slug}.md` back from disk.
2. Confirm the frontmatter parses: a `tags:` array, valid `status` value, `company`, `role`, `created`, and `linked` are all present and correctly typed.
3. If validation fails, report the specific frontmatter issue and stop. Do NOT report success.

If validation passes, output ONE line summary:

```
Generated {slug}: tasks/apply-{slug}.md plus resume/cover-letter/role-description in job-search/
```

Then suggest Scott visit `http://localhost:5173/jobs` (if Symphony dev server is running) to see the new row in the pipeline view.

## Failure modes

- **WebFetch fails** → ask Scott to paste the JD body.
- **Slug collision** → append `-2`.
- **Comp not in JD** → set `comp_low: null, comp_high: null`. Do not invent.
- **Required reading file missing** → STOP and report which file is missing rather than guess at framing.
