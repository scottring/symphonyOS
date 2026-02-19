// Planning Workspace types

export type PlanningResourceType = 'note' | 'paste' | 'upload'

export interface PlanningResource {
  id: string
  title: string
  content: string | null
  resourceType: PlanningResourceType
  sourceUrl: string | null
  filePath: string | null
  fileName: string | null
  fileType: string | null
  fileSize: number | null
  tags: string[]
  sortOrder: number
  workspaceId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePlanningResourceInput {
  title: string
  content?: string
  resourceType?: PlanningResourceType
  sourceUrl?: string
  tags?: string[]
  workspaceId?: string
}

export interface UpdatePlanningResourceInput {
  title?: string
  content?: string
  sourceUrl?: string | null
  tags?: string[]
  workspaceId?: string | null
}

// Research Workspaces — topic-based collections of research for rule synthesis
export type WorkspaceStatus = 'active' | 'synthesized' | 'archived'

export interface ResearchWorkspace {
  id: string
  name: string
  description: string | null
  status: WorkspaceStatus
  lastSynthesizedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateWorkspaceInput {
  name: string
  description?: string
}

export interface UpdateWorkspaceInput {
  name?: string
  description?: string
  status?: WorkspaceStatus
}
