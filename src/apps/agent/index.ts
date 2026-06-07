import type { AppDef } from '@/shell/types'
import { AgentApp } from './AgentApp'

// Agent home (Michael briefing + chat). Self-contained; no selection kind.
export const agentAppDef: AppDef = {
  id: 'agent',
  route: '/agent',
  Component: AgentApp,
}
