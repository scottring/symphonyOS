import type { DetectedAction } from '@/lib/actionDetection'
import { ActionIcon } from './ActionIcon'

interface ActionButtonProps {
  action: DetectedAction
  onOpenRecipe?: (url: string) => void
}

export function ActionButton({ action, onOpenRecipe }: ActionButtonProps) {
  const handleClick = () => {
    if (action.type === 'recipe' && action.url && onOpenRecipe) {
      onOpenRecipe(action.url)
      return
    }
    if (action.url) {
      window.open(action.url, '_blank', 'noopener,noreferrer')
    } else if (action.phoneNumber) {
      if (action.type === 'call') {
        window.location.href = `tel:${action.phoneNumber}`
      } else if (action.type === 'text') {
        window.location.href = `sms:${action.phoneNumber}`
      }
    }
  }

  const isPrimary = action.type === 'video-call' || action.type === 'recipe' || action.type === 'directions'

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-xl font-medium text-sm transition-all
        ${isPrimary
          ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-sm'
          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
        }
      `}
    >
      <ActionIcon type={action.icon} />
      <span>{action.label}</span>
    </button>
  )
}
