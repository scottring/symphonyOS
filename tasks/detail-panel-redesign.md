# Detail Panel Redesign

## Overview

The current detail panel is crowded, lacks hierarchy, and shows too many empty states. This redesign creates clear visual hierarchy, groups related content, and hides empty sections.

**File to modify:** `src/components/detail/DetailPanelRedesign.tsx`

**Skill required:** Read `/mnt/skills/public/frontend-design/SKILL.md` before implementing.

---

## Current Problems

| Problem | Example |
|---------|---------|
| No hierarchy | Title same weight as "Location: None" |
| Empty states dominate | "No prep tasks", "None", "Add notes..." everywhere |
| 10+ sections stacked | Subtasks, Project, Contact, Links, Location, Prep, Follow-up, Notes, Attachments... |
| No grouping | Project and Contact unrelated visually |
| Identical section headers | All small gray caps |
| Key info buried | Contact name hidden in a row, not near title |

---

## New Structure

### Visual Hierarchy (Top to Bottom)

```
┌─────────────────────────────────────────────────────────┐
│  ┌───┐                                                  │
│  │ ○ │  Task Title Here                           ✕     │
│  └───┘  Much larger, primary focus                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🕐 8:00 AM    👤 Frank Wagner    📍 Home Depot  │    │
│  └─────────────────────────────────────────────────┘    │
│  ↑ Inline metadata pills - only show if populated       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ▸ Subtasks (2)                          + Add subtask  │
│    ┌─────────────────────────────────────────────┐      │
│    │ ○ Call for quote                            │      │
│    │ ○ Schedule appointment                      │      │
│    └─────────────────────────────────────────────┘      │
│                                                         │
│  Notes                                                  │
│    ┌─────────────────────────────────────────────┐      │
│    │ Need to fix before holiday guests arrive   │      │
│    └─────────────────────────────────────────────┘      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ▸ Details                                    ⌄ expand  │
│    ┌─────────────────────────────────────────────┐      │
│    │ Project     Trip Prep                    ▸ │      │
│    │ Contact     Frank Wagner     📞  💬     ▸ │      │
│    │ Location    Home Depot                   ▸ │      │
│    │ Links       None                         + │      │
│    └─────────────────────────────────────────────┘      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ▸ Prep Tasks (0)                        + Add prep     │
│  ▸ Follow-up Tasks (0)                   + Add follow   │
│                                                         │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                 │
│                                                         │
│  📎 Attachments                          + Add file     │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🗑️ Delete task                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Section-by-Section Specs

### 1. Header Zone (Hero)

**Layout:**
```tsx
<div className="p-6 border-b border-neutral-100">
  {/* Close button - top right */}
  <button className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600">
    <X size={20} />
  </button>
  
  {/* Checkbox + Title */}
  <div className="flex items-start gap-4 pr-8">
    <button className="mt-1 w-6 h-6 rounded-full border-2 border-neutral-300 
                       hover:border-primary-500 flex-shrink-0" />
    <div className="flex-1">
      <h2 className="text-xl font-semibold text-neutral-900 leading-tight">
        {task.title}
      </h2>
      
      {/* Inline metadata pills - only if populated */}
      <div className="flex flex-wrap gap-2 mt-3">
        {task.scheduledFor && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 
                          bg-neutral-100 text-neutral-600 text-sm rounded-full">
            <Clock size={14} />
            {formatTime(task.scheduledFor)}
          </span>
        )}
        {contact && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 
                          bg-primary-50 text-primary-700 text-sm rounded-full">
            <User size={14} />
            {contact.name}
          </span>
        )}
        {task.location && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 
                          bg-neutral-100 text-neutral-600 text-sm rounded-full">
            <MapPin size={14} />
            {task.location.name}
          </span>
        )}
        {project && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 
                          bg-amber-50 text-amber-700 text-sm rounded-full">
            <Folder size={14} />
            {project.name}
          </span>
        )}
      </div>
    </div>
  </div>
