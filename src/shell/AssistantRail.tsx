// src/shell/AssistantRail.tsx
//
// The single assistant rail host. Renders on EVERY route — no pathname check,
// no selection check. Previously this lived in two places (Shell.tsx's
// ShellAssistantHost for desktop-Today, ShellLayout.tsx's rail for everything
// else), each with its own conversation; navigating swapped which one you saw.
//
// Layout: the detail panes each hardcode `fixed right-0` at their own width,
// so the rail is the thing that moves — it offsets left by the active pane's
// width (useDetailPaneWidth) and the panes never budge.

import { useEffect, useRef, useState } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { NoteViewer } from '@/components/chat/NoteViewer'
import { useAssistant } from '@/contexts/AssistantContext'
import { useAssistantLaunchRequests } from '@/contexts/AssistantLaunchContext'
import { useMobile } from '@/hooks/useMobile'
import { useDetailPaneWidth } from './useDetailPaneWidth'
import { ASSISTANT_RAIL_WIDTH } from './railLayout'
import type { AppRegistry } from './appRegistry'

export function AssistantRail({ registry }: { registry: AppRegistry }) {
  const assistant = useAssistant()
  const { open, setOpen } = assistant
  const isMobile = useMobile()
  const detailWidth = useDetailPaneWidth(registry)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)

  // Programmatic launches (unibox "Ask Symphony", Add-to-today, plan cards).
  // One listener now, so there is no "which host owns this" arbitration — and
  // no risk of two hosts both sending the same seed.
  const { nonce, consumeSeed } = useAssistantLaunchRequests()
  const seenNonce = useRef(0)
  useEffect(() => {
    if (nonce === 0 || nonce === seenNonce.current) return
    seenNonce.current = nonce
    setOpen(true)
    const seed = consumeSeed()
    if (seed && seed.autoSend !== false) void assistant.sendMessage(seed.message)
  }, [nonce, consumeSeed, assistant, setOpen])

  const panel = (
    <ChatPanel
      messages={assistant.messages}
      loading={assistant.loading}
      error={assistant.error}
      entityContext={null}
      mode="chat"
      onSend={assistant.sendMessage}
      onClear={assistant.resetSession}
      onClose={() => setOpen(false)}
      onNewChat={assistant.resetSession}
      onSourceClick={setActiveNoteId}
      toolActivity={assistant.toolActivity}
      sessions={assistant.sessions}
      sessionsLoading={assistant.sessionsLoading}
      onLoadSession={assistant.loadSession}
      onDeleteSession={assistant.deleteSession}
      activeSessionId={assistant.activeSessionId}
    />
  )

  const note = activeNoteId ? (
    <NoteViewer key={activeNoteId} noteId={activeNoteId} onClose={() => setActiveNoteId(null)} />
  ) : null

  if (isMobile) {
    if (!open) return null
    return (
      <>
        <div
          className="fixed inset-0 z-50 bg-bg-elevated"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {panel}
        </div>
        {note}
      </>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Show Symphony AI"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-10 bg-bg-elevated border border-neutral-200 rounded-l-lg px-1.5 py-3 text-neutral-400 hover:text-neutral-600 shadow-card transition-colors"
      >
        <PanelRightOpen size={16} />
      </button>
    )
  }

  return (
    <>
      <aside
        className="fixed top-0 bottom-0 z-10 bg-bg-elevated border-l border-neutral-200/80 shadow-xl transition-[right] duration-300 ease-in-out"
        style={{ right: `${detailWidth}px`, width: `${ASSISTANT_RAIL_WIDTH}px` }}
        aria-label="Symphony AI"
      >
        {panel}
      </aside>
      {note}
    </>
  )
}
