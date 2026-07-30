import { ContextChips } from '@/components/context/ContextChips'

interface PanelAssistantProps {
  taskId: string
  onOpenGuidedChat?: (entityType: 'task' | 'contact' | 'project' | 'event', entityId: string, entityName: string, prompt?: string) => void
}

// Thin wrapper: suggestions are actions, so they sit beside the action row
// (above Why/notes) rather than getting a labeled section of their own.
// ContextChips returns null when there's nothing to show, so this renders
// nothing in that case too — no empty section, no heading.
export function PanelAssistant({ taskId, onOpenGuidedChat }: PanelAssistantProps) {
  return <ContextChips entityType="task" entityId={taskId} variant="panel" onOpenGuidedChat={onOpenGuidedChat} />
}
