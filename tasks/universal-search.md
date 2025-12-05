# Universal Search Implementation

## Overview
Add a universal search feature that searches across all entity types (tasks, projects, contacts, routines) including their notes/description fields. Supports fuzzy matching for typo tolerance.

## UI Design

### Trigger
- Search icon in header (magnifying glass)
- Keyboard shortcut: `Cmd+K` (Mac) / `Ctrl+K` (Windows)
- Mobile: search icon in header bar

### Search Modal
```
┌─────────────────────────────────────┐
│ 🔍 Search...                    ✕   │
├─────────────────────────────────────┤
│                                     │
│ Tasks (3)                           │
│ ┌─────────────────────────────────┐ │
│ │ ☐ Call O'Neill about basement   │ │
│ │ ☐ Email photos to plumber       │ │
│ │ ☑ Fix kitchen faucet            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Contacts (1)                        │
│ ┌─────────────────────────────────┐ │
│ │ 👤 O'Neill Plumbing             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Projects (1)                        │
│ ┌─────────────────────────────────┐ │
│ │ 📁 Fix basement leak            │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### Behavior
- Search as you type (debounced 150-200ms)
- Results grouped by type: Tasks, Projects, Contacts, Routines
- Max ~5 results per type initially, "Show more" to expand
- Empty state: "No results for [query]"
- Click result → close modal, navigate to entity
- Keyboard navigation: arrow keys to move, Enter to select, Escape to close
- Highlight matched text in results

## Search Implementation

### Option A: Client-side (Recommended for v1)
All data is already loaded in hooks. Search in-memory using a fuzzy matching library.

**Pros:**
- Instant results
- No API calls
- Works offline
- Simple implementation

**Cons:**
- Won't scale to 10,000+ items (not a near-term concern)

### Option B: Server-side (Future)
Supabase full-text search or pg_trgm extension.

**Decision:** Go with Option A for now.

## Technical Implementation

### Dependencies
Add fuzzy search library:
```bash
npm install fuse.js
```

Fuse.js is lightweight (~5kb) and handles fuzzy matching well.

### New Hook: `src/hooks/useSearch.ts`

```typescript
import Fuse from 'fuse.js'

interface SearchResult {
  type: 'task' | 'project' | 'contact' | 'routine'
  id: string
  title: string // display name
  subtitle?: string // secondary info (e.g., project name, phone number)
  matchedField?: string // which field matched
  item: Task | Project | Contact | Routine
}

interface UseSearchProps {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  routines: Routine[]
}

export function useSearch({ tasks, projects, contacts, routines }: UseSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  
  // Build Fuse instances for each type
  // Search when query changes (debounced)
  // Return grouped results
  
  return { query, setQuery, results, isSearching }
}
```

### Fuse.js Configuration

```typescript
// Tasks
const taskFuse = new Fuse(tasks, {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'notes', weight: 1 }
  ],
  threshold: 0.4, // 0 = exact, 1 = match anything
  includeMatches: true,
  ignoreLocation: true
})

// Projects
const projectFuse = new Fuse(projects, {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'notes', weight: 1 }
  ],
  threshold: 0.4,
  includeMatches: true,
  ignoreLocation: true
})

// Contacts
const contactFuse = new Fuse(contacts, {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'email', weight: 1.5 },
    { name: 'phone', weight: 1.5 },
    { name: 'notes', weight: 1 }
  ],
  threshold: 0.4,
  includeMatches: true,
  ignoreLocation: true
})

// Routines
const routineFuse = new Fuse(routines, {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'description', weight: 1 }
  ],
  threshold: 0.4,
  includeMatches: true,
  ignoreLocation: true
})
```

### New Component: `src/components/search/SearchModal.tsx`

```typescript
interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectResult: (result: SearchResult) => void
}
```

Features:
- Input field with autofocus
- Grouped results list
- Keyboard navigation (useRef for focus management)
- Click outside to close
- Escape to close
- Loading state while debouncing

### New Component: `src/components/search/SearchResultItem.tsx`

Renders individual result with:
- Type icon (checkbox for task, person for contact, folder for project, repeat for routine)
- Title with highlighted match
- Subtitle (project name for tasks, phone/email for contacts)
- Completion state for tasks

### Integration: `src/App.tsx`

1. Add search button to header
2. Add keyboard listener for Cmd+K / Ctrl+K
3. Render SearchModal
4. Handle navigation on result selection

```typescript
const handleSearchSelect = (result: SearchResult) => {
  setSearchOpen(false)
  switch (result.type) {
    case 'task':
      // Navigate to task (open in DetailPanel or TaskView)
      break
    case 'project':
      // Navigate to project
      break
    case 'contact':
      // Navigate to contact
      break
    case 'routine':
      // Navigate to routine
      break
  }
}
```

## Search Scope Details

### Tasks
- Search: `title`, `notes`
- Include subtasks (search independently)
- Display: title, project name if assigned, completion state
- Completed tasks: include but show at bottom or with lower priority

### Projects
- Search: `name`, `notes`
- Display: name, task count

### Contacts
- Search: `name`, `email`, `phone`, `notes`
- Display: name, phone or email (whichever matched, or first available)

### Routines
- Search: `name`, `description`
- Display: name, recurrence pattern (e.g., "Daily at 7am")

## Keyboard Navigation

```
↑/↓     Move selection up/down
Enter   Select current result
Escape  Close modal
Tab     Move to next section
```

Track `selectedIndex` in state. Reset to 0 when results change.

## Mobile Considerations

- Full-screen modal instead of centered popup
- Larger touch targets for results
- No keyboard shortcuts (obviously)
- Search icon in mobile header bar

## Test Coverage

Add tests for:

### `useSearch.test.ts`
- Returns empty results for empty query
- Finds tasks by title
- Finds tasks by notes content
- Finds contacts by name
- Finds contacts by email
- Finds contacts by phone
- Finds contacts by notes
- Finds projects by name
- Finds projects by notes
- Finds routines by name
- Finds routines by description
- Fuzzy matching works ("oneil" → "O'Neill")
- Results are grouped by type
- Debouncing works (doesn't search on every keystroke)

### `SearchModal.test.tsx`
- Renders when isOpen is true
- Doesn't render when isOpen is false
- Closes on Escape key
- Closes on click outside
- Calls onSelectResult when result clicked
- Keyboard navigation moves selection
- Enter selects current result
- Shows empty state for no results
- Shows results grouped by type

## Not in v1 (Future)
- Recent searches
- Search history
- Filters (type, date range, completion status)
- Server-side search for scale
- Search within specific project
- Saved searches
