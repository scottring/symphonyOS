# Command+K Natural Language Parser

## Overview

Transform the current QuickCapture component from a simple "title only" inbox dump into an intelligent natural language command bar - similar to Fantastical's date parsing or Raycast's command palette, but for Symphony's domain.

**Current behavior:** User types text → creates task with that exact text as title in inbox
**New behavior:** User types natural language → parser extracts structured data → shows live preview → creates rich task with project, contact, due date, etc.

**Critical UX requirement:** User must ALWAYS be able to bypass parsing and add raw text to inbox (current behavior preserved as escape hatch).

---

## Design Direction

**Aesthetic:** Refined minimalism consistent with Nordic Journal. The preview should feel like a smart assistant whispering suggestions, not a complex form. Think "elegant autocomplete" not "configuration wizard."

**Key principle:** Parsing is purely additive. The raw text is always preserved. If parser extracts nothing, behavior is identical to current.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/layout/QuickCapture.tsx` | Add preview UI, call parser, handle both submit modes |
| `src/App.tsx` | Pass projects/contacts to QuickCapture, update onQuickAdd handler |
| `src/lib/quickInputParser.ts` | **NEW** - Pure parser function |
| `src/lib/quickInputParser.test.ts` | **NEW** - Parser unit tests |

**Files NOT to touch:**
- `useSupabaseTasks.ts` (already supports all fields we need)
- Any view components
- Database schema

---

## Implementation

### Phase 1: Create the Parser (`src/lib/quickInputParser.ts`)

```typescript
import * as chrono from 'chrono-node'

export interface ParsedQuickInput {
  rawText: string                    // Original input, always preserved
  title: string                      // Extracted title (everything not parsed)
  projectId?: string                 // Matched project
  projectMatch?: string              // What text matched (for highlighting)
  contactId?: string                 // Matched contact  
  contactMatch?: string              // What text matched
  dueDate?: Date                     // Parsed date
  dueDateMatch?: string              // What text matched (e.g., "tomorrow")
  priority?: 'high' | 'medium' | 'low'
}

interface ParserContext {
  projects: Array<{ id: string; name: string }>
  contacts: Array<{ id: string; name: string }>
}

export function parseQuickInput(
  input: string, 
  context: ParserContext
): ParsedQuickInput {
  const result: ParsedQuickInput = {
    rawText: input,
    title: input.trim(),
  }
  
  let workingText = input
  
  // 1. Extract dates using chrono-node
  const dateResults = chrono.parse(workingText)
  if (dateResults.length > 0) {
    const match = dateResults[0]
    result.dueDate = match.start.date()
    result.dueDateMatch = match.text
    workingText = workingText.replace(match.text, '').trim()
  }
  
  // 2. Check for explicit project markers: #project, "in Project", "for Project"
  // Pattern: #ProjectName or "in/for [Project Name]"
  const projectPatterns = [
    /#(\S+)/i,                                    // #project
    /\b(?:in|for)\s+(?:project\s+)?["']?([^"']+?)["']?\s*(?:project)?$/i,
    /\b(?:in|for)\s+(\S+)\s+project\b/i,
  ]
  
  for (const pattern of projectPatterns) {
    const match = workingText.match(pattern)
    if (match) {
      const projectQuery = match[1].toLowerCase()
      // Fuzzy match against existing projects
      const matchedProject = context.projects.find(p => 
        p.name.toLowerCase().includes(projectQuery) ||
        projectQuery.includes(p.name.toLowerCase())
      )
      if (matchedProject) {
        result.projectId = matchedProject.id
        result.projectMatch = match[0]
        workingText = workingText.replace(match[0], '').trim()
        break
      }
    }
  }
  
  // 3. Check for explicit contact markers: @contact, "with Contact"
  const contactPatterns = [
    /@(\S+)/i,                           // @contact
    /\bwith\s+["']?([^"']+?)["']?$/i,    // with Contact
  ]
  
  for (const pattern of contactPatterns) {
    const match = workingText.match(pattern)
    if (match) {
      const contactQuery = match[1].toLowerCase()
      const matchedContact = context.contacts.find(c =>
        c.name.toLowerCase().includes(contactQuery) ||
        contactQuery.includes(c.name.toLowerCase())
      )
      if (matchedContact) {
        result.contactId = matchedContact.id
        result.contactMatch = match[0]
        workingText = workingText.replace(match[0], '').trim()
        break
      }
    }
  }
  
  // 4. Check for priority markers
  if (/\b(urgent|!!|high\s*priority)\b/i.test(workingText)) {
    result.priority = 'high'
    workingText = workingText.replace(/\b(urgent|!!|high\s*priority)\b/i, '').trim()
  } else if (/\b(!|medium\s*priority)\b/i.test(workingText)) {
    result.priority = 'medium'
    workingText = workingText.replace(/\b(!|medium\s*priority)\b/i, '').trim()
  }
  
  // 5. Clean up title
  result.title = workingText
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/^[-–—]\s*/, '')       // Remove leading dashes
    .trim()
  
  // If title is empty after parsing, use original
  if (!result.title) {
    result.title = input.trim()
  }
  
  return result
}

