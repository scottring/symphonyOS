import { AgentHomeView } from '@/components/agent/AgentHomeView'

/**
 * Agent surface, mounted by the Shell at /agent. Mirrors the legacy ViewRouter
 * `agent` branch (which was state-based, activeView==='agent', no URL).
 *
 * AgentHomeView is self-contained — it sources its briefing + chat state from
 * useAgentBriefing / useAgentChat internally, so there are no props to wire.
 */
export function AgentApp() {
  return <AgentHomeView />
}
