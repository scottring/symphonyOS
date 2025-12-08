import { Pin } from 'lucide-react'
import { type PinnableEntityType } from '@/types/pin'

interface PinButtonProps {
  entityType: PinnableEntityType
  entityId: string
  isPinned: boolean
  canPin: boolean
  onPin: () => Promise<boolean>
  onUnpin: () => Promise<boolean>
  size?: 'sm' | 'md'
  onMaxPinsReached?: () => void
}

export function PinButton({
  isPinned,
  canPin,
  onPin,
  onUnpin,
  size = 'md',
  onMaxPinsReached,
}: PinButtonProps) {
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (isPinned) {
      await onUnpin()
    } else {
      if (!canPin) {
        onMaxPinsReached?.()
        return
      }
      await onPin()
    }
  }

  const sizeClasses = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const buttonPadding = size === 'sm' ? 'p-1' : 'p-1.5'

  return (
    <button
      onClick={handleClick}
      className={`
        ${buttonPadding} rounded-lg transition-all duration-200
        ${isPinned
          ? 'text-primary-600 hover:text-primary-700 hover:bg-primary-50'
          : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }
      `}
      title={isPinned ? 'Unpin' : canPin ? 'Pin for quick access' : 'Unpin something first (max 7)'}
    >
      <Pin 
        className={sizeClasses} 
        fill={isPinned ? 'currentColor' : 'none'}
      />
    </button>
  )
}