// Helper to check if anything was parsed beyond the title
export function hasParsedFields(parsed: ParsedQuickInput): boolean {
  return !!(parsed.projectId || parsed.contactId || parsed.dueDate || parsed.priority)
}
```

**Install chrono-node:**
```bash
npm install chrono-node
npm install -D @types/chrono-node  # if types exist, otherwise skip
```

---

### Phase 2: Update QuickCapture UI

Transform the modal to show a live preview of parsed results. Follow Nordic Journal design patterns from `DESIGN_QUICK_REFERENCE.md`.

**New UI Structure:**

```
┌─────────────────────────────────────────────────────────────┐
│  Quick Add                                            ⌘K   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ buy train tickets for montreal trip tomorrow        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📋  "buy train tickets"                            │   │
│  │  📁  Montreal Trip  ×                               │   │
│  │  📅  Tomorrow, Dec 9  ×                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────┐    ┌────────────────────────────┐   │
│  │  Add to Inbox    │    │      Save with Above    ⏎  │   │
│  └──────────────────┘    └────────────────────────────┘   │
│                                                             │
│  💡 Shift+Enter to add raw text to inbox                   │
└─────────────────────────────────────────────────────────────┘
```

**When nothing is parsed (no preview needed):**

```
┌─────────────────────────────────────────────────────────────┐
│  Quick Add                                            ⌘K   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ random thought to capture                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│           ┌────────────────────────────────┐               │
│           │         Add to Inbox        ⏎  │               │
│           └────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

**Updated component props:**

```typescript
interface QuickCaptureProps {
  onAdd: (title: string) => void
  // NEW: Rich add with parsed fields
  onAddRich?: (data: {
    title: string
    projectId?: string
    contactId?: string
    scheduledFor?: Date
  }) => void
  // NEW: Context for parser
  projects?: Array<{ id: string; name: string }>
  contacts?: Array<{ id: string; name: string }>
  // Existing props...
  isOpen?: boolean
  onOpen?: () => void
  onClose?: () => void
  showFab?: boolean
}
```

**Key behaviors:**