</div>
```

**Key Points:**
- Title is `text-xl font-semibold` - largest text in panel
- Pills only render if data exists (no empty pills)
- Pills use color coding: time=neutral, contact=primary, location=neutral, project=amber
- Close button top-right, doesn't interfere with title

---

### 2. Primary Content Zone (Subtasks + Notes)

**These are the "do the work" sections - always visible, prominent.**

```tsx
<div className="p-6 space-y-6 border-b border-neutral-100">
  {/* Subtasks */}
  <div>
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
        Subtasks {subtasks.length > 0 && `(${subtasks.length})`}
      </h3>
      <button className="text-sm text-primary-600 hover:text-primary-700">
        + Add subtask
      </button>
    </div>
    
    {subtasks.length > 0 ? (
      <div className="space-y-2">
        {subtasks.map(subtask => (
          <div key={subtask.id} className="flex items-center gap-3 p-2 -mx-2 
                                           rounded-lg hover:bg-neutral-50 group">
            <button className="w-5 h-5 rounded-full border-2 border-neutral-300" />
            <span className="flex-1 text-sm text-neutral-700">{subtask.title}</span>
            <button className="opacity-0 group-hover:opacity-100 text-neutral-400">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm text-neutral-400 italic">No subtasks</p>
    )}
  </div>
  
  {/* Notes */}
  <div>
    <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
      Notes
    </h3>
    <textarea 
      placeholder="Add notes..."
      className="w-full p-3 text-sm border border-neutral-200 rounded-lg 
                 focus:ring-2 focus:ring-primary-500 focus:border-transparent
                 resize-none min-h-[80px]"
    />
  </div>
</div>
```

**Key Points:**
- Subtasks show count in header when populated
- Empty state is subtle italic text, not a full empty state component
- Notes is always a textarea (not a click-to-edit field) - invites input
- Hover states on subtask rows

---

### 3. Details Zone (Collapsible)

**Context fields - less important, can be collapsed.**

```tsx
const [detailsExpanded, setDetailsExpanded] = useState(true)

<div className="border-b border-neutral-100">
  <button 
    onClick={() => setDetailsExpanded(!detailsExpanded)}
    className="w-full p-6 flex items-center justify-between hover:bg-neutral-50"
  >
    <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
      Details
    </h3>
    <ChevronDown 
      size={18} 
      className={`text-neutral-400 transition-transform ${detailsExpanded ? '' : '-rotate-90'}`} 
    />
  </button>
  
  {detailsExpanded && (
    <div className="px-6 pb-6 space-y-1">
      {/* Each row is a clickable field */}
      <DetailRow 
        icon={<Folder size={16} />}
        label="Project"
        value={project?.name}
        onClick={() => openProjectPicker()}
      />
      <DetailRow 
        icon={<User size={16} />}
        label="Contact"
        value={contact?.name}
        onClick={() => openContactPicker()}
        actions={contact && (
          <div className="flex gap-1">
            <button className="p-1.5 hover:bg-neutral-100 rounded">
              <Phone size={14} />
            </button>
            <button className="p-1.5 hover:bg-neutral-100 rounded">
              <MessageCircle size={14} />
            </button>
          </div>
        )}
      />
      <DetailRow 
        icon={<MapPin size={16} />}
        label="Location"
        value={task.location?.name}
        onClick={() => openLocationPicker()}
      />
      <DetailRow 
        icon={<Link size={16} />}
        label="Links"
        value={links.length > 0 ? `${links.length} link${links.length > 1 ? 's' : ''}` : null}
        onClick={() => openLinkManager()}
      />
    </div>
  )}
</div>

// DetailRow component
function DetailRow({ icon, label, value, onClick, actions }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 -mx-3 rounded-lg 
                 hover:bg-neutral-50 text-left group"
    >
      <span className="text-neutral-400">{icon}</span>
      <span className="text-sm text-neutral-500 w-20">{label}</span>
      <span className={`flex-1 text-sm ${value ? 'text-neutral-900' : 'text-neutral-400'}`}>
        {value || 'None'}
      </span>
      {actions}
      <ChevronRight size={16} className="text-neutral-300 opacity-0 group-hover:opacity-100" />
    </button>
  )
}
```

**Key Points:**
- Entire section is collapsible
- Each row is clickable to edit
- Empty values show "None" in muted text
- Contact row has inline action buttons (call, message)
- Chevron appears on hover indicating clickability

---

### 4. Linked Tasks Zone (Prep & Follow-up)

**Only prominent when populated. Collapsed headers when empty.**

```tsx
<div className="p-6 border-b border-neutral-100 space-y-4">
  {/* Prep Tasks */}
  <div>
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
        Prep Tasks {prepTasks.length > 0 && (
          <span className="ml-1 text-primary-600">({prepTasks.length})</span>
        )}
      </h3>
      <button className="text-sm text-primary-600 hover:text-primary-700">
        + Add
      </button>
    </div>
    
    {prepTasks.length > 0 && (
      <div className="mt-3 space-y-2">
        {prepTasks.map(task => (
          <LinkedTaskRow key={task.id} task={task} />
        ))}
      </div>
    )}
  </div>
  
  {/* Follow-up Tasks */}
  <div>
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
        Follow-up Tasks {followupTasks.length > 0 && (
          <span className="ml-1 text-primary-600">({followupTasks.length})</span>
        )}
      </h3>
      <button className="text-sm text-primary-600 hover:text-primary-700">
        + Add
      </button>
    </div>
    
    {followupTasks.length > 0 && (
      <div className="mt-3 space-y-2">
        {followupTasks.map(task => (
          <LinkedTaskRow key={task.id} task={task} />
        ))}
      </div>
    )}
  </div>
</div>

// LinkedTaskRow
function LinkedTaskRow({ task }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 group">
      <button className="w-5 h-5 rounded-full border-2 border-neutral-300" />
      <span className="flex-1 text-sm text-neutral-700">{task.title}</span>
      {task.scheduledFor ? (
        <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
          {formatDate(task.scheduledFor)}
        </span>
      ) : (
        <button className="text-xs text-primary-600 opacity-0 group-hover:opacity-100">
          + Add to Today
        </button>
      )}
    </div>
  )
}
```

**Key Points:**
- When empty, just shows header + Add button (no "No prep tasks" message)
- Count shows in colored text when populated
- "Add to Today" appears on hover for unscheduled tasks
- Compact rows - not as padded as main task list

---

### 5. Attachments Zone

```tsx
<div className="p-6 border-b border-neutral-100">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
      Attachments {attachments.length > 0 && `(${attachments.length})`}
    </h3>
    <button className="text-sm text-primary-600 hover:text-primary-700">
      + Add file
    </button>
  </div>
  
  {attachments.length > 0 ? (
    <div className="space-y-2">
      {attachments.map(file => (
        <div key={file.id} className="flex items-center gap-3 p-2 rounded-lg 
                                      bg-neutral-50 group">
          <FileIcon type={file.type} />
          <span className="flex-1 text-sm truncate">{file.name}</span>
          <span className="text-xs text-neutral-400">{file.size}</span>
          <button className="opacity-0 group-hover:opacity-100 text-neutral-400">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  ) : (
    <div 
      className="border-2 border-dashed border-neutral-200 rounded-lg p-6 
                 text-center hover:border-primary-300 hover:bg-primary-50/30 
                 transition-colors cursor-pointer"
      onDrop={handleDrop}
    >
      <Upload size={24} className="mx-auto text-neutral-400 mb-2" />
      <p className="text-sm text-neutral-500">Drop files or click to upload</p>
      <p className="text-xs text-neutral-400 mt-1">Max 10 MB</p>
    </div>
  )}
</div>
```

**Key Points:**
- When empty, shows drop zone (inviting, not just "None")
- When populated, compact file rows
- File type icons, size display
- Hover to reveal delete

---

### 6. Danger Zone (Delete)

```tsx
<div className="p-6">
  <button 
    onClick={handleDelete}
    className="w-full p-3 text-sm text-red-600 hover:bg-red-50 
               rounded-lg transition-colors text-center"
  >
    Delete task
  </button>
</div>
```

**Key Points:**
- Always at bottom
- Full width, centered text
- Red color, but not alarming until hovered
- No icon needed

---

## Color Palette (Reference)

| Element | Color |
|---------|-------|
| Title | `text-neutral-900` |
| Section headers | `text-neutral-500` uppercase tracking-wide |
| Body text | `text-neutral-700` |
| Empty/placeholder | `text-neutral-400` italic |
| Primary actions | `text-primary-600` |
| Time pill | `bg-neutral-100 text-neutral-600` |
| Contact pill | `bg-primary-50 text-primary-700` |
| Project pill | `bg-amber-50 text-amber-700` |
| Scheduled badge | `bg-primary-50 text-primary-600` |
| Delete | `text-red-600 hover:bg-red-50` |

---

## Responsive Behavior

The panel width is fixed at `w-96` (384px). No responsive changes needed within the panel itself.

---

## Animation

- Collapse/expand: `transition-all duration-200`
- Hover states: `transition-colors duration-150`
- ChevronDown rotation: `transition-transform duration-200`

---

## Implementation Checklist

- [ ] Read `/mnt/skills/public/frontend-design/SKILL.md`
- [ ] Restructure into zones: Header, Primary, Details, Linked, Attachments, Delete
- [ ] Implement inline metadata pills in header
- [ ] Make Details section collapsible
- [ ] Hide empty states (show subtle "None" or nothing)
- [ ] Add counts to section headers when populated
- [ ] Implement DetailRow component for consistent field styling
- [ ] Add hover states for all interactive elements
- [ ] Ensure attachments drop zone works
- [ ] Test with various data states (all populated, all empty, partial)
- [ ] Verify all existing functionality still works

---

## Files to Reference

- `src/components/detail/DetailPanelRedesign.tsx` - Current implementation
- `DESIGN_QUICK_REFERENCE.md` - Nordic Journal patterns
- `src/components/ui/` - Existing UI components

---

## Acceptance Criteria

- [ ] Title is visually dominant (largest text)
- [ ] Metadata pills show inline under title (only when populated)
- [ ] No "None" or empty states dominating the view
- [ ] Details section collapses/expands
- [ ] Prep/Follow-up sections are compact when empty
- [ ] Attachments show drop zone when empty
- [ ] All interactive elements have hover states
- [ ] Delete button at bottom, styled as danger action
- [ ] All existing features work (edit, complete, delete, etc.)
- [ ] Build compiles, no TypeScript errors
