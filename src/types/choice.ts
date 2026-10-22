export type OptionStatus = 'considering' | 'contacted' | 'heard_back' | 'ruled_out' | 'chosen'
export const OPTION_STATUSES: readonly OptionStatus[] = ['considering', 'contacted', 'heard_back', 'ruled_out', 'chosen']
export const STATUS_LABEL: Record<OptionStatus, string> = {
  considering: 'Considering',
  contacted: 'Contacted',
  heard_back: 'Heard back',
  ruled_out: 'Ruled out',
  chosen: 'Chosen',
}

export type ColumnKind = 'text' | 'money' | 'date' | 'yesno'
export interface ChoiceColumn { id: string; label: string; kind: ColumnKind }
export interface WorkPiece { id: string; label: string; description?: string }
export type GoalRef = { kind: 'task'; id: string } | { kind: 'goal'; id: string }
export type CellValue = string | number | boolean | null

export interface Choice {
  id: string
  userId: string
  goal: GoalRef
  title: string
  status: 'open' | 'decided'
  chosenOptionId?: string
  decidedAt?: Date
  decidedNote?: string
  decidedWork: string[]
  decidedAmountCents?: number
  columns: ChoiceColumn[]
  work: WorkPiece[]
  selectedWork: string[]
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface ChoiceOption {
  id: string
  choiceId: string
  userId: string
  name: string
  contactId?: string
  status: OptionStatus
  statusChangedAt: Date
  values: Record<string, CellValue>
  notes?: string
  sortOrder: number
  updatedAt: Date
}

export interface PriceLine {
  id: string
  optionId: string
  workIds: string[]
  amountCents: number
  note?: string
  sortOrder: number
}

export interface FollowUp {
  taskId: string
  optionId: string
  title: string
  scheduledFor?: Date
  completed: boolean
  waitingSince?: Date
}

export interface DbChoice {
  id: string
  user_id: string
  goal_task_id: string | null
  goal_id: string | null
  title: string
  status: 'open' | 'decided'
  chosen_option_id: string | null
  decided_at: string | null
  decided_note: string | null
  decided_work: string[]
  decided_amount_cents: number | string | null
  columns: ChoiceColumn[]
  work: WorkPiece[]
  selected_work: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DbChoiceOption {
  id: string
  choice_id: string
  user_id: string
  name: string
  contact_id: string | null
  status: OptionStatus
  status_changed_at: string
  values: Record<string, CellValue>
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DbPriceLine {
  id: string
  option_id: string
  user_id: string
  work_ids: string[]
  amount_cents: number | string
  note: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export function dbChoiceToChoice(row: DbChoice): Choice {
  return {
    id: row.id,
    userId: row.user_id,
    goal: row.goal_task_id
      ? { kind: 'task', id: row.goal_task_id }
      : { kind: 'goal', id: row.goal_id as string },
    title: row.title,
    status: row.status,
    chosenOptionId: row.chosen_option_id ?? undefined,
    decidedAt: row.decided_at ? new Date(row.decided_at) : undefined,
    decidedNote: row.decided_note ?? undefined,
    decidedWork: row.decided_work ?? [],
    decidedAmountCents: row.decided_amount_cents == null ? undefined : Number(row.decided_amount_cents),
    columns: row.columns ?? [],
    work: row.work ?? [],
    selectedWork: row.selected_work ?? [],
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function dbOptionToOption(row: DbChoiceOption): ChoiceOption {
  return {
    id: row.id,
    choiceId: row.choice_id,
    userId: row.user_id,
    name: row.name,
    contactId: row.contact_id ?? undefined,
    status: row.status,
    statusChangedAt: new Date(row.status_changed_at),
    values: row.values ?? {},
    notes: row.notes ?? undefined,
    sortOrder: row.sort_order,
    updatedAt: new Date(row.updated_at),
  }
}

export function dbLineToLine(row: DbPriceLine): PriceLine {
  return {
    id: row.id,
    optionId: row.option_id,
    workIds: row.work_ids ?? [],
    amountCents: Number(row.amount_cents),
    note: row.note ?? undefined,
    sortOrder: row.sort_order,
  }
}