1. **Live parsing:** Call `parseQuickInput()` on every keystroke (debounce not needed, it's fast)
2. **Preview only shows if `hasParsedFields()` returns true**
3. **× buttons on parsed fields:** Click to remove that field from the result (set to undefined)
4. **Enter key:** Submit with parsed fields (if any) OR as plain text (if nothing parsed)
5. **Shift+Enter:** Always submit as plain text to inbox (bypass all parsing)
6. **"Add to Inbox" button:** Same as Shift+Enter, visible escape hatch
7. **Keep modal open after submit** for rapid entry (existing behavior)

---

### Phase 3: Wire Up in App.tsx

Update the AppShell props to pass context and handle rich adds:

```typescript
// In App.tsx, around line 591

<AppShell
  // ... existing props
  onQuickAdd={async (title) => {
    // Fallback for plain text (backward compatible)
    const taskId = await addTask(title)
    if (taskId) setRecentlyCreatedTaskId(taskId)
  }}
  onQuickAddRich={async (data) => {
    const taskId = await addTask(
      data.title,
      data.contactId,
      data.projectId,
      data.scheduledFor
    )
    if (taskId) setRecentlyCreatedTaskId(taskId)
  }}
  quickAddProjects={projects.map(p => ({ id: p.id, name: p.name }))}
  quickAddContacts={contacts.map(c => ({ id: c.id, name: c.name }))}
  // ... rest of props
/>
```

**Note:** `addTask` already supports all these parameters! Check line 138 of `useSupabaseTasks.ts`:
```typescript
const addTask = useCallback(async (
  title: string, 
  contactId?: string, 
  projectId?: string, 
  scheduledFor?: Date
): Promise<string | undefined>
```

---

## Design Specifications

### Preview Card

Use these classes from Nordic Journal:

```tsx
{/* Preview container - only show if hasParsedFields() */}
<div className="mt-4 p-4 rounded-xl bg-neutral-50 border border-neutral-100 space-y-2">
  
  {/* Title row */}
  <div className="flex items-center gap-2 text-neutral-800">
    <span className="text-base">📋</span>
    <span className="font-medium">"{parsed.title}"</span>
  </div>
  
  {/* Project chip - if parsed */}
  {parsed.projectId && (
    <div className="flex items-center gap-2">
      <span className="text-base">📁</span>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
        {projectName}
        <button 
          onClick={() => clearProjectMatch()}
          className="ml-1 text-blue-400 hover:text-blue-600"
        >
          ×
        </button>
      </span>
    </div>
  )}
  
  {/* Date chip - if parsed */}
  {parsed.dueDate && (
    <div className="flex items-center gap-2">
      <span className="text-base">📅</span>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100">
        {formatDate(parsed.dueDate)}
        <button 
          onClick={() => clearDateMatch()}
          className="ml-1 text-primary-400 hover:text-primary-600"
        >
          ×
        </button>
      </span>
    </div>
  )}
  
  {/* Contact chip - if parsed */}
  {parsed.contactId && (
    <div className="flex items-center gap-2">
      <span className="text-base">👤</span>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-100">
        {contactName}
        <button 
          onClick={() => clearContactMatch()}
          className="ml-1 text-amber-400 hover:text-amber-600"
        >
          ×
        </button>
      </span>
    </div>
  )}
</div>
```

### Button Layout

```tsx
<div className="flex gap-3 mt-4">
  {/* Only show "Add to Inbox" if there ARE parsed fields (otherwise it's redundant) */}
  {hasParsedFields(parsed) && (
    <button
      type="button"
      onClick={() => handleSubmit(true)}  // true = use raw text
      className="flex-1 touch-target py-3 rounded-xl border border-neutral-200 text-neutral-600 font-medium hover:bg-neutral-50 transition-colors"
    >
      Add to Inbox
    </button>
  )}
  
  <button
    type="submit"
    disabled={!title.trim()}
    className="flex-1 touch-target py-3 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
  >
    {hasParsedFields(parsed) ? 'Save with Above' : 'Add to Inbox'}
  </button>
</div>

{/* Keyboard hint - only if parsed fields exist */}
{hasParsedFields(parsed) && (
  <p className="text-center text-xs text-neutral-400 mt-3">
    💡 <kbd className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-xs font-mono">Shift</kbd>+<kbd className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-xs font-mono">Enter</kbd> to add raw text to inbox
  </p>
)}
```

### Keyboard Handler

```typescript
const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Escape') {
    handleClose()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) {
      // Shift+Enter = always add raw text to inbox
      handleSubmit(true)
    } else {
      // Enter = use parsed result (or raw if nothing parsed)
      handleSubmit(false)
    }
  }
}

const handleSubmit = (useRaw: boolean) => {
  const trimmed = title.trim()
  if (!trimmed) return
  
  if (useRaw || !hasParsedFields(parsed)) {
    // Plain inbox add (current behavior)
    onAdd(trimmed)
  } else if (onAddRich) {
    // Rich add with parsed fields
    onAddRich({
      title: parsed.title,
      projectId: overrides.projectId ?? parsed.projectId,
      contactId: overrides.contactId ?? parsed.contactId,
      scheduledFor: overrides.dueDate ?? parsed.dueDate,
    })
  } else {
    // Fallback if onAddRich not provided
    onAdd(trimmed)
  }
  
  // Reset and refocus for rapid entry
  setTitle('')
  setOverrides({})
  inputRef.current?.focus()
}
```

---

## Test Cases for Parser

Create `src/lib/quickInputParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseQuickInput, hasParsedFields } from './quickInputParser'

const mockContext = {
  projects: [
    { id: 'p1', name: 'Montreal Trip' },
    { id: 'p2', name: 'Work Stuff' },
    { id: 'p3', name: 'Symphony OS' },
  ],
  contacts: [
    { id: 'c1', name: 'Iris' },
    { id: 'c2', name: 'Dr. Smith' },
  ],
}

describe('parseQuickInput', () => {
  it('returns raw text as title when nothing matches', () => {
    const result = parseQuickInput('random thought', mockContext)
    expect(result.title).toBe('random thought')
    expect(result.rawText).toBe('random thought')
    expect(hasParsedFields(result)).toBe(false)
  })

  it('parses "tomorrow" as due date', () => {
    const result = parseQuickInput('buy milk tomorrow', mockContext)
    expect(result.title).toBe('buy milk')
    expect(result.dueDate).toBeDefined()
    expect(result.dueDateMatch).toBe('tomorrow')
  })

  it('parses "next monday" as due date', () => {
    const result = parseQuickInput('call dentist next monday', mockContext)
    expect(result.title).toBe('call dentist')
    expect(result.dueDate).toBeDefined()
  })

  it('matches project with #hashtag', () => {
    const result = parseQuickInput('book flights #montreal', mockContext)
    expect(result.title).toBe('book flights')
    expect(result.projectId).toBe('p1')
    expect(result.projectMatch).toBe('#montreal')
  })

  it('matches project with "in Project"', () => {
    const result = parseQuickInput('buy tickets in montreal trip', mockContext)
    expect(result.title).toBe('buy tickets')
    expect(result.projectId).toBe('p1')
  })

  it('matches project with "for Project"', () => {
    const result = parseQuickInput('fix bug for symphony', mockContext)
    expect(result.title).toBe('fix bug')
    expect(result.projectId).toBe('p3')
  })

  it('matches contact with @mention', () => {
    const result = parseQuickInput('call @iris about dinner', mockContext)
    expect(result.contactId).toBe('c1')
  })

  it('matches contact with "with Contact"', () => {
    const result = parseQuickInput('appointment with dr smith', mockContext)
    expect(result.title).toBe('appointment')
    expect(result.contactId).toBe('c2')
  })

  it('parses multiple fields together', () => {
    const result = parseQuickInput(
      'book hotel for montreal trip tomorrow with iris',
      mockContext
    )
    expect(result.title).toBe('book hotel')
    expect(result.projectId).toBe('p1')
    expect(result.contactId).toBe('c1')
    expect(result.dueDate).toBeDefined()
  })

  it('preserves original text in rawText', () => {
    const input = 'complex task #project tomorrow @contact'
    const result = parseQuickInput(input, mockContext)
    expect(result.rawText).toBe(input)
  })

  it('handles empty input gracefully', () => {
    const result = parseQuickInput('', mockContext)
    expect(result.title).toBe('')
    expect(result.rawText).toBe('')
  })

  it('detects urgent priority', () => {
    const result = parseQuickInput('fix critical bug urgent', mockContext)
    expect(result.priority).toBe('high')
    expect(result.title).toBe('fix critical bug')
  })
})
```

---

## Acceptance Criteria

- [ ] Parser correctly extracts dates using natural language ("tomorrow", "next week", "Dec 15")
- [ ] Parser matches projects with #hashtag, "in [project]", "for [project]"
- [ ] Parser matches contacts with @mention, "with [contact]"
- [ ] Preview UI shows parsed fields in real-time as user types
- [ ] × buttons on chips remove that field from result
- [ ] Enter submits with parsed fields
- [ ] Shift+Enter always submits raw text to inbox
- [ ] "Add to Inbox" button visible when fields are parsed
- [ ] When nothing is parsed, UI looks identical to current (single "Add to Inbox" button)
- [ ] Modal stays open after submit for rapid entry
- [ ] All existing QuickCapture tests still pass
- [ ] New parser has >90% test coverage
- [ ] Build passes with no TypeScript errors

---

## Notes

- **Do NOT over-engineer:** Start with simple keyword matching. AI enhancement is Phase 2+ (later).
- **Fuzzy matching should be forgiving:** "montreal" matches "Montreal Trip"
- **chrono-node handles date edge cases:** Let it do the heavy lifting
- **Raw text is sacred:** Always preserve it, always allow bypass

## References

- `DESIGN_QUICK_REFERENCE.md` - Copy-paste patterns for Nordic Journal
- `src/hooks/useSupabaseTasks.ts:138` - addTask already supports all fields
- `src/components/layout/QuickCapture.tsx` - Current implementation (149 lines)
