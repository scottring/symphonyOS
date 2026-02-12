import { useState, useRef, useEffect } from 'react'
import type { OnboardingPhaseId } from '@/types/manual'

const DEMO_ANSWERS: Record<OnboardingPhaseId, string[]> = {
  foundation: [
    "When we're at our best, everyone's laughing at the dinner table. The kids are telling us about their day, nobody's on a phone, and there's this easy warmth. We're curious about each other.",
    "Kindness is huge for us. We always say 'be kind first.' Also curiosity — we want our kids to ask questions and not be afraid of not knowing things. And honesty, even when it's hard.",
    "We're the family that takes the long way home. We'd rather have an adventure than be efficient. We also prioritize being together over activities.",
    "We never go to bed angry — that's non-negotiable. And we always show up for each other's things, even if it's inconvenient.",
    "Communication-wise, we try to talk things through but honestly we sometimes avoid the hard conversations. When things blow up, I'll usually be the one to come back and repair — say sorry, ask what happened.",
    "The biggest communication challenge is that we talk past each other when stressed. I want to fix it, my partner wants to be heard first. We're working on that.",
    "Our repair strategy is usually a cool-down period, then one of us will come back with 'can we try that again?' It works most of the time.",
    "I think we communicate pretty well about the kids but less well about our own relationship. That's something we want to get better at.",
  ],
  relationships: [
    "Pizza Friday is sacred — every Friday we make pizza together from scratch. The kids each get to design their own. It's been going since our oldest was 3.",
    "We do a family meeting every Sunday evening — just 15 minutes to go over the week ahead. It really helps everyone feel prepared. Bedtime reading is another ritual we love.",
    "Connection-wise, I think we're strong with family bonding but my partner and I need more couple time. Date nights happen maybe once a month when they should be weekly.",
    "The biggest challenge with connection is screen time eroding quality time. We'll be 'together' but everyone's on a device.",
    "For roles — I cook, she handles school logistics. Neither of us loves cleaning so we do that together on Saturdays. Finances are mostly me. Health decisions, she takes the lead.",
    "The pain point is the mental load. Even though we split tasks, one person carries most of the planning and anticipating. That creates resentment sometimes.",
    "Big decisions we make together — we have a rule that if one person feels strongly against something, we don't do it. Small stuff, whoever cares more decides.",
    "I think the roles are working pretty well overall, but we need to be more intentional about redistributing when things get unbalanced.",
  ],
  operations: [
    "Our mornings are chaos. Everyone's stressed, things get forgotten, and by the time we're out the door we're already drained. That's probably our biggest organizational failure.",
    "The kitchen is pretty well organized — we have systems for meal planning and grocery shopping. But the mudroom, the garage, the kids' rooms? Disaster zones.",
    "We've tried chore charts, apps, all of it. Nothing sticks for more than two weeks. We need a system that actually works for our family, not something designed for someone else's.",
    "Our laundry system is nonexistent — clean clothes live in baskets, nobody puts anything away. It drives me crazy but I haven't solved it.",
    "When things change — like a schedule disruption or unexpected event — I handle it fine but my partner gets really stressed. We cope differently and that creates friction.",
    "Our best coping strategy as a family is humor. When everything's going wrong, someone will crack a joke and it diffuses the tension. But we're not great at proactively planning for stress.",
    "Transitions are hard — Sunday to Monday, summer to school, any big change really. We need to build better bridges for those.",
    "The house itself could work for us if we set it up right. Right now it works against us — things don't have homes, papers pile up, visual clutter stresses everyone.",
  ],
  strategy: [
    "When we have a problem, we tend to talk about it... and talk about it... and talk about it. We're good at discussing but slow to actually decide and act.",
    "Conflict usually follows a pattern: tension builds, someone snaps, then we retreat to corners, then one of us extends an olive branch. We rarely deal with the root issue.",
    "We avoid talking about money until it becomes an emergency. That's probably our biggest blind spot.",
    "Time is our scarcest resource. Both of us work, kids have activities, and there's never enough margin. We say yes to too many things.",
    "We invest in experiences over things — that's a core principle. But we haven't been as deliberate about protecting family time from work creep.",
    "Energy management is something we've never really discussed. But it matters — by Friday we're running on fumes and that's when conflicts happen.",
    "I think we need a better system for making decisions. Right now it's all ad hoc and whoever pushes hardest wins. That's not sustainable.",
    "Our financial principle is save first, but in practice we're not doing that. There's a gap between what we say we value and what our spending shows.",
  ],
}

interface ResponseInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
  phaseId?: OnboardingPhaseId
  turnCount?: number
}

export function ResponseInput({ onSend, disabled, placeholder = 'Share your thoughts...', phaseId, turnCount = 0 }: ResponseInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }
  }, [text])

  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus()
    }
  }, [disabled])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || disabled) return
    onSend(text.trim())
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleDemoFill = () => {
    if (!phaseId) return
    const answers = DEMO_ANSWERS[phaseId]
    const userTurnIndex = Math.floor(turnCount / 2)
    const answer = answers[userTurnIndex % answers.length]
    onSend(answer)
  }

  const isDev = import.meta.env.DEV

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      {isDev && phaseId && (
        <button
          type="button"
          onClick={handleDemoFill}
          disabled={disabled}
          className="px-3 py-3 bg-amber-100 text-amber-800 rounded-xl hover:bg-amber-200 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 text-xs font-medium"
          title="Fill demo answer"
        >
          Demo
        </button>
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="flex-1 px-4 py-3 border border-stone-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-transparent disabled:opacity-50 text-[15px] leading-relaxed"
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        className="px-4 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.11 28.11 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.11 28.11 0 0 0 3.105 2.288Z" />
        </svg>
      </button>
    </form>
  )
}
