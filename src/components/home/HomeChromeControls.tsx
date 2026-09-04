import { Sparkles } from 'lucide-react'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'
import { useAppShellChrome } from '@/contexts/AppShellChromeContext'

/**
 * The page chrome that used to sit alone in HomeHeader's right corner: the
 * domain chooser and the assistant toggle.
 *
 * Today has no HomeHeader any more — its day card IS the masthead — so these
 * two travel into the card's top-right instead of floating above it. Week and
 * Month still render them from HomeHeader, which is why this is a component
 * and not inlined in either place.
 */
export function HomeChromeControls({ className = '' }: { className?: string }) {
  const { chatOpen, onChatOpenChange } = useAppShellChrome()

  return (
    <div className={`items-center gap-2 ${className}`}>
      <DomainSwitcher />
      <button
        onClick={() => onChatOpenChange(!chatOpen)}
        className={`w-9 h-9 rounded-full bg-bg-elevated border border-neutral-200 text-neutral-500 hover:text-primary-500 hover:border-primary-300 transition-all grid place-items-center shadow-card ${
          chatOpen ? 'ring-2 ring-primary-500/30 text-primary-500 border-primary-500' : ''
        }`}
        aria-label="AI chat"
        title="AI chat"
      >
        <Sparkles className="w-4 h-4" />
      </button>
    </div>
  )
}
