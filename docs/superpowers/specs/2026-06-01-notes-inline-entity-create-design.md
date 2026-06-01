# Inline create in the Notes link picker

**Date:** 2026-06-01
**Status:** Approved (design)

## Problem

In Notes, the **"Link to task, project, or contact"** button opens `EntityLinkPicker`
— a search box + type tabs + a results list of existing entities. If the entity
you want to link doesn't exist yet, there's no way to create it: you have to leave
the note, create the task/project/contact elsewhere, come back, and link it.

We want to create a task, project, or contact **inline** from that popover and link
it to the note in one step.

## Decisions (from brainstorming)

1. **Name only, link immediately.** Creating makes the entity with just its name,
   then links it to the note and closes the picker. No inline form for extra fields.
   Enrich later by opening the entity. (Matches Symphony's capture-now/enrich-later
   philosophy and the existing inline **topic** create already in this modal.)
2. **Create rows follow the active tab.** Tasks tab → "Create task". Projects →
   "Create project". Contacts → "Create contact". **All** tab → all three.
3. **Create rows are always visible** at the bottom of the picker — not gated behind
   typing a search term.
4. **The search box doubles as the name field.** With text typed, a row reads
   **"Create \<type\> '\<text\>'"** and creates on click. With the box **empty**,
   clicking a create row **focuses the search box** so you can name it first — we
   never create "Untitled" junk entities.
5. **No domain/topic/context inheritance.** New entities are name-only; context,
   date, and assignment use the existing create defaults. Conscious scope cut.
6. **No exact-match suppression.** Create rows always allow creating, even if a
   same-named entity exists (the existing one is visible right above in results, so
   the user can choose). Keeps the model simple and consistent with "always visible."

## Architecture

The picker already receives `tasks` / `projects` / `contacts` and `onAddEntityLink`
drilled down this chain:

```
App.tsx → ViewRouter → NotesPage → NoteDetail → EntityLinkPicker
                                  ↘ NoteModal  ↗   (parallel surface, shares the picker)
```

We add three create callbacks alongside them. The live surface is
`NotesPage → NoteDetail`; `NoteModal` is wired identically since it renders the same
picker.

### `EntityLinkPicker` — new props

```ts
interface EntityLinkPickerProps {
  // ...existing
  onCreateTask?:    (title: string) => Promise<string | undefined>  // resolves to new entity id
  onCreateProject?: (name: string)  => Promise<string | undefined>
  onCreateContact?: (name: string)  => Promise<string | undefined>
}
```

Each callback creates the entity and resolves to its **new id** (or `undefined` on
failure). A create callback being absent hides that type's create row (so a surface
that can't create simply doesn't show it).

### Create flow inside the picker

On clicking a create row for `type`:

1. If `search.trim()` is empty → `inputRef.current?.focus()` and return (name first).
2. Otherwise set a per-row pending state (disable + "Creating…").
3. `const id = await onCreate<Type>(search.trim())`.
4. On `id`: call the **existing** `onSelect(type, id)` (the one linking path), then
   `onClose()`.
5. On `undefined`/throw: clear pending, show inline error text under the row, keep
   the picker open.

Reusing `onSelect` means the picker stays unaware of *how* linking works — the same
`handleAddEntityLink` path handles both "link existing" and "link just-created."

### Which create rows render

Computed from `activeTab`:

- `task` → `[task]`
- `project` → `[project]`
- `contact` → `[contact]`
- `all` → `[task, project, contact]`

…filtered to types that have a create callback provided. Rows render in a footer
section below the results list (above the existing Cancel footer), visually distinct
(e.g. `+` icon, dashed separator), each showing the type and the would-be name.

### Wiring the callbacks

`addTask(title)` already returns `Promise<string | undefined>` — pass through.
`addProject({ name })` returns `Project | null`, `addContact({ name })` returns
`Contact | null` — wrap each to resolve `result?.id`:

```ts
onCreateProject={async (name) => (await addProject({ name }))?.id}
onCreateContact={async (name) => (await addContact({ name }))?.id}
onCreateTask={(title) => addTask(title)}
```

Thread `onCreateTask/Project/Contact` from `App.tsx` (where the hooks live) through
`ViewRouter` → `NotesPage` → `NoteDetail` and `NoteModal`, next to the existing
`onAddEntityLink` prop. Optional at every level.

## Components touched

- `src/components/notes/EntityLinkPicker.tsx` — new props + create-row UI + flow.
- `src/components/notes/NoteDetail.tsx` — accept + forward the 3 callbacks.
- `src/components/notes/NoteModal.tsx` — accept + forward the 3 callbacks.
- `src/components/notes/NotesPage.tsx` — accept + forward.
- `src/components/layout/ViewRouter.tsx` — accept + forward.
- `src/App.tsx` — provide the 3 callbacks from `addTask`/`addProject`/`addContact`.

## Testing

Unit tests on `EntityLinkPicker` (extend existing test patterns in the notes dir):

- Create rows are **always** visible (empty search included).
- Rows follow the active tab; **All** shows all three.
- A type with **no** create callback shows no create row for it.
- Empty search + click create row → focuses the input, does **not** call `onCreate`.
- Typed search + click → calls `onCreate<Type>(text)`, then `onSelect(type, returnedId)`,
  then `onClose`.
- Create failure (`undefined`) → picker stays open, error shown, `onSelect` not called.

No schema changes, no new data flow, no migrations.

## Out of scope

- Inline forms / extra fields on create (date, context, phone, email).
- Domain/topic inheritance for created entities.
- Exact-duplicate-name guarding.
- Editing/unlinking (already exists elsewhere).
