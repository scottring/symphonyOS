// On a phone the step's header stands on the page, in the session area above
// the rail: the title, Next / Skip / Done, and Why, You, Guide behind
// "Explain". The conversation opens only from "Talk to the guide" (SessionBar)
// and still shows the full header on top. Desktop: nothing here; the header is
// above the conversation beside the page.
//
// It reads the session the page registered (GuidedSessionContext), so the
// buttons are the very ones the conversation's header carries.

import { cloneElement, isValidElement } from 'react'
import { useMobile } from '@/hooks/useMobile'
import { useGuidedSession } from '@/contexts/GuidedSessionContext'
import { GuideHeader, type GuideHeaderProps } from './GuideHeader'

export function GuidePhoneHeader() {
  const phone = useMobile()
  const session = useGuidedSession()
  const header = session?.header
  if (!phone || !isValidElement<GuideHeaderProps>(header) || header.type !== GuideHeader) return null
  return <div className="guide-session-header">{cloneElement(header, { compact: true })}</div>
}
