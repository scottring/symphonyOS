import { MealChatRail } from './MealChatRail'
import type { ChatMsg } from '@/hooks/useMealPlannerChat'

export interface MealChatSheetProps {
  isOpen: boolean
  onClose: () => void
  messages: ChatMsg[]
  busy: boolean
  toolActivity: string | null
  onSend: (text: string) => void
}

/** Mobile bottom sheet for meal-planning chat — same scrim + rounded-t-2xl +
 *  translate-y + safe-area-bottom skeleton as `layout/MoreSheet.tsx`. */
export function MealChatSheet({ isOpen, onClose, messages, busy, toolActivity, onSend }: MealChatSheetProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-bg-elevated rounded-t-2xl
          transform transition-transform duration-300 ease-out flex flex-col
          ${isOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'}
        `}
        style={{ height: '72vh', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>

        <MealChatRail
          messages={messages}
          busy={busy}
          toolActivity={toolActivity}
          onSend={onSend}
        />
      </div>
    </>
  )
}
