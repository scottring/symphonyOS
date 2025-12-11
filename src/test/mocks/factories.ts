import type { Task, TaskContext, TaskLink } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project, ProjectStatus, DbProject } from '@/types/project'
import type { Routine, RecurrencePattern, ActionableInstance, ActionableStatus, EntityType } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { List, ListItem, DbList, DbListItem, ListCategory, ListVisibility } from '@/types/list'

// Counter for generating unique IDs
let idCounter = 0
const generateId = (prefix: string) => `${prefix}-${++idCounter}`

/**
 * Reset the ID counter between tests
 */
export function resetIdCounter() {
  idCounter = 0
}

/**
 * Create a mock Task with sensible defaults
 */
export function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: generateId('task'),
    title: 'Test Task',
    completed: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    scheduledFor: undefined,
    deferredUntil: undefined,
    deferCount: undefined,
    isAllDay: undefined,
    context: undefined,
    notes: undefined,
    links: undefined,
    phoneNumber: undefined,
    contactId: undefined,
    assignedTo: undefined,
    projectId: undefined,
    ...overrides,
  }
}

/**
 * Create a mock DB task (snake_case format from Supabase)
 */
export function createMockDbTask(overrides: Partial<{
  id: string
  user_id: string
  title: string
  completed: boolean
  scheduled_for: string | null
  deferred_until: string | null
  defer_count: number | null
  is_all_day: boolean | null
  context: TaskContext | null
  notes: string | null
  links: (string | TaskLink)[] | null
  phone_number: string | null
  contact_id: string | null
  assigned_to: string | null
  project_id: string | null
  created_at: string
  updated_at: string
}> = {}) {
  return {
    id: generateId('task'),
    user_id: 'test-user-id',
    title: 'Test Task',
    completed: false,
    scheduled_for: null,
    deferred_until: null,
    defer_count: null,
    is_all_day: null,
    context: null,
    notes: null,
    links: null,
    phone_number: null,
    contact_id: null,
    assigned_to: null,
    project_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Create a mock Contact with sensible defaults
 */
export function createMockContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: generateId('contact'),
    name: 'Test Contact',
    phone: undefined,
    email: undefined,
    notes: undefined,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

/**
 * Create a mock DB contact (snake_case format from Supabase)
 */
export function createMockDbContact(overrides: Partial<{
  id: string
  user_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}> = {}) {
  return {
    id: generateId('contact'),
    user_id: 'test-user-id',
    name: 'Test Contact',
    phone: null,
    email: null,
    notes: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Create a mock Project with sensible defaults
 */
export function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: generateId('project'),
    name: 'Test Project',
    notes: undefined,
    parentId: undefined,
    status: 'active',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

/**
 * Create a mock DB project (snake_case format from Supabase)
 */
export function createMockDbProject(overrides: Partial<DbProject> = {}): DbProject {
  return {
    id: generateId('project'),
    user_id: 'test-user-id',
    name: 'Test Project',
    notes: null,
    parent_id: null,
    status: 'active' as ProjectStatus,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Create a mock Routine with sensible defaults
 */
export function createMockRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: generateId('routine'),
    user_id: 'test-user-id',
    name: 'Test Routine',
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    recurrence_pattern: { type: 'daily' } as RecurrencePattern,
    time_of_day: '09:00',
    raw_input: null,
    visibility: 'active',
    show_on_timeline: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Create a mock ActionableInstance
 */
export function createMockActionableInstance(overrides: Partial<ActionableInstance> = {}): ActionableInstance {
  return {
    id: generateId('instance'),
    user_id: 'test-user-id',
    entity_type: 'routine' as EntityType,
    entity_id: 'routine-1',
    date: '2024-01-01',
    status: 'pending' as ActionableStatus,
    assignee: null,
    assigned_to_override: null,
    deferred_to: null,
    completed_at: null,
    skipped_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Create a mock User
 */
export function createMockUser(overrides: Partial<{
  id: string
  email: string
  created_at: string
  app_metadata: Record<string, unknown>
  user_metadata: Record<string, unknown>
}> = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    created_at: '2024-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    role: 'authenticated',
    ...overrides,
  }
}

/**
 * Create a mock Supabase session
 */
export function createMockSession(overrides: Partial<{
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number
  token_type: string
  user: ReturnType<typeof createMockUser>
}> = {}) {
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: createMockUser(),
    ...overrides,
  }
}

/**
 * Create a mock FamilyMember
 */
export function createMockFamilyMember(overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id: generateId('family-member'),
    user_id: 'test-user-id',
    name: 'Test Member',
    initials: 'TM',
    color: 'blue',
    avatar_url: null,
    is_full_user: false,
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Create a mock List with sensible defaults
 */
export function createMockList(overrides: Partial<List> = {}): List {
  return {
    id: generateId('list'),
    title: 'Test List',
    icon: undefined,
    category: 'other' as ListCategory,
    visibility: 'self' as ListVisibility,
    hiddenFrom: undefined,
    sortOrder: 0,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

/**
 * Create a mock DB list (snake_case format from Supabase)
 */
export function createMockDbList(overrides: Partial<DbList> = {}): DbList {
  return {
    id: generateId('list'),
    user_id: 'test-user-id',
    title: 'Test List',
    icon: null,
    category: 'other' as ListCategory,
    visibility: 'self' as ListVisibility,
    hidden_from: null,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Create a mock ListItem with sensible defaults
 */
export function createMockListItem(overrides: Partial<ListItem> = {}): ListItem {
  return {
    id: generateId('list-item'),
    listId: 'list-1',
    text: 'Test Item',
    note: undefined,
    sortOrder: 0,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

/**
 * Create a mock DB list item (snake_case format from Supabase)
 */
export function createMockDbListItem(overrides: Partial<DbListItem> = {}): DbListItem {
  return {
    id: generateId('list-item'),
    user_id: 'test-user-id',
    list_id: 'list-1',
    text: 'Test Item',
    note: null,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}
