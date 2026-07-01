import {
  Check, ClipboardList, Calendar, StickyNote, SquareCheckBig, Repeat,
  Folder, User, Tag, SprayCan, Car, Volleyball, Phone, X, Plus, Flame,
  MessageCircle, Mail, MapPin, Paperclip, TriangleAlert, Clock, Sparkles,
  PartyPopper, Lightbulb, Video, type LucideIcon,
} from 'lucide-react'

export const CONCEPT_ICONS = {
  done: Check, list: ClipboardList, when: Calendar, note: StickyNote,
  task: SquareCheckBig, routine: Repeat, project: Folder, person: User,
  context: Tag, chore: SprayCan, errand: Car, activity: Volleyball,
  call: Phone, close: X, add: Plus, streak: Flame, discussion: MessageCircle,
  email: Mail, location: MapPin, attachment: Paperclip, warning: TriangleAlert,
  time: Clock, ai: Sparkles, celebration: PartyPopper, idea: Lightbulb,
  video: Video,
} satisfies Record<string, LucideIcon>

export type ConceptName = keyof typeof CONCEPT_ICONS

interface ConceptIconProps {
  name: ConceptName
  size?: number
  className?: string
  decorative?: boolean
  'aria-label'?: string
}

/** Single source of truth for chrome iconography. No emoji anywhere in chrome — use this. */
export function ConceptIcon({ name, size = 16, className, decorative, ...rest }: ConceptIconProps) {
  const Icon = CONCEPT_ICONS[name]
  const label = rest['aria-label'] ?? name
  return (
    <Icon
      size={size}
      className={`inline-block align-[-0.125em]${className ? ` ${className}` : ''}`}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
    />
  )
}
